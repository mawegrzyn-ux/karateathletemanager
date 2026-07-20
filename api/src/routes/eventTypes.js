const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { isClubAdmin } = require("../utils/permissions");

const router = Router();

const FIELDS = `id, club_id, key, label, icon, bg_color, is_standard, created_at`;
const KEY_RE = /^[a-z0-9_]+$/;

router.use(authorize());

// Read is open to any authenticated user (athletes need it too, to render
// their own schedule's icon/bg_color) - only writes are club-admin gated.
// `?club_id=` narrows to one club's library; omitted returns every club's
// (small table - a handful of clubs x a dozen-ish types each), which is
// what Schedule.tsx/the Training tab use to build a lookup map without
// needing per-event type fetches.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const clubId = Number(req.query.club_id);
    const params = [];
    let where = "";
    if (Number.isInteger(clubId)) {
      where = "WHERE club_id = $1";
      params.push(clubId);
    }
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_event_types ${where} ORDER BY is_standard DESC, label ASC`,
      params
    );
    res.json({ types: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { club_id, key, label, icon, bg_color } = req.body ?? {};
    const clubId = Number(club_id);
    if (!Number.isInteger(clubId)) {
      return res.status(400).json({ error: { message: "club_id is required" } });
    }
    if (!(await isClubAdmin(req.user, clubId))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    if (typeof key !== "string" || !KEY_RE.test(key)) {
      return res.status(400).json({
        error: { message: "Key must be lowercase letters, numbers, and underscores" },
      });
    }
    if (typeof label !== "string" || label.trim().length === 0) {
      return res.status(400).json({ error: { message: "Label is required" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_event_types (club_id, key, label, icon, bg_color, is_standard)
         VALUES ($1, $2, $3, $4, $5, false)
         RETURNING ${FIELDS}`,
        [clubId, key, label.trim(), icon || "📌", bg_color || "#78716c"]
      );
      res.status(201).json({ type: rows[0] });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(400).json({
          error: { message: "A type with that key already exists for this club" },
        });
      }
      throw err;
    }
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(
      `SELECT club_id FROM nk_event_types WHERE id = $1`,
      [req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: { message: "Type not found" } });
    }
    if (!(await isClubAdmin(req.user, existingRows[0].club_id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    // key and is_standard are immutable after creation - only label/icon/
    // bg_color can be restyled, matching the same presence-based dynamic
    // SET clause every other PATCH in the app uses.
    const fields = { label: body.label, icon: body.icon, bg_color: body.bg_color };
    const setClauses = [];
    const values = [];
    for (const [k, value] of Object.entries(fields)) {
      if (k in body) {
        values.push(value);
        setClauses.push(`${k} = $${values.length}`);
      }
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE nk_event_types SET ${setClauses.join(", ")}
       WHERE id = $${values.length}
       RETURNING ${FIELDS}`,
      values
    );
    res.json({ type: rows[0] });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(
      `SELECT club_id, is_standard FROM nk_event_types WHERE id = $1`,
      [req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: { message: "Type not found" } });
    }
    if (!(await isClubAdmin(req.user, existingRows[0].club_id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    if (existingRows[0].is_standard) {
      return res
        .status(400)
        .json({ error: { message: "Standard types can't be deleted" } });
    }

    try {
      await pool.query(`DELETE FROM nk_event_types WHERE id = $1`, [req.params.id]);
      res.status(204).end();
    } catch (err) {
      if (err.code === "23503") {
        return res.status(400).json({
          error: {
            message: "This type is in use by existing events and can't be deleted",
          },
        });
      }
      throw err;
    }
  })
);

module.exports = router;
