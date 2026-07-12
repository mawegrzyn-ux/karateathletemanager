const pool = require("../db/pool");
const asyncHandler = require("./asyncHandler");

// Cross-club visibility for the Schedule athlete picker's "add whole
// squad/group" shortcut: admins see every club's, coaches see only
// those belonging to clubs they're a member of. Not used outside
// event-editing UI, which only coaches/admins reach, so anyone else
// (athlete/parent/referee) just gets an empty list.
function registerVisibilityRoute(router, { key, table, joinTable, joinKey }) {
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      if (!req.user.is_admin && req.user.role !== "coach") {
        return res.json({ [key]: [] });
      }
      const { rows } = await pool.query(
        req.user.is_admin
          ? `SELECT s.id, s.name, s.club_id, c.name AS club_name,
                    COALESCE(array_agg(j.athlete_id) FILTER (WHERE j.athlete_id IS NOT NULL), '{}') AS athlete_ids
             FROM ${table} s
             JOIN nk_clubs c ON c.id = s.club_id
             LEFT JOIN ${joinTable} j ON j.${joinKey} = s.id
             GROUP BY s.id, c.name
             ORDER BY c.name, s.name`
          : `SELECT s.id, s.name, s.club_id, c.name AS club_name,
                    COALESCE(array_agg(j.athlete_id) FILTER (WHERE j.athlete_id IS NOT NULL), '{}') AS athlete_ids
             FROM ${table} s
             JOIN nk_clubs c ON c.id = s.club_id
             JOIN nk_coach_clubs cc ON cc.club_id = s.club_id AND cc.coach_id = $1
             LEFT JOIN ${joinTable} j ON j.${joinKey} = s.id
             GROUP BY s.id, c.name
             ORDER BY c.name, s.name`,
        req.user.is_admin ? [] : [req.user.coach_id]
      );
      res.json({ [key]: rows });
    })
  );
}

module.exports = { registerVisibilityRoute };
