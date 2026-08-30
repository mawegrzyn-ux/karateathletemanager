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

// Shared by api/src/routes/exerciseSearch.js (the coach-facing search UI
// in Training modules) and api/src/mcp/tools.js (Osu's search_exercises/
// get_exercise_details tools) - one normalization so the two surfaces
// can't drift apart on field names.
function normalizeExerciseListItem(e) {
  return {
    exerciseId: e.exerciseId,
    name: (e.name || "").trim(),
    imageUrl: e.imageUrl ?? null,
    bodyParts: Array.isArray(e.bodyParts) ? e.bodyParts : [],
    equipments: Array.isArray(e.equipments) ? e.equipments : [],
    exerciseType: e.exerciseType ?? null,
  };
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Maps one AscendAPI exercise detail onto name/explanation/video_url/
// image_url - the exact shape a training-module exercise item (or Osu's
// create_training_session item) already has, so both callers can hand
// this straight through rather than each doing their own translation.
// explanation is built as the same small rich-text HTML subset every
// exercise explanation uses (see RICH_TEXT_ALLOWED_TAGS in ui.tsx) - a
// <p> overview followed by an <ol> of numbered steps - rather than
// "\n"-joined plain text, so it renders as a real formatted list instead
// of one run-on paragraph once the frontend stopped preserving literal
// newlines in favor of rich text. Each piece of API-sourced text is
// escaped since it's third-party content landing straight in HTML.
function normalizeExerciseDetail(d) {
  const instructions = Array.isArray(d.instructions) ? d.instructions : [];
  const explanationParts = [];
  if (d.overview) {
    explanationParts.push(`<p>${escapeHtml(String(d.overview).trim())}</p>`);
  }
  if (instructions.length > 0) {
    explanationParts.push(
      `<ol>${instructions.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
    );
  }
  return {
    name: (d.name || "").trim(),
    explanation: explanationParts.join("") || null,
    video_url: d.videoUrl ?? null,
    image_url: d.imageUrls?.["720p"] ?? d.imageUrl ?? null,
  };
}

module.exports = {
  RAPIDAPI_HOST,
  getAscendApiKey,
  ascendApiRequest,
  normalizeExerciseListItem,
  normalizeExerciseDetail,
};
