const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { canManageProfileInvite } = require("../utils/permissions");
const {
  getInvite,
  createInvite,
  deleteInvite,
} = require("../utils/profileInvites");

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELDS = `id, first_name, last_name, email, phone, qualifications,
                photo_url, is_active, created_at`;

router.use(authorize("coach", "referee"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_referees ORDER BY last_name, first_name`
    );
    res.json({ referees: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      qualifications,
      photo_url,
      is_active,
    } = req.body ?? {};

    if (typeof first_name !== "string" || typeof last_name !== "string") {
      return res
        .status(400)
        .json({ error: { message: "first_name and last_name are required" } });
    }

    const { rows } = await pool.query(
      `INSERT INTO nk_referees
         (first_name, last_name, email, phone, qualifications, photo_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE))
       RETURNING ${FIELDS}`,
      [first_name, last_name, email, phone, qualifications, photo_url, is_active]
    );
    res.status(201).json({ referee: rows[0] });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_referees WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Referee not found" } });
    }
    res.json({ referee: rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "referee" &&
      req.user.referee_id === Number(req.params.id);
    if (!req.user.is_admin && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    // Self-service edits are restricted to contact/profile fields —
    // is_active stays admin-only.
    const allowedKeys = req.user.is_admin
      ? [
          "first_name",
          "last_name",
          "email",
          "phone",
          "qualifications",
          "photo_url",
          "is_active",
        ]
      : ["first_name", "last_name", "email", "phone", "qualifications", "photo_url"];

    const setClauses = [];
    const values = [];
    for (const key of allowedKeys) {
      if (key in body) {
        values.push(body[key]);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE nk_referees SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING ${FIELDS}`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Referee not found" } });
    }
    res.json({ referee: rows[0] });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_referees WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Referee not found" } });
    }
    res.status(204).end();
  })
);

// Invite link: lets an admin generate a shareable registration link for
// this specific referee record, so whoever it belongs to can create their
// own login pre-linked to it - see POST /auth/register's invite_token
// handling for how the link is consumed. Referees have no club-membership
// concept anywhere else in the app, so unlike athletes/coaches this is
// always admin-only (canManageProfileInvite never grants it via a
// club-admin path for a referee) and there's no club to associate.
router.get(
  "/:id/invite-link",
  asyncHandler(async (req, res) => {
    const refereeId = Number(req.params.id);
    if (!(await canManageProfileInvite(req.user, "referee", refereeId, null))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    const invite = await getInvite("referee", refereeId);
    res.json({ invite });
  })
);

router.post(
  "/:id/invite-link",
  asyncHandler(async (req, res) => {
    const refereeId = Number(req.params.id);
    const { email } = req.body ?? {};
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: { message: "Invalid email" } });
    }
    if (!(await canManageProfileInvite(req.user, "referee", refereeId, null))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(`SELECT id FROM nk_referees WHERE id = $1`, [
      refereeId,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Referee not found" } });
    }

    const invite = await createInvite("referee", refereeId, email.toLowerCase(), null);
    res.json({ invite });
  })
);

router.delete(
  "/:id/invite-link",
  asyncHandler(async (req, res) => {
    const refereeId = Number(req.params.id);
    if (!(await canManageProfileInvite(req.user, "referee", refereeId, null))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    await deleteInvite("referee", refereeId);
    res.status(204).end();
  })
);

module.exports = router;
