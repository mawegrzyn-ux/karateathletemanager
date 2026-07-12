const path = require("path");
const fs = require("fs");
const { Router } = require("express");
const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const DEFAULT_ICON_PATH = path.join(__dirname, "..", "assets", "default-icon.jpg");
const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

// Serves whatever image the admin has uploaded as the app's branding icon
// (admin/settings.js writes the URL to nk_settings) at every icon "slot" the
// app needs - favicon, home-screen/PWA icons, apple-touch-icon, and the
// social-share (Open Graph/Twitter Card) preview image alike. One upload,
// same file at every slot, letting the browser/OS scale it - no per-size
// server-side processing. Deliberately unauthenticated: these URLs are
// fetched by browsers, OS icon installers, and social-media link crawlers,
// none of which carry our session cookie. Falls back to the committed
// default image until an admin uploads a replacement.
router.get(
  [
    "/favicon-32.png",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-192.png",
    "/icon-maskable-512.png",
    "/social-image.png",
  ],
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT value FROM nk_settings WHERE key = 'branding_icon_url'`
    );
    const url = rows[0]?.value;
    const filename = url?.split("/").pop();

    if (filename && SAFE_FILENAME.test(filename)) {
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        res.set("Cache-Control", "public, max-age=300");
        return res.sendFile(filePath);
      }
    }

    res.set("Cache-Control", "public, max-age=300");
    res.sendFile(DEFAULT_ICON_PATH);
  })
);

module.exports = router;
