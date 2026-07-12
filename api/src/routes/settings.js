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

module.exports = router;
