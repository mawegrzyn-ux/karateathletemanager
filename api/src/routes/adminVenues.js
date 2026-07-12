const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, name, address, notes, created_at`;

router.use(authorize());

// Global venues only (club_id IS NULL) - club-specific venues are managed
// via /admin/clubs/:id/venues instead, scoped by that club's admin.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_venues WHERE club_id IS NULL ORDER BY name`
    );
    res.json({ venues: rows });
  })
);

router.post(
  "/",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, address, notes } = req.body ?? {};
    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: { message: "Name is required" } });
    }
    const { rows } = await pool.query(
      `INSERT INTO nk_venues (club_id, name, address, notes)
       VALUES (NULL, $1, $2, $3) RETURNING ${FIELDS}`,
      [name, address ?? null, notes ?? null]
    );
    res.status(201).json({ venue: rows[0] });
  })
);

router.patch(
  "/:id",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, address, notes } = req.body ?? {};
    const { rows } = await pool.query(
      `UPDATE nk_venues SET
         name    = COALESCE($1, name),
         address = COALESCE($2, address),
         notes   = COALESCE($3, notes)
       WHERE id = $4 AND club_id IS NULL
       RETURNING ${FIELDS}`,
      [name, address, notes, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Venue not found" } });
    }
    res.json({ venue: rows[0] });
  })
);

router.delete(
  "/:id",
  authorize.requireAdmin,
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM nk_venues WHERE id = $1 AND club_id IS NULL`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Venue not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
