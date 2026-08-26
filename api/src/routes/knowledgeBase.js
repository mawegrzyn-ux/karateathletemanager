const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { Router } = require("express");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const cheerio = require("cheerio");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { getS3Config, publicUrlFor } = require("../utils/s3");
const { embedTexts, embedImage, toSqlVector } = require("../utils/voyage");
const { chunkText, searchKnowledgeBase } = require("../utils/knowledgeBase");

const router = Router();

// Coach/admin manage this content library - matches Training Modules'
// convention (authorize("coach")), not self-service like an athlete's
// own posts/kata log.
router.use(authorize("coach"));

const MIME_TO_SOURCE_TYPE = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
  "text/html": "html",
};

function sourceTypeForMime(mimetype) {
  if (MIME_TO_SOURCE_TYPE[mimetype]) return MIME_TO_SOURCE_TYPE[mimetype];
  if (mimetype.startsWith("image/")) return "image";
  return null;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB, matches uploads.js's cap

// A separate multer instance from uploads.js's - memoryStorage (not
// ConfigurableStorage's streaming-to-disk-or-S3) since text extraction
// (pdf-parse/mammoth/cheerio) needs the raw buffer in-process, and
// documents are small enough that buffering is simpler than streaming.
// The buffer still ends up on local disk or S3 via persistBuffer below,
// just as a separate explicit step once extraction has already happened.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ok = sourceTypeForMime(file.mimetype) !== null;
    cb(ok ? null : new Error("Only PDF, Word, text, HTML, or image files are allowed"), ok);
  },
});

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

// Same local-disk-or-S3 choice as uploads.js's ConfigurableStorage, just
// buffer-based instead of stream-based - writes into the same physical
// UPLOADS_DIR that uploads.js's express.static("/files") already serves,
// so a locally-stored document is reachable at the same
// /api/uploads/files/:filename URL shape without a second static route.
async function persistBuffer(buffer, originalName, mimetype) {
  const ext = path.extname(originalName).toLowerCase();
  const filename = `${crypto.randomUUID()}${ext}`;
  const s3 = await getS3Config();
  if (!s3) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);
    return `/api/uploads/files/${filename}`;
  }
  const client = new S3Client({
    region: s3.region,
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: filename,
      Body: buffer,
      ContentType: mimetype,
    })
  );
  return publicUrlFor(s3, filename);
}

// Returns plain text for anything text-bearing; null for an image (no
// text extraction attempted - see the migration's comment on why images
// embedded inside a document are out of scope).
async function extractText(sourceType, buffer) {
  if (sourceType === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const { text } = await parser.getText();
      // Strips pdf-parse's own "-- N of M --" page-separator lines - noise
      // in a chunk/preview, not real document content.
      return text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim();
    } finally {
      await parser.destroy();
    }
  }
  if (sourceType === "docx") return (await mammoth.extractRawText({ buffer })).value;
  if (sourceType === "text") return buffer.toString("utf-8");
  if (sourceType === "html") {
    return cheerio.load(buffer.toString("utf-8"))("body").text().replace(/\s+/g, " ").trim();
  }
  return null;
}

async function extractLinkText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw Object.assign(new Error(`Couldn't fetch that link (${res.status})`), { status: 400 });
  }
  const html = await res.text();
  return cheerio.load(html)("body").text().replace(/\s+/g, " ").trim();
}

const DOCUMENT_FIELDS = `id, title, source_type, source_url, raw_text, status, error_message, created_at`;

router.get(
  "/documents",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.source_type, d.source_url, d.raw_text, d.status,
              d.error_message, d.created_at, COUNT(c.id)::int AS chunk_count
       FROM nk_kb_documents d
       LEFT JOIN nk_kb_chunks c ON c.document_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at DESC`
    );
    res.json({ documents: rows });
  })
);

router.post(
  "/documents",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: { message: err.message } });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    let sourceType, sourceUrl, title, rawText;
    try {
      if (req.file) {
        sourceType = sourceTypeForMime(req.file.mimetype);
        title = (req.body.title || "").trim() || req.file.originalname;
        sourceUrl = await persistBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
        rawText = await extractText(sourceType, req.file.buffer);
      } else {
        const { source_type, source_url, title: bodyTitle } = req.body ?? {};
        if (source_type !== "link" || !source_url?.trim()) {
          return res.status(400).json({ error: { message: "A file or a link is required" } });
        }
        sourceType = "link";
        sourceUrl = source_url.trim();
        title = (bodyTitle || "").trim() || sourceUrl;
        rawText = await extractLinkText(sourceUrl);
      }
    } catch (err) {
      return res.status(400).json({
        error: { message: err instanceof Error ? err.message : "Failed to process that source" },
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO nk_kb_documents (title, source_type, source_url, raw_text, uploaded_by_user_id, status)
         VALUES ($1, $2, $3, $4, $5, 'ready')
         RETURNING id`,
        [title, sourceType, sourceUrl, rawText, req.user.id]
      );
      const documentId = rows[0].id;
      let chunkCount = 0;

      if (sourceType === "image") {
        const embedding = await embedImage(sourceUrl);
        await client.query(
          `INSERT INTO nk_kb_chunks (document_id, chunk_index, image_url, embedding)
           VALUES ($1, 0, $2, $3::vector)`,
          [documentId, sourceUrl, toSqlVector(embedding)]
        );
        chunkCount = 1;
      } else {
        const chunks = chunkText(rawText || "");
        if (chunks.length > 0) {
          const embeddings = await embedTexts(chunks, "document");
          for (let i = 0; i < chunks.length; i++) {
            await client.query(
              `INSERT INTO nk_kb_chunks (document_id, chunk_index, content, embedding)
               VALUES ($1, $2, $3, $4::vector)`,
              [documentId, i, chunks[i], toSqlVector(embeddings[i])]
            );
          }
          chunkCount = chunks.length;
        }
      }

      await client.query("COMMIT");
      const { rows: hydrated } = await pool.query(
        `SELECT ${DOCUMENT_FIELDS} FROM nk_kb_documents WHERE id = $1`,
        [documentId]
      );
      // chunk_count isn't a real column (see the GROUP BY/COUNT in GET
      // /documents) - attached here too so a freshly-created row has the
      // same shape the list endpoint returns, rather than showing up
      // blank until the next reload.
      res.status(201).json({ document: { ...hydrated[0], chunk_count: chunkCount } });
    } catch (err) {
      await client.query("ROLLBACK");
      const { rows: failed } = await pool.query(
        `INSERT INTO nk_kb_documents
           (title, source_type, source_url, raw_text, uploaded_by_user_id, status, error_message)
         VALUES ($1, $2, $3, $4, $5, 'failed', $6)
         RETURNING ${DOCUMENT_FIELDS}`,
        [
          title,
          sourceType,
          sourceUrl,
          rawText,
          req.user.id,
          err instanceof Error ? err.message : "Failed to generate embeddings",
        ]
      );
      res.status(201).json({ document: { ...failed[0], chunk_count: 0 } });
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/documents/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM nk_kb_documents WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Document not found" } });
    }
    res.status(204).end();
  })
);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ results: [] });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const results = await searchKnowledgeBase(q, limit);
    res.json({ results });
  })
);

module.exports = router;
