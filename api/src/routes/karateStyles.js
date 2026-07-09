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
      `SELECT ${FIELDS} FROM nk_karate_styles ORDER BY name`
    );
    res.json({ styles: rows });
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
        `INSERT INTO nk_karate_styles (name) VALUES ($1) RETURNING ${FIELDS}`,
        [name]
      );
      res.status(201).json({ style: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A style with that name already exists" } });
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
        `UPDATE nk_karate_styles SET name = $1 WHERE id = $2 RETURNING ${FIELDS}`,
        [name, req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Style not found" } });
      }
      res.json({ style: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A style with that name already exists" } });
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
      `DELETE FROM nk_karate_styles WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Style not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
