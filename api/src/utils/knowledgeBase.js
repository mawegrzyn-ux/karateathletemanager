const pool = require("../db/pool");
const { embedTexts, toSqlVector } = require("./voyage");

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 100;

// Osu's per-chunk context budget - osu.js's tool loop does no truncation
// or compaction of its own (non-streaming, a flat max_tokens, raw
// JSON.stringify'd tool results), so a chunk has to be capped here before
// it ever reaches that loop, not there.
const MAX_RESULT_CHUNK_CHARS = 800;
const DEFAULT_SEARCH_LIMIT = 5;

// Simple fixed-size character chunking with overlap - no semantic/
// sentence-aware splitting for v1, just enough that a long document
// doesn't become one unsearchable embedding.
function chunkText(text, { size = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + size, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end === trimmed.length) break;
    start = end - overlap;
  }
  return chunks;
}

// Shared by GET /kb/search (the admin test-search panel) and Osu's
// search_knowledge_base tool - one implementation so the two surfaces
// can't drift on ranking or truncation behavior.
async function searchKnowledgeBase(query, limit = DEFAULT_SEARCH_LIMIT) {
  const [embedding] = await embedTexts([query], "query");
  const { rows } = await pool.query(
    `SELECT c.content, c.image_url, d.title, d.source_url, d.source_type,
            c.embedding <=> $1::vector AS distance
     FROM nk_kb_chunks c
     JOIN nk_kb_documents d ON d.id = c.document_id
     WHERE d.status = 'ready'
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [toSqlVector(embedding), limit]
  );
  return rows.map((row) => ({
    title: row.title,
    content: row.content ? row.content.slice(0, MAX_RESULT_CHUNK_CHARS) : null,
    image_url: row.image_url,
    source_url: row.source_url,
    source_type: row.source_type,
  }));
}

module.exports = {
  chunkText,
  searchKnowledgeBase,
  MAX_RESULT_CHUNK_CHARS,
  DEFAULT_SEARCH_LIMIT,
};
