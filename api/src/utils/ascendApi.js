const pool = require("../db/pool");

const RAPIDAPI_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";

// Shared by api/src/routes/ascendApi.js (admin diagnostic passthrough) and
// api/src/routes/exerciseSearch.js (the real coach-facing search/import
// feature) - factored out once both needed the same key lookup + fetch
// wrapper rather than duplicating it a second time.
async function getAscendApiKey() {
  const { rows } = await pool.query(
    `SELECT value FROM nk_settings WHERE key = 'ascendapi_key'`
  );
  const apiKey = rows[0]?.value || process.env.ASCENDAPI_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error(
        "AscendAPI isn't configured yet - ask an admin to add a key under More > Configuration > AscendAPI key."
      ),
      { status: 400 }
    );
  }
  return apiKey;
}

async function ascendApiRequest(path, query) {
  const apiKey = await getAscendApiKey();
  const url = new URL(`https://${RAPIDAPI_HOST}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": apiKey,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message || `AscendAPI request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return body;
}

module.exports = { RAPIDAPI_HOST, getAscendApiKey, ascendApiRequest };
