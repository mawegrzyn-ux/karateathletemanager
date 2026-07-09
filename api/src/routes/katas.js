const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, name, style, wkf_number, created_at`;

router.use(authorize());

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_katas ORDER BY style NULLS LAST, wkf_number NULLS LAST, name`
    );
    res.json({ katas: rows });
  })
);

router.post(
  "/",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, style, wkf_number } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }
    if (wkf_number !== undefined && wkf_number !== null && !Number.isInteger(wkf_number)) {
      return res
        .status(400)
        .json({ error: { message: "wkf_number must be an integer" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_katas (name, style, wkf_number) VALUES ($1, $2, $3) RETURNING ${FIELDS}`,
        [name, style ?? null, wkf_number ?? null]
      );
      res.status(201).json({ kata: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A kata with that name already exists" } });
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
    const { name, style, wkf_number } = body;

    if (
      "wkf_number" in body &&
      wkf_number !== null &&
      !Number.isInteger(wkf_number)
    ) {
      return res
        .status(400)
        .json({ error: { message: "wkf_number must be an integer" } });
    }

    const fields = { name, style, wkf_number };
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
    try {
      const { rows } = await pool.query(
        `UPDATE nk_katas SET ${setClauses.join(", ")}
         WHERE id = $${values.length}
         RETURNING ${FIELDS}`,
        values
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Kata not found" } });
      }
      res.json({ kata: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A kata with that name already exists" } });
      }
      throw err;
    }
  })
);

router.delete(
  "/:id",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM nk_katas WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Kata not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
