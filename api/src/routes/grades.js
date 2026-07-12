const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

router.use(authorize());

// Combined grade visibility for the athlete grade picker and the coach
// grading-record picker: every standard grade, plus each club's override
// grades for clubs the viewer is actually connected to - a coach's own
// clubs, or an athlete's own clubs (so their self-profile can resolve
// their own grade's name/color even if their club uses an override list) -
// or every club's overrides for an admin. Read-only; actual management
// happens via /admin/grades (standard list) or /admin/clubs/:id/grades
// (club overrides), both permission-gated there.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      req.user.is_admin
        ? `SELECT g.id, g.kind, g.rank_order, g.name, g.belt_color, g.club_id, c.name AS club_name
           FROM nk_grade_levels g
           LEFT JOIN nk_clubs c ON c.id = g.club_id
           ORDER BY g.club_id IS NOT NULL, c.name NULLS FIRST, g.rank_order`
        : `SELECT g.id, g.kind, g.rank_order, g.name, g.belt_color, g.club_id, c.name AS club_name
           FROM nk_grade_levels g
           LEFT JOIN nk_clubs c ON c.id = g.club_id
           WHERE g.club_id IS NULL
              OR g.club_id IN (SELECT club_id FROM nk_coach_clubs WHERE coach_id = $1)
              OR g.club_id IN (SELECT club_id FROM nk_athlete_clubs WHERE athlete_id = $2)
           ORDER BY g.club_id IS NOT NULL, c.name NULLS FIRST, g.rank_order`,
      req.user.is_admin ? [] : [req.user.coach_id ?? null, req.user.athlete_id ?? null]
    );
    res.json({ grades: rows });
  })
);

module.exports = router;
