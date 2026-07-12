const path = require("path");
const fs = require("fs");
const { Router } = require("express");
const sharp = require("sharp");
const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const DEFAULT_ICON_PATH = path.join(__dirname, "..", "assets", "default-icon.jpg");
const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

// Real, opaque brand background for slots that can't have transparency
// (apple-touch-icon) or need padding around the image (maskable icons,
// the social preview's letterboxing) - matches the app's red accent.
const BRAND_BG = { r: 220, g: 38, b: 38 };

// Every slot's actual pixel size/format the platform expects. Each is
// rendered from the single configured source image on request (rather
// than pre-generated per-upload) since traffic to these URLs is low and
// this keeps the upload path simple - browsers/crawlers cache the result
// via the Cache-Control header below anyway. `cover` crops to fill the
// frame (used for plain icons); maskable/social variants `contain` the
// image at a fraction of the frame so nothing important sits in the
// zone platforms may crop away, padded with BRAND_BG.
const SLOTS = {
  "favicon-32.png": { width: 32, height: 32, fit: "cover" },
  "apple-touch-icon.png": {
    width: 180,
    height: 180,
    fit: "cover",
    flatten: true, // iOS renders alpha as black - always opaque
  },
  "icon-192.png": { width: 192, height: 192, fit: "cover" },
  "icon-512.png": { width: 512, height: 512, fit: "cover" },
  "icon-maskable-192.png": { width: 192, height: 192, maskable: true },
  "icon-maskable-512.png": { width: 512, height: 512, maskable: true },
  "social-image.png": { width: 1200, height: 630, fit: "cover" },
};

async function renderSlot(sourcePath, slot) {
  const img = sharp(sourcePath);

  if (slot.maskable) {
    // Safe zone is the inner ~80% - shrink the image to that and pad
    // the rest with the brand color so nothing gets clipped by the
    // OS's adaptive-icon mask.
    const inner = Math.round(slot.width * 0.8);
    const padded = await img
      .resize(inner, inner, { fit: "contain", background: BRAND_BG })
      .toBuffer();
    return sharp(padded)
      .resize(slot.width, slot.height, {
        fit: "contain",
        background: BRAND_BG,
      })
      .png()
      .toBuffer();
  }

  let pipeline = img.resize(slot.width, slot.height, { fit: slot.fit });
  if (slot.flatten) {
    pipeline = pipeline.flatten({ background: BRAND_BG });
  }
  return pipeline.png().toBuffer();
}

// Serves whatever image the admin has uploaded as the app's branding icon
// (admin/settings.js writes the URL to nk_settings), resized/padded to
// match each slot the app needs - favicon, home-screen/PWA icons
// (including maskable, with safe-zone padding), apple-touch-icon (opaque,
// since iOS ignores alpha), and the social-share (Open Graph/Twitter Card)
// preview image. Deliberately unauthenticated: these URLs are fetched by
// browsers, OS icon installers, and social-media link crawlers, none of
// which carry our session cookie. Falls back to the committed default
// image until an admin uploads a replacement. Real per-slot processing
// (not just serving the same raw bytes everywhere) matters here - Chrome
// and Android's PWA-installability checks require icons that actually
// are the declared size/format, or they silently downgrade "Install app"
// to a plain bookmark-style "Add to Home Screen".
router.get(
  Object.keys(SLOTS).map((name) => `/${name}`),
  asyncHandler(async (req, res) => {
    const slot = SLOTS[req.path.slice(1)];

    const { rows } = await pool.query(
      `SELECT value FROM nk_settings WHERE key = 'branding_icon_url'`
    );
    const url = rows[0]?.value;
    const filename = url?.split("/").pop();

    let sourcePath = DEFAULT_ICON_PATH;
    if (filename && SAFE_FILENAME.test(filename)) {
      const uploadedPath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(uploadedPath)) {
        sourcePath = uploadedPath;
      }
    }

    const buffer = await renderSlot(sourcePath, slot);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=300");
    res.send(buffer);
  })
);

module.exports = router;
