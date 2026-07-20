const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();
router.use(authorize.requireAdmin);

router.get(
  "/branding-icon",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT value FROM nk_settings WHERE key = 'branding_icon_url'`
    );
    res.json({ url: rows[0]?.value ?? null });
  })
);

router.patch(
  "/branding-icon",
  asyncHandler(async (req, res) => {
    const { url } = req.body ?? {};
    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: { message: "url is required" } });
    }

    await pool.query(
      `INSERT INTO nk_settings (key, value, updated_at)
       VALUES ('branding_icon_url', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [url]
    );
    res.json({ url });
  })
);

// GET/PATCH/DELETE triple for a secret stored in nk_settings. Never echoed
// back to the client once saved - GET only reports whether one is
// configured (from nk_settings or, as a fallback for keys that started
// life as an .env-only setting, process.env), so the admin UI can offer a
// setup form without needing to display or re-enter a live secret.
function registerSecretRoutes(path, settingsKey, envFallback) {
  router.get(
    path,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT value FROM nk_settings WHERE key = $1`,
        [settingsKey]
      );
      const configured = !!(rows[0]?.value || (envFallback && process.env[envFallback]));
      res.json({ configured });
    })
  );

  router.patch(
    path,
    asyncHandler(async (req, res) => {
      const { api_key } = req.body ?? {};
      if (typeof api_key !== "string" || !api_key.trim()) {
        return res.status(400).json({ error: { message: "api_key is required" } });
      }

      await pool.query(
        `INSERT INTO nk_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [settingsKey, api_key.trim()]
      );
      res.json({ configured: true });
    })
  );

  router.delete(
    path,
    asyncHandler(async (req, res) => {
      await pool.query(`DELETE FROM nk_settings WHERE key = $1`, [settingsKey]);
      const configured = !!(envFallback && process.env[envFallback]);
      res.json({ configured });
    })
  );
}

// Osu's Anthropic API key, for talking to Claude.
registerSecretRoutes("/anthropic-key", "anthropic_api_key", "ANTHROPIC_API_KEY");

// Osu's Brave Search API key, for the web_search tool.
registerSecretRoutes("/brave-key", "brave_api_key", "BRAVE_API_KEY");

module.exports = router;
