const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, name, created_at`;

router.use(authorize());

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_training_module_types ORDER BY name`
    );
    res.json({ types: rows });
  })
);

router.post(
  "/",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { name } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_training_module_types (name) VALUES ($1) RETURNING ${FIELDS}`,
        [name]
      );
      res.status(201).json({ type: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A type with that name already exists" } });
      }
      throw err;
    }
  })
);

router.patch(
  "/:id",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { name } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE nk_training_module_types SET name = $1 WHERE id = $2 RETURNING ${FIELDS}`,
        [name, req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Type not found" } });
      }
      res.json({ type: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A type with that name already exists" } });
      }
      throw err;
    }
  })
);

router.delete(
  "/:id",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM nk_training_module_types WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Type not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
