const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { isAssociationAdmin } = require("../utils/permissions");

const router = Router();

router.use(authorize("admin", "coach"));

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
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

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
    if (!(await isAssociationAdmin(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

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
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

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

router.get(
  "/:id/admins",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT coach_id FROM nk_coach_associations WHERE association_id = $1 ORDER BY coach_id`,
      [req.params.id]
    );
    res.json({ coachIds: rows.map((r) => r.coach_id) });
  })
);

router.put(
  "/:id/admins",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { coachIds } = req.body ?? {};
    if (!Array.isArray(coachIds)) {
      return res
        .status(400)
        .json({ error: { message: "coachIds must be an array" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM nk_coach_associations WHERE association_id = $1`,
        [req.params.id]
      );
      for (const coachId of coachIds) {
        await client.query(
          `INSERT INTO nk_coach_associations (association_id, coach_id) VALUES ($1, $2)`,
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
