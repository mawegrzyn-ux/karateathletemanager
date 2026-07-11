const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, first_name, last_name, date_of_birth, email, phone,
                emergency_name, emergency_phone, belt, join_date, photo_url,
                medical_notes, is_active, created_at`;

router.use(authorize());

router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { q } = req.query;
    const { rows } = q
      ? await pool.query(
          `SELECT ${FIELDS} FROM nk_athletes
           WHERE first_name ILIKE $1 OR last_name ILIKE $1
           ORDER BY last_name, first_name`,
          [`%${q}%`]
        )
      : await pool.query(
          `SELECT ${FIELDS} FROM nk_athletes ORDER BY last_name, first_name`
        );
    res.json({ athletes: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      first_name,
      last_name,
      date_of_birth,
      email,
      phone,
      emergency_name,
      emergency_phone,
      belt,
      join_date,
      photo_url,
      medical_notes,
      is_active,
    } = req.body ?? {};

    if (typeof first_name !== "string" || typeof last_name !== "string") {
      return res
        .status(400)
        .json({ error: { message: "first_name and last_name are required" } });
    }

    const { rows } = await pool.query(
      `INSERT INTO nk_athletes
         (first_name, last_name, date_of_birth, email, phone,
          emergency_name, emergency_phone, belt, join_date, photo_url, medical_notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'white'), COALESCE($9, CURRENT_DATE), $10, $11, COALESCE($12, TRUE))
       RETURNING ${FIELDS}`,
      [
        first_name,
        last_name,
        date_of_birth,
        email,
        phone,
        emergency_name,
        emergency_phone,
        belt,
        join_date,
        photo_url,
        medical_notes,
        is_active,
      ]
    );

    res.status(201).json({ athlete: rows[0] });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_athletes WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.json({ athlete: rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const fields = {
      first_name: body.first_name,
      last_name: body.last_name,
      date_of_birth: body.date_of_birth,
      email: body.email,
      phone: body.phone,
      emergency_name: body.emergency_name,
      emergency_phone: body.emergency_phone,
      belt: body.belt,
      join_date: body.join_date,
      photo_url: body.photo_url,
      medical_notes: body.medical_notes,
      is_active: body.is_active,
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

    const { rows } = await pool.query(
      `UPDATE nk_athletes SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING ${FIELDS}`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.json({ athlete: rows[0] });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_athletes WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.status(204).end();
  })
);

router.post(
  "/:id/generate-pin",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    let pin;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = String(Math.floor(Math.random() * 1000000)).padStart(
        6,
        "0"
      );
      const { rows } = await pool.query(
        `SELECT 1 FROM nk_athletes
         WHERE link_pin = $1 AND link_pin_expires_at > NOW()`,
        [candidate]
      );
      if (rows.length === 0) {
        pin = candidate;
        break;
      }
    }
    if (!pin) {
      return res
        .status(500)
        .json({ error: { message: "Could not generate a PIN, try again" } });
    }

    const { rows } = await pool.query(
      `UPDATE nk_athletes SET
         link_pin = $1,
         link_pin_expires_at = NOW() + INTERVAL '1 hour'
       WHERE id = $2
       RETURNING link_pin, link_pin_expires_at`,
      [pin, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.json({
      pin: rows[0].link_pin,
      expires_at: rows[0].link_pin_expires_at,
    });
  })
);

router.get(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT style_id FROM nk_athlete_styles WHERE athlete_id = $1 ORDER BY style_id`,
      [req.params.id]
    );
    res.json({ styleIds: rows.map((r) => r.style_id) });
  })
);

router.put(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
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
        `DELETE FROM nk_athlete_styles WHERE athlete_id = $1`,
        [req.params.id]
      );
      for (const styleId of styleIds) {
        await client.query(
          `INSERT INTO nk_athlete_styles (athlete_id, style_id) VALUES ($1, $2)`,
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
