const { Router } = require("express");
const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const PROFILE_TABLES = {
  athlete: "nk_athletes",
  coach: "nk_coaches",
  referee: "nk_referees",
};

// Resolves a profile-invite token to the invited person's name (and, if
// the invite carries one, the club they'll join) so the (pre-session)
// registration page can show "You're creating an account for <Name>"
// without exposing any other profile data. Unauthenticated, like
// publicJoin.js - registration runs before a session exists.
router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pi.profile_type, pi.profile_id, pi.email, c.name AS club_name
       FROM nk_profile_invites pi
       LEFT JOIN nk_clubs c ON c.id = pi.club_id
       WHERE pi.token = $1 AND pi.expires_at > NOW()`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "Invalid or expired invite link" } });
    }

    const invite = rows[0];
    const table = PROFILE_TABLES[invite.profile_type];
    const { rows: profileRows } = await pool.query(
      `SELECT first_name, last_name FROM ${table} WHERE id = $1`,
      [invite.profile_id]
    );
    if (profileRows.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "Invalid or expired invite link" } });
    }

    res.json({
      invite: {
        profile_type: invite.profile_type,
        first_name: profileRows[0].first_name,
        last_name: profileRows[0].last_name,
        email: invite.email,
        club_name: invite.club_name,
      },
    });
  })
);

module.exports = router;
