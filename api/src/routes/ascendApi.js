const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();
router.use(authorize.requireAdmin);

const RAPIDAPI_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";

async function getAscendApiKey() {
  const { rows } = await pool.query(
    `SELECT value FROM nk_settings WHERE key = 'ascendapi_key'`
  );
  const apiKey = rows[0]?.value || process.env.ASCENDAPI_KEY;
  if (!apiKey) {
    throw new Error("AscendAPI isn't configured yet - add an API key above first.");
  }
  return apiKey;
}

async function ascendApiRequest(path, query) {
  const apiKey = await getAscendApiKey();
  const url = new URL(`https://${RAPIDAPI_HOST}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
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

// Temporary, admin-only raw-passthrough endpoints (see docs/ARCHITECTURE.md's
// AscendAPI bullet) - the real integration is a search-and-import picker in
// the Training modules exercise form, but that needs the upstream response
// shape confirmed first, and this sandbox's outbound network can't reach
// RapidAPI directly. These exist so admin/AscendApiKey.tsx's "Test
// connection" panel can hit each endpoint from the deployed app itself and
// show the raw JSON - once the real field names are confirmed this file
// gets replaced by a normalized /exercise-search endpoint.
function registerPassthrough(path, upstreamPath) {
  router.get(
    path,
    asyncHandler(async (req, res) => {
      try {
        const body = await ascendApiRequest(upstreamPath, req.query);
        res.json(body);
      } catch (err) {
        res.status(err.status ?? 502).json({ error: { message: err.message } });
      }
    })
  );
}

registerPassthrough("/bodyparts", "/api/v1/bodyparts");
registerPassthrough("/equipments", "/api/v1/equipments");
registerPassthrough("/muscles", "/api/v1/muscles");
registerPassthrough("/exercisetypes", "/api/v1/exercisetypes");
registerPassthrough("/exercises", "/api/v1/exercises");

// The /exercises list projection only carries imageUrl (a still frame) -
// no video/instructions field. Guessing this is a per-exercise detail
// endpoint (REST-conventional path using the real exerciseId values the
// list now confirmed, e.g. exr_41n2ha5iPFpN3hEJ) that might carry the
// richer fields the AscendAPI marketing page mentions (video, step-by-
// step instructions). Unconfirmed - if the path is wrong this just
// surfaces AscendAPI's own error message via the same try/catch as the
// other passthroughs.
router.get(
  "/exercises/:exerciseId",
  asyncHandler(async (req, res) => {
    try {
      const body = await ascendApiRequest(
        `/api/v1/exercises/${encodeURIComponent(req.params.exerciseId)}`,
        req.query
      );
      res.json(body);
    } catch (err) {
      res.status(err.status ?? 502).json({ error: { message: err.message } });
    }
  })
);

module.exports = router;
