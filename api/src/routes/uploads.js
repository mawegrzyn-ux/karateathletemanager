const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Router } = require("express");
const multer = require("multer");
const express = require("express");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { getS3Config, publicUrlFor } = require("../utils/s3");

const router = Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Checks S3 config per-upload (not once at startup) so an admin turning
// it on/off in the settings UI (More > Configuration > S3 storage) takes
// effect immediately, no redeploy - same pattern as every other optional
// integration in this app. Falls back to the local disk exactly as
// before when S3 isn't (fully) configured, so a fresh install with no
// AWS setup yet still works out of the box.
class ConfigurableStorage {
  _handleFile(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${crypto.randomUUID()}${ext}`;

    getS3Config()
      .then(async (s3) => {
        if (!s3) {
          const destPath = path.join(UPLOADS_DIR, filename);
          const outStream = fs.createWriteStream(destPath);
          file.stream.on("error", cb);
          outStream.on("error", cb);
          file.stream.pipe(outStream);
          outStream.on("finish", () =>
            cb(null, { url: `/api/uploads/files/${filename}`, path: destPath })
          );
          return;
        }

        const client = new S3Client({
          region: s3.region,
          credentials: {
            accessKeyId: s3.accessKeyId,
            secretAccessKey: s3.secretAccessKey,
          },
        });
        // Streamed multipart upload (not buffered into memory first) -
        // matters here since videos can be up to MAX_FILE_SIZE. No ACL
        // is set: modern S3 buckets have object ACLs disabled by
        // default (Object Ownership: Bucket owner enforced), so public
        // read has to come from the bucket's own policy instead - see
        // docs/ARCHITECTURE.md's S3 storage bullet for that policy JSON.
        const s3Upload = new Upload({
          client,
          params: {
            Bucket: s3.bucket,
            Key: filename,
            Body: file.stream,
            ContentType: file.mimetype,
          },
        });
        await s3Upload.done();
        cb(null, { url: publicUrlFor(s3, filename) });
      })
      .catch(cb);
  }

  _removeFile(req, file, cb) {
    if (file.path) {
      fs.unlink(file.path, () => cb(null));
    } else {
      cb(null);
    }
  }
}

const upload = multer({
  storage: new ConfigurableStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_MIME_PREFIXES.some((prefix) =>
      file.mimetype.startsWith(prefix)
    );
    cb(ok ? null : new Error("Only image, video, or audio files are allowed"), ok);
  },
});

// A pending, not-yet-approved user (e.g. a fresh club join-link
// registrant) must still be able to upload their own avatar before a
// coach/admin has processed them, so this router uses the lenient
// authenticated-only gate rather than authorize()'s active-status check.
router.use(authorize.authenticated);

router.use("/files", express.static(UPLOADS_DIR));

router.post(
  "/",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: { message: err.message } });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: { message: "No file uploaded" } });
    }
    res.status(201).json({ url: req.file.url });
  })
);

module.exports = router;
