const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, name, icon, created_at`;

function validateIcon(icon) {
  return icon == null || (typeof icon === "string" && icon.length <= 8);
}

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
    const { name, icon } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }
    if (!validateIcon(icon)) {
      return res
        .status(400)
        .json({ error: { message: "icon must be a string of 8 characters or fewer" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_training_module_types (name, icon) VALUES ($1, $2) RETURNING ${FIELDS}`,
        [name, icon || null]
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
    const body = req.body ?? {};
    const { name, icon } = body;

    if ("name" in body && (typeof name !== "string" || name.trim().length === 0)) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }
    if ("icon" in body && !validateIcon(icon)) {
      return res
        .status(400)
        .json({ error: { message: "icon must be a string of 8 characters or fewer" } });
    }

    const fields = { name, icon };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(key === "icon" && value === "" ? null : value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    try {
      values.push(req.params.id);
      const { rows } = await pool.query(
        `UPDATE nk_training_module_types SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING ${FIELDS}`,
        values
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
