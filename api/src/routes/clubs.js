const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

router.use(authorize("admin"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.association_id, c.location,
              c.contact_email, c.contact_phone, c.created_at,
              a.name AS association_name
       FROM nk_clubs c
       LEFT JOIN nk_associations a ON a.id = c.association_id
       ORDER BY c.name ASC`
    );
    res.json({ clubs: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, association_id, location, contact_email, contact_phone } =
      req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_clubs (name, association_id, location, contact_email, contact_phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, association_id, location, contact_email, contact_phone, created_at`,
        [name, association_id ?? null, location, contact_email, contact_phone]
      );
      res.status(201).json({ club: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Association does not exist" } });
      }
      throw err;
    }
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { name, association_id, location, contact_email, contact_phone } =
      req.body ?? {};

    try {
      const { rows } = await pool.query(
        `UPDATE nk_clubs SET
           name           = COALESCE($1, name),
           association_id = COALESCE($2, association_id),
           location       = COALESCE($3, location),
           contact_email  = COALESCE($4, contact_email),
           contact_phone  = COALESCE($5, contact_phone),
           updated_at     = NOW()
         WHERE id = $6
         RETURNING id, name, association_id, location, contact_email, contact_phone, created_at`,
        [name, association_id, location, contact_email, contact_phone, req.params.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Club not found" } });
      }
      res.json({ club: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Association does not exist" } });
      }
      throw err;
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM nk_clubs WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Club not found" } });
    }
    res.status(204).end();
  })
);

router.get(
  "/:id/athletes",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT athlete_id FROM nk_athlete_clubs WHERE club_id = $1 ORDER BY athlete_id`,
      [req.params.id]
    );
    res.json({ athleteIds: rows.map((r) => r.athlete_id) });
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
      await client.query(`DELETE FROM nk_athlete_clubs WHERE club_id = $1`, [
        req.params.id,
      ]);
      for (const athleteId of athleteIds) {
        await client.query(
          `INSERT INTO nk_athlete_clubs (club_id, athlete_id) VALUES ($1, $2)`,
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

router.get(
  "/:id/coaches",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT coach_id FROM nk_coach_clubs WHERE club_id = $1 ORDER BY coach_id`,
      [req.params.id]
    );
    res.json({ coachIds: rows.map((r) => r.coach_id) });
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
      await client.query(`DELETE FROM nk_coach_clubs WHERE club_id = $1`, [
        req.params.id,
      ]);
      for (const coachId of coachIds) {
        await client.query(
          `INSERT INTO nk_coach_clubs (club_id, coach_id) VALUES ($1, $2)`,
          [req.params.id, coachId]
        );
      }
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
