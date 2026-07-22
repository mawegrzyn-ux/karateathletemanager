const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

router.use(authorize());

// Combined venue visibility for the Schedule venue picker: every global
// venue, plus - for a coach - their own clubs' venues (for an admin,
// every club's venues, since they oversee everything). Read-only; actual
// management happens via /admin/venues (global) or
// /admin/clubs/:id/venues (club-scoped), both permission-gated there.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      req.user.is_admin
        ? `SELECT v.id, v.name, v.address, v.club_id, c.name AS club_name,
                  v.contact_name, v.contact_phone, v.contact_email
           FROM nk_venues v
           LEFT JOIN nk_clubs c ON c.id = v.club_id
           ORDER BY v.club_id IS NOT NULL, c.name NULLS FIRST, v.name`
        : `SELECT v.id, v.name, v.address, v.club_id, c.name AS club_name,
                  v.contact_name, v.contact_phone, v.contact_email
           FROM nk_venues v
           LEFT JOIN nk_clubs c ON c.id = v.club_id
           WHERE v.club_id IS NULL
              OR v.club_id IN (SELECT club_id FROM nk_coach_clubs WHERE coach_id = $1)
           ORDER BY v.club_id IS NOT NULL, c.name NULLS FIRST, v.name`,
      req.user.is_admin ? [] : [req.user.coach_id]
    );
    res.json({ venues: rows });
  })
);

module.exports = router;
