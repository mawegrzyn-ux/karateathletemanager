const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Router } = require("express");
const multer = require("multer");
const express = require("express");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_MIME_PREFIXES.some((prefix) =>
      file.mimetype.startsWith(prefix)
    );
    cb(ok ? null : new Error("Only image or video files are allowed"), ok);
  },
});

router.use(authorize());

router.use("/files", express.static(UPLOADS_DIR));

router.post(
  "/",
  authorize("coach"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: { message: err.message } });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: { message: "No file uploaded" } });
    }
    res.status(201).json({ url: `/api/uploads/files/${req.file.filename}` });
  })
);

module.exports = router;
