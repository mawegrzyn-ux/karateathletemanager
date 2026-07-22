const { Router } = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const { signSession, SESSION_MAX_AGE_MS } = require("../utils/jwt");
const asyncHandler = require("../utils/asyncHandler");
const pinRateLimit = require("../utils/pinRateLimit");
const { USER_SELECT_FIELDS } = require("../utils/userFields");

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setSessionCookie(res, userId) {
  res.cookie("session", signSession({ id: userId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const {
      email,
      password,
      wants_athlete,
      wants_coach,
      wants_referee,
      requested_club_id,
    } = req.body ?? {};

    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: { message: "Invalid email" } });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        error: { message: "Password must be at least 8 characters" },
      });
    }
    if (wants_athlete !== undefined && typeof wants_athlete !== "boolean") {
      return res
        .status(400)
        .json({ error: { message: "wants_athlete must be a boolean" } });
    }
    if (wants_coach !== undefined && typeof wants_coach !== "boolean") {
      return res
        .status(400)
        .json({ error: { message: "wants_coach must be a boolean" } });
    }
    if (wants_referee !== undefined && typeof wants_referee !== "boolean") {
      return res
        .status(400)
        .json({ error: { message: "wants_referee must be a boolean" } });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_users
           (email, password_hash, status, is_admin, wants_athlete, wants_coach, wants_referee, requested_club_id)
         VALUES (
           $1, $2,
           CASE WHEN (SELECT COUNT(*) FROM nk_users) = 0 THEN 'active' ELSE 'pending' END,
           CASE WHEN (SELECT COUNT(*) FROM nk_users) = 0 THEN TRUE ELSE FALSE END,
           COALESCE($3, FALSE), COALESCE($4, FALSE), COALESCE($5, FALSE), $6
         )
         RETURNING ${USER_SELECT_FIELDS}`,
        [
          email.toLowerCase(),
          passwordHash,
          wants_athlete,
          wants_coach,
          wants_referee,
          requested_club_id ?? null,
        ]
      );

      const user = rows[0];
      setSessionCookie(res, user.id);
      res.status(201).json({ user });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({
          error: { message: "An account with that email already exists" },
        });
      }
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "Selected club does not exist" } });
      }
      throw err;
    }
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({ error: { message: "Email and password are required" } });
    }

    const { rows } = await pool.query(
      `SELECT password_hash, ${USER_SELECT_FIELDS}
       FROM nk_users WHERE email = $1`,
      [email.toLowerCase()]
    );
    const user = rows[0];
    const valid = user && (await bcrypt.compare(password, user.password_hash));

    if (!valid) {
      return res
        .status(401)
        .json({ error: { message: "Invalid email or password" } });
    }

    setSessionCookie(res, user.id);
    const { password_hash, ...publicUser } = user;
    res.json({ user: publicUser });
  })
);

router.post("/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ user: req.user });
});

router.patch(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    const { first_name, last_name, phone, photo_url, date_of_birth } =
      req.body ?? {};

    for (const [field, value, maxLen] of [
      ["first_name", first_name, 100],
      ["last_name", last_name, 100],
      ["phone", phone, 50],
      ["photo_url", photo_url, 500],
    ]) {
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== "string" || value.length > maxLen)
      ) {
        return res.status(400).json({
          error: { message: `Invalid ${field}` },
        });
      }
    }
    if (
      date_of_birth !== undefined &&
      date_of_birth !== null &&
      typeof date_of_birth !== "string"
    ) {
      return res.status(400).json({ error: { message: "Invalid date_of_birth" } });
    }

    const { rows } = await pool.query(
      `UPDATE nk_users SET
         first_name    = COALESCE($1, first_name),
         last_name     = COALESCE($2, last_name),
         phone         = COALESCE($3, phone),
         photo_url     = COALESCE($4, photo_url),
         date_of_birth = COALESCE($5, date_of_birth),
         updated_at    = NOW()
       WHERE id = $6
       RETURNING ${USER_SELECT_FIELDS}`,
      [first_name, last_name, phone, photo_url, date_of_birth, req.user.id]
    );

    res.json({ user: rows[0] });
  })
);

// Personal bottom-nav tab customization - a separate endpoint (rather
// than folded into PATCH /me's COALESCE-based update) since nav_tabs
// needs "clear back to the role default" (explicit null) to be
// distinguishable from "field omitted", which COALESCE can't express.
router.patch(
  "/me/nav-tabs",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    const { nav_tabs } = req.body ?? {};
    if (nav_tabs !== null && !Array.isArray(nav_tabs)) {
      return res
        .status(400)
        .json({ error: { message: "nav_tabs must be an array or null" } });
    }

    const { rows } = await pool.query(
      `UPDATE nk_users SET nav_tabs = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${USER_SELECT_FIELDS}`,
      [nav_tabs ? JSON.stringify(nav_tabs) : null, req.user.id]
    );
    res.json({ user: rows[0] });
  })
);

router.post(
  "/switch-role",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    const { role, profile_id } = req.body ?? {};
    if (
      role !== "athlete" &&
      role !== "coach" &&
      role !== "parent" &&
      role !== "referee"
    ) {
      return res.status(400).json({
        error: {
          message: "role must be 'athlete', 'coach', 'parent', or 'referee'",
        },
      });
    }

    let athleteId = req.user.athlete_id;
    let coachId = req.user.coach_id;
    let refereeId = req.user.referee_id;

    if (role === "athlete") {
      const { rows } = await pool.query(
        `SELECT athlete_id FROM nk_user_athletes WHERE user_id = $1 ORDER BY athlete_id`,
        [req.user.id]
      );
      const ids = rows.map((r) => r.athlete_id);
      if (ids.length === 0) {
        return res
          .status(400)
          .json({ error: { message: "You don't have an athlete profile" } });
      }
      if (profile_id !== undefined && profile_id !== null) {
        if (!ids.includes(Number(profile_id))) {
          return res
            .status(400)
            .json({ error: { message: "Invalid athlete profile" } });
        }
        athleteId = Number(profile_id);
      } else if (!ids.includes(athleteId)) {
        athleteId = ids[0];
      }
    }

    if (role === "coach") {
      const { rows } = await pool.query(
        `SELECT coach_id FROM nk_user_coaches WHERE user_id = $1 ORDER BY coach_id`,
        [req.user.id]
      );
      const ids = rows.map((r) => r.coach_id);
      if (ids.length === 0) {
        return res
          .status(400)
          .json({ error: { message: "You don't have a coach profile" } });
      }
      if (profile_id !== undefined && profile_id !== null) {
        if (!ids.includes(Number(profile_id))) {
          return res
            .status(400)
            .json({ error: { message: "Invalid coach profile" } });
        }
        coachId = Number(profile_id);
      } else if (!ids.includes(coachId)) {
        coachId = ids[0];
      }
    }

    if (role === "referee") {
      const { rows } = await pool.query(
        `SELECT referee_id FROM nk_user_referees WHERE user_id = $1 ORDER BY referee_id`,
        [req.user.id]
      );
      const ids = rows.map((r) => r.referee_id);
      if (ids.length === 0) {
        return res
          .status(400)
          .json({ error: { message: "You don't have a referee profile" } });
      }
      if (profile_id !== undefined && profile_id !== null) {
        if (!ids.includes(Number(profile_id))) {
          return res
            .status(400)
            .json({ error: { message: "Invalid referee profile" } });
        }
        refereeId = Number(profile_id);
      } else if (!ids.includes(refereeId)) {
        refereeId = ids[0];
      }
    }

    if (role === "parent" && !req.user.is_parent) {
      return res
        .status(400)
        .json({ error: { message: "You don't have any linked children" } });
    }

    const { rows } = await pool.query(
      `UPDATE nk_users SET role = $1, athlete_id = $2, coach_id = $3, referee_id = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING ${USER_SELECT_FIELDS}`,
      [role, athleteId, coachId, refereeId, req.user.id]
    );

    res.json({ user: rows[0] });
  })
);

router.get(
  "/my-profiles",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    const [athletes, coaches, referees] = await Promise.all([
      pool.query(
        `SELECT a.id, a.first_name, a.last_name
         FROM nk_user_athletes ua
         JOIN nk_athletes a ON a.id = ua.athlete_id
         WHERE ua.user_id = $1
         ORDER BY a.last_name, a.first_name`,
        [req.user.id]
      ),
      pool.query(
        `SELECT c.id, c.first_name, c.last_name
         FROM nk_user_coaches uc
         JOIN nk_coaches c ON c.id = uc.coach_id
         WHERE uc.user_id = $1
         ORDER BY c.last_name, c.first_name`,
        [req.user.id]
      ),
      pool.query(
        `SELECT r.id, r.first_name, r.last_name
         FROM nk_user_referees ur
         JOIN nk_referees r ON r.id = ur.referee_id
         WHERE ur.user_id = $1
         ORDER BY r.last_name, r.first_name`,
        [req.user.id]
      ),
    ]);

    res.json({
      athletes: athletes.rows,
      coaches: coaches.rows,
      referees: referees.rows,
    });
  })
);

router.get(
  "/my-children",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.first_name, a.last_name
       FROM nk_parent_athletes pa
       JOIN nk_athletes a ON a.id = pa.athlete_id
       WHERE pa.user_id = $1
       ORDER BY a.last_name, a.first_name`,
      [req.user.id]
    );
    res.json({ children: rows });
  })
);

// Parent-initiated unlink - the athlete-side equivalent lives at
// DELETE /athletes/:id/parents/:userId, deleting the same nk_parent_athletes
// row from the other direction.
router.delete(
  "/my-children/:athleteId",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_parent_athletes WHERE user_id = $1 AND athlete_id = $2`,
      [req.user.id, req.params.athleteId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Link not found" } });
    }
    const { rows: userRows } = await pool.query(
      `SELECT ${USER_SELECT_FIELDS} FROM nk_users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ user: userRows[0] });
  })
);

router.post(
  "/link-child",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    if (pinRateLimit.checkLocked(req.user.id)) {
      return res.status(429).json({
        error: {
          message: "Too many attempts. Try again in a few minutes.",
        },
      });
    }

    const { pin } = req.body ?? {};
    if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
      return res
        .status(400)
        .json({ error: { message: "PIN must be 6 digits" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT id, first_name, last_name FROM nk_athletes
         WHERE link_pin = $1 AND link_pin_expires_at > NOW()`,
        [pin]
      );

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        pinRateLimit.recordFailure(req.user.id);
        return res
          .status(400)
          .json({ error: { message: "Invalid or expired PIN" } });
      }

      const athlete = rows[0];

      await client.query(
        `INSERT INTO nk_parent_athletes (user_id, athlete_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.user.id, athlete.id]
      );
      await client.query(
        `UPDATE nk_athletes SET link_pin = NULL, link_pin_expires_at = NULL
         WHERE id = $1`,
        [athlete.id]
      );
      const { rows: userRows } = await client.query(
        `UPDATE nk_users SET role = COALESCE(role, 'parent'), updated_at = NOW()
         WHERE id = $1
         RETURNING ${USER_SELECT_FIELDS}`,
        [req.user.id]
      );

      await client.query("COMMIT");
      pinRateLimit.reset(req.user.id);
      res.json({
        user: userRows[0],
        child: { id: athlete.id, first_name: athlete.first_name, last_name: athlete.last_name },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
