const { Router } = require("express");
const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

// Resolves a guardian-invite token to the athlete's name, so the
// (pre-session) registration page can show "You're becoming <Name>'s
// guardian" without exposing any other athlete data. Unauthenticated,
// like publicJoin.js - registration runs before a session exists.
router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name FROM nk_athletes
       WHERE guardian_invite_token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "Invalid or expired guardian invite link" } });
    }
    res.json({ athlete: rows[0] });
  })
);

module.exports = router;
