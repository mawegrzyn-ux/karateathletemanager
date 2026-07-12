const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, kind, rank_order, name, belt_color, created_at`;
const KINDS = ["kyu", "dan"];

router.use(authorize());

// Standard grades only (club_id IS NULL) - a club's own override list is
// managed via /admin/clubs/:id/grades instead, scoped by that club's admin.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_grade_levels WHERE club_id IS NULL ORDER BY rank_order`
    );
    res.json({ grades: rows });
  })
);

router.post(
  "/",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { kind, rank_order, name, belt_color } = req.body ?? {};
    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }
    if (!KINDS.includes(kind)) {
      return res.status(400).json({ error: { message: "kind must be 'kyu' or 'dan'" } });
    }
    if (!Number.isInteger(rank_order)) {
      return res.status(400).json({ error: { message: "rank_order must be an integer" } });
    }
    if (typeof belt_color !== "string" || belt_color.trim().length === 0) {
      return res.status(400).json({ error: { message: "belt_color is required" } });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_grade_levels (club_id, kind, rank_order, name, belt_color)
         VALUES (NULL, $1, $2, $3, $4) RETURNING ${FIELDS}`,
        [kind, rank_order, name, belt_color]
      );
      res.status(201).json({ grade: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A standard grade with that name already exists" } });
      }
      throw err;
    }
  })
);

router.patch(
  "/:id",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { kind, rank_order, name, belt_color } = req.body ?? {};
    if (kind !== undefined && !KINDS.includes(kind)) {
      return res.status(400).json({ error: { message: "kind must be 'kyu' or 'dan'" } });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE nk_grade_levels SET
           kind       = COALESCE($1, kind),
           rank_order = COALESCE($2, rank_order),
           name       = COALESCE($3, name),
           belt_color = COALESCE($4, belt_color)
         WHERE id = $5 AND club_id IS NULL
         RETURNING ${FIELDS}`,
        [kind, rank_order, name, belt_color, req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Grade not found" } });
      }
      res.json({ grade: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res
          .status(400)
          .json({ error: { message: "A standard grade with that name already exists" } });
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
      `DELETE FROM nk_grade_levels WHERE id = $1 AND club_id IS NULL`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Grade not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
