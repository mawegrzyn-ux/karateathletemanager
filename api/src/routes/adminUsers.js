const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();
const ROLES = ["admin", "coach", "athlete", "parent"];
const STATUSES = ["pending", "active", "disabled"];

router.use(authorize("admin"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, email, role, status, athlete_id, coach_id, created_at,
              first_name, last_name, phone
       FROM nk_users ORDER BY created_at ASC`
    );
    res.json({ users: rows });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const {
      role,
      status,
      athlete_id,
      coach_id,
      first_name,
      last_name,
      phone,
    } = req.body ?? {};

    if (role !== undefined && role !== null && !ROLES.includes(role)) {
      return res.status(400).json({ error: { message: "Invalid role" } });
    }
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: { message: "Invalid status" } });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE nk_users SET
           role       = COALESCE($1, role),
           status     = COALESCE($2, status),
           athlete_id = COALESCE($3, athlete_id),
           coach_id   = COALESCE($4, coach_id),
           first_name = COALESCE($5, first_name),
           last_name  = COALESCE($6, last_name),
           phone      = COALESCE($7, phone),
           updated_at = NOW()
         WHERE id = $8
         RETURNING id, email, role, status, athlete_id, coach_id,
                   first_name, last_name, phone`,
        [
          role,
          status,
          athlete_id,
          coach_id,
          first_name,
          last_name,
          phone,
          req.params.id,
        ]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "User not found" } });
      }
      res.json({ user: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Linked athlete/coach does not exist" } });
      }
      throw err;
    }
  })
);

router.put(
  "/:id/parent-athletes",
  asyncHandler(async (req, res) => {
    const { athleteIds } = req.body ?? {};
    if (!Array.isArray(athleteIds)) {
      return res
        .status(400)
        .json({ error: { message: "athleteIds must be an array" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM nk_parent_athletes WHERE user_id = $1`, [
        req.params.id,
      ]);
      for (const athleteId of athleteIds) {
        await client.query(
          `INSERT INTO nk_parent_athletes (user_id, athlete_id) VALUES ($1, $2)`,
          [req.params.id, athleteId]
        );
      }
      await client.query("COMMIT");
      res.json({ athleteIds });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "One or more athlete IDs do not exist" } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
