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
      `SELECT id, name, description, contact_email, contact_phone, created_at
       FROM nk_associations ORDER BY name ASC`
    );
    res.json({ associations: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, description, contact_email, contact_phone } =
      req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }

    const { rows } = await pool.query(
      `INSERT INTO nk_associations (name, description, contact_email, contact_phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, contact_email, contact_phone, created_at`,
      [name, description, contact_email, contact_phone]
    );

    res.status(201).json({ association: rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { name, description, contact_email, contact_phone } =
      req.body ?? {};

    const { rows } = await pool.query(
      `UPDATE nk_associations SET
         name          = COALESCE($1, name),
         description   = COALESCE($2, description),
         contact_email = COALESCE($3, contact_email),
         contact_phone = COALESCE($4, contact_phone),
         updated_at     = NOW()
       WHERE id = $5
       RETURNING id, name, description, contact_email, contact_phone, created_at`,
      [name, description, contact_email, contact_phone, req.params.id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "Association not found" } });
    }
    res.json({ association: rows[0] });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM nk_associations WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res
        .status(404)
        .json({ error: { message: "Association not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
