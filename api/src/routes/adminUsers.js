const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { activateUser } = require("../utils/activateUser");

const router = Router();
const ROLES = ["coach", "athlete", "parent"];
const STATUSES = ["pending", "active", "disabled"];

router.use(authorize.requireAdmin);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, email, role, status, is_admin, athlete_id, coach_id,
              created_at, first_name, last_name, phone,
              COALESCE(
                (SELECT array_agg(athlete_id ORDER BY athlete_id)
                 FROM nk_user_athletes WHERE user_id = nk_users.id),
                '{}'
              ) AS athlete_ids,
              COALESCE(
                (SELECT array_agg(coach_id ORDER BY coach_id)
                 FROM nk_user_coaches WHERE user_id = nk_users.id),
                '{}'
              ) AS coach_ids
       FROM nk_users ORDER BY created_at ASC`
    );
    res.json({ users: rows });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const { role, status, is_admin, first_name, last_name, phone } = body;

    if (role !== undefined && role !== null && !ROLES.includes(role)) {
      return res.status(400).json({ error: { message: "Invalid role" } });
    }
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: { message: "Invalid status" } });
    }
    if (is_admin !== undefined && typeof is_admin !== "boolean") {
      return res
        .status(400)
        .json({ error: { message: "is_admin must be a boolean" } });
    }

    // Build the SET clause only from keys actually present in the request
    // body, so an explicit `null` (e.g. "unlink this athlete/coach") is
    // applied as NULL rather than being swallowed by COALESCE, while a
    // key that's simply absent leaves that column untouched.
    const fields = {
      role,
      status,
      is_admin,
      first_name,
      last_name,
      phone,
    };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    values.push(req.params.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE nk_users SET ${setClauses.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING id, email, role, status, is_admin, athlete_id, coach_id,
                   first_name, last_name, phone,
                   wants_athlete, wants_coach, requested_club_id`,
        values
      );

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: { message: "User not found" } });
      }

      let user = rows[0];
      if (status === "active") {
        user = await activateUser(client, user);
      }

      await client.query("COMMIT");
      res.json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          is_admin: user.is_admin,
          athlete_id: user.athlete_id,
          coach_id: user.coach_id,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Linked athlete/coach does not exist" } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.user.id) {
      return res
        .status(400)
        .json({ error: { message: "You can't delete your own account" } });
    }

    const { rowCount } = await pool.query(`DELETE FROM nk_users WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "User not found" } });
    }
    res.status(204).end();
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

router.put(
  "/:id/athletes",
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
      await client.query(`DELETE FROM nk_user_athletes WHERE user_id = $1`, [
        req.params.id,
      ]);
      for (const athleteId of athleteIds) {
        await client.query(
          `INSERT INTO nk_user_athletes (user_id, athlete_id) VALUES ($1, $2)`,
          [req.params.id, athleteId]
        );
      }
      // Keep the "currently active" athlete_id pointer valid: if it's no
      // longer among the linked profiles, fall back to the first one
      // (or NULL if none remain).
      await client.query(
        `UPDATE nk_users SET
           athlete_id = CASE WHEN athlete_id = ANY($2::int[]) THEN athlete_id ELSE $3 END,
           updated_at = NOW()
         WHERE id = $1`,
        [req.params.id, athleteIds, athleteIds[0] ?? null]
      );
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

router.put(
  "/:id/coaches",
  asyncHandler(async (req, res) => {
    const { coachIds } = req.body ?? {};
    if (!Array.isArray(coachIds)) {
      return res
        .status(400)
        .json({ error: { message: "coachIds must be an array" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM nk_user_coaches WHERE user_id = $1`, [
        req.params.id,
      ]);
      for (const coachId of coachIds) {
        await client.query(
          `INSERT INTO nk_user_coaches (user_id, coach_id) VALUES ($1, $2)`,
          [req.params.id, coachId]
        );
      }
      await client.query(
        `UPDATE nk_users SET
           coach_id = CASE WHEN coach_id = ANY($2::int[]) THEN coach_id ELSE $3 END,
           updated_at = NOW()
         WHERE id = $1`,
        [req.params.id, coachIds, coachIds[0] ?? null]
      );
      await client.query("COMMIT");
      res.json({ coachIds });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "One or more coach IDs do not exist" } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
