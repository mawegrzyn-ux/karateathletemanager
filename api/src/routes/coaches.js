const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, first_name, last_name, email, phone, qualifications,
                role, athlete_id, is_active, created_at`;

router.use(authorize("coach"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_coaches ORDER BY last_name, first_name`
    );
    res.json({ coaches: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      qualifications,
      role,
      athlete_id,
      is_active,
    } = req.body ?? {};

    if (typeof first_name !== "string" || typeof last_name !== "string") {
      return res
        .status(400)
        .json({ error: { message: "first_name and last_name are required" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_coaches
           (first_name, last_name, email, phone, qualifications, role, athlete_id, is_active)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'assistant'), $7, COALESCE($8, TRUE))
         RETURNING ${FIELDS}`,
        [
          first_name,
          last_name,
          email,
          phone,
          qualifications,
          role,
          athlete_id,
          is_active,
        ]
      );
      res.status(201).json({ coach: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Linked athlete does not exist" } });
      }
      throw err;
    }
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_coaches WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Coach not found" } });
    }
    res.json({ coach: rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      qualifications,
      role,
      athlete_id,
      is_active,
    } = req.body ?? {};

    try {
      const { rows } = await pool.query(
        `UPDATE nk_coaches SET
           first_name     = COALESCE($1, first_name),
           last_name      = COALESCE($2, last_name),
           email          = COALESCE($3, email),
           phone          = COALESCE($4, phone),
           qualifications = COALESCE($5, qualifications),
           role           = COALESCE($6, role),
           athlete_id     = COALESCE($7, athlete_id),
           is_active      = COALESCE($8, is_active),
           updated_at     = NOW()
         WHERE id = $9
         RETURNING ${FIELDS}`,
        [
          first_name,
          last_name,
          email,
          phone,
          qualifications,
          role,
          athlete_id,
          is_active,
          req.params.id,
        ]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Coach not found" } });
      }
      res.json({ coach: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Linked athlete does not exist" } });
      }
      throw err;
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_coaches WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Coach not found" } });
    }
    res.status(204).end();
  })
);

router.get(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT style_id FROM nk_coach_styles WHERE coach_id = $1 ORDER BY style_id`,
      [req.params.id]
    );
    res.json({ styleIds: rows.map((r) => r.style_id) });
  })
);

router.put(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { styleIds } = req.body ?? {};
    if (!Array.isArray(styleIds)) {
      return res
        .status(400)
        .json({ error: { message: "styleIds must be an array" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM nk_coach_styles WHERE coach_id = $1`,
        [req.params.id]
      );
      for (const styleId of styleIds) {
        await client.query(
          `INSERT INTO nk_coach_styles (coach_id, style_id) VALUES ($1, $2)`,
          [req.params.id, styleId]
        );
      }
      await client.query("COMMIT");
      res.json({ styleIds });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "One or more style IDs do not exist" } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
