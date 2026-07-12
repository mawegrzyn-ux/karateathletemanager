const { Router } = require("express");
const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

// Resolves a club's join-link token to the club's name, so the (pre-session)
// registration page can show "You're joining <Club>" without exposing any
// other club data. Unauthenticated, like publicClubs.js - registration runs
// before a session exists.
router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name FROM nk_clubs WHERE join_token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Invalid or expired join link" } });
    }
    res.json({ club: rows[0] });
  })
);

module.exports = router;
