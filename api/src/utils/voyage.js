const pool = require("../db/pool");

// voyage-multimodal-3 embeds text and images into the same vector space
// (1024 dimensions) - one model/pipeline covers every source_type this
// knowledge base supports, rather than a separate text embedder plus a
// separate image embedder with two incompatible vector spaces.
const VOYAGE_MODEL = "voyage-multimodal-3";
const EMBEDDING_DIMENSION = 1024;
const API_BASE = "https://api.voyageai.com/v1";

// Shared by api/src/routes/knowledgeBase.js and api/src/routes/settings.js
// (the "test connection" check) - same shape as
// api/src/utils/ascendApi.js's getAscendApiKey().
async function getVoyageApiKey() {
  const { rows } = await pool.query(
    `SELECT value FROM nk_settings WHERE key = 'voyage_api_key'`
  );
  const apiKey = rows[0]?.value || process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error(
        "Voyage AI isn't configured yet - ask an admin to add a key under More > Configuration > Voyage AI key."
      ),
      { status: 400 }
    );
  }
  return apiKey;
}

async function voyageRequest(path, body) {
  const apiKey = await getVoyageApiKey();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const responseBody = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      responseBody?.detail || `Voyage AI request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return responseBody;
}

// Embeds a batch of plain-text strings in one request. `inputType` is
// "document" when embedding content going INTO the store and "query"
// when embedding a search query - Voyage's asymmetric models expect this
// distinction for best retrieval quality. Returns embeddings in the same
// order as `texts`.
async function embedTexts(texts, inputType = "document") {
  const body = await voyageRequest("/multimodalembeddings", {
    model: VOYAGE_MODEL,
    input_type: inputType,
    inputs: texts.map((text) => ({ content: [{ type: "text", text }] })),
  });
  return body.data.map((d) => d.embedding);
}

// Embeds a single image, referenced by URL - Voyage fetches it directly
// rather than this app having to download and base64-encode it first.
async function embedImage(imageUrl) {
  const body = await voyageRequest("/multimodalembeddings", {
    model: VOYAGE_MODEL,
    input_type: "document",
    inputs: [{ content: [{ type: "image_url", image_url: imageUrl }] }],
  });
  return body.data[0].embedding;
}

// pgvector has no native `pg` type support - an embedding array has to be
// formatted as a Postgres vector literal string and cast on the way in,
// rather than pulling in the `pgvector` npm package for one string.
function toSqlVector(embedding) {
  return `[${embedding.join(",")}]`;
}

module.exports = {
  VOYAGE_MODEL,
  EMBEDDING_DIMENSION,
  getVoyageApiKey,
  embedTexts,
  embedImage,
  toSqlVector,
};
