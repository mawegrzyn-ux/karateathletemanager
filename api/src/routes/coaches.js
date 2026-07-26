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
                role, athlete_id, photo_url, is_active, created_at`;

router.use(authorize("coach"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_coaches ORDER BY last_name, first_name`
    );
    res.json({ coaches: rows });
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
      role,
      athlete_id,
      photo_url,
      is_active,
    } = req.body ?? {};

    if (typeof first_name !== "string" || typeof last_name !== "string") {
      return res
        .status(400)
        .json({ error: { message: "first_name and last_name are required" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_coaches
           (first_name, last_name, email, phone, qualifications, role, athlete_id, photo_url, is_active)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'assistant'), $7, $8, COALESCE($9, TRUE))
         RETURNING ${FIELDS}`,
        [
          first_name,
          last_name,
          email,
          phone,
          qualifications,
          role,
          athlete_id,
          photo_url,
          is_active,
        ]
      );
      res.status(201).json({ coach: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Linked athlete does not exist" } });
      }
      throw err;
    }
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_coaches WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Coach not found" } });
    }
    res.json({ coach: rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "coach" && req.user.coach_id === Number(req.params.id);
    if (!req.user.is_admin && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    // Self-service edits are restricted to contact/profile fields — role,
    // athlete_id, and is_active stay admin-only.
    const allowedKeys = req.user.is_admin
      ? [
          "first_name",
          "last_name",
          "email",
          "phone",
          "qualifications",
          "role",
          "athlete_id",
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

    try {
      const { rows } = await pool.query(
        `UPDATE nk_coaches SET ${setClauses.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING ${FIELDS}`,
        values
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Coach not found" } });
      }
      res.json({ coach: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Linked athlete does not exist" } });
      }
      throw err;
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_coaches WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Coach not found" } });
    }
    res.status(204).end();
  })
);

// Invite link: lets an admin/club-admin generate a shareable registration
// link for this specific coach record, so whoever it belongs to can
// create their own login pre-linked to it (and, optionally, pre-joined to
// a club) - see POST /auth/register's invite_token handling for how the
// link is consumed.
router.get(
  "/:id/invite-link",
  asyncHandler(async (req, res) => {
    const coachId = Number(req.params.id);
    if (!(await canManageProfileInvite(req.user, "coach", coachId, null))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    const invite = await getInvite("coach", coachId);
    res.json({ invite });
  })
);

router.post(
  "/:id/invite-link",
  asyncHandler(async (req, res) => {
    const coachId = Number(req.params.id);
    const { email, club_id } = req.body ?? {};
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: { message: "Invalid email" } });
    }
    if (
      !(await canManageProfileInvite(req.user, "coach", coachId, club_id ?? null))
    ) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(`SELECT id FROM nk_coaches WHERE id = $1`, [
      coachId,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Coach not found" } });
    }

    try {
      const invite = await createInvite(
        "coach",
        coachId,
        email.toLowerCase(),
        club_id ?? null
      );
      res.json({ invite });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Selected club does not exist" } });
      }
      throw err;
    }
  })
);

router.delete(
  "/:id/invite-link",
  asyncHandler(async (req, res) => {
    const coachId = Number(req.params.id);
    if (!(await canManageProfileInvite(req.user, "coach", coachId, null))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    await deleteInvite("coach", coachId);
    res.status(204).end();
  })
);

router.get(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT style_id FROM nk_coach_styles WHERE coach_id = $1 ORDER BY style_id`,
      [req.params.id]
    );
    res.json({ styleIds: rows.map((r) => r.style_id) });
  })
);

router.put(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { styleIds } = req.body ?? {};
    if (!Array.isArray(styleIds)) {
      return res
        .status(400)
        .json({ error: { message: "styleIds must be an array" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM nk_coach_styles WHERE coach_id = $1`,
        [req.params.id]
      );
      for (const styleId of styleIds) {
        await client.query(
          `INSERT INTO nk_coach_styles (coach_id, style_id) VALUES ($1, $2)`,
          [req.params.id, styleId]
        );
      }
      await client.query("COMMIT");
      res.json({ styleIds });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "One or more style IDs do not exist" } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
