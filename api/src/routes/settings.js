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

// Osu's Anthropic API key. Never echoed back to the client once saved -
// GET only reports whether one is configured (from nk_settings or, as a
// fallback for the original .env-only setup, process.env), so the admin
// UI can offer a setup form without needing to display or re-enter a
// live secret to check its presence.
router.get(
  "/anthropic-key",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT value FROM nk_settings WHERE key = 'anthropic_api_key'`
    );
    const configured = !!(rows[0]?.value || process.env.ANTHROPIC_API_KEY);
    res.json({ configured });
  })
);

router.patch(
  "/anthropic-key",
  asyncHandler(async (req, res) => {
    const { api_key } = req.body ?? {};
    if (typeof api_key !== "string" || !api_key.trim()) {
      return res.status(400).json({ error: { message: "api_key is required" } });
    }

    await pool.query(
      `INSERT INTO nk_settings (key, value, updated_at)
       VALUES ('anthropic_api_key', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [api_key.trim()]
    );
    res.json({ configured: true });
  })
);

router.delete(
  "/anthropic-key",
  asyncHandler(async (req, res) => {
    await pool.query(`DELETE FROM nk_settings WHERE key = 'anthropic_api_key'`);
    res.json({ configured: !!process.env.ANTHROPIC_API_KEY });
  })
);

module.exports = router;
