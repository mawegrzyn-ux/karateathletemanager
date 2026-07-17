const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

router.use(authorize());

const RESULT_FIELDS = `r.id, r.athlete_id, a.first_name, a.last_name, r.event_id, r.event_item_id,
                        r.competition_name, r.competition_date, r.location, r.rounds_completed,
                        r.final_position, r.notes, r.created_at`;

// Cross-athlete competition results for the Competitions page - a coach or
// admin sees every athlete's results (optionally filtered by athlete name,
// matching the Athletes.tsx list-search convention); an athlete sees just
// their own, without needing their own athlete_id in the URL the way
// /athletes/:id/competition-results requires. Creating/editing/deleting
// still goes through the existing athlete-scoped endpoints - this is a
// read-only rollup.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const isSelfAthlete = req.user.role === "athlete" && req.user.athlete_id;
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelfAthlete) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    if (isSelfAthlete && !req.user.is_admin && req.user.role !== "coach") {
      const { rows } = await pool.query(
        `SELECT ${RESULT_FIELDS} FROM nk_competition_results r
         JOIN nk_athletes a ON a.id = r.athlete_id
         WHERE r.athlete_id = $1
         ORDER BY r.competition_date DESC, r.created_at DESC`,
        [req.user.athlete_id]
      );
      return res.json({ results: rows });
    }

    const { q } = req.query;
    const { rows } = q
      ? await pool.query(
          `SELECT ${RESULT_FIELDS} FROM nk_competition_results r
           JOIN nk_athletes a ON a.id = r.athlete_id
           WHERE a.first_name ILIKE $1 OR a.last_name ILIKE $1
           ORDER BY r.competition_date DESC, r.created_at DESC`,
          [`%${q}%`]
        )
      : await pool.query(
          `SELECT ${RESULT_FIELDS} FROM nk_competition_results r
           JOIN nk_athletes a ON a.id = r.athlete_id
           ORDER BY r.competition_date DESC, r.created_at DESC`
        );
    res.json({ results: rows });
  })
);

module.exports = router;
