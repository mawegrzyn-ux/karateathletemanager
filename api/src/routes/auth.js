const { Router } = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const { signSession, SESSION_MAX_AGE_MS } = require("../utils/jwt");
const asyncHandler = require("../utils/asyncHandler");

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
    const { email, password, wants_athlete, wants_coach, requested_club_id } =
      req.body ?? {};

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

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_users
           (email, password_hash, status, is_admin, wants_athlete, wants_coach, requested_club_id)
         VALUES (
           $1, $2,
           CASE WHEN (SELECT COUNT(*) FROM nk_users) = 0 THEN 'active' ELSE 'pending' END,
           CASE WHEN (SELECT COUNT(*) FROM nk_users) = 0 THEN TRUE ELSE FALSE END,
           COALESCE($3, FALSE), COALESCE($4, FALSE), $5
         )
         RETURNING id, email, role, status, is_admin, athlete_id, coach_id,
                   first_name, last_name, phone`,
        [
          email.toLowerCase(),
          passwordHash,
          wants_athlete,
          wants_coach,
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
      `SELECT id, email, password_hash, role, status, is_admin, athlete_id, coach_id,
              first_name, last_name, phone
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
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        is_admin: user.is_admin,
        athlete_id: user.athlete_id,
        coach_id: user.coach_id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
      },
    });
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

    const { first_name, last_name, phone } = req.body ?? {};

    for (const [field, value, maxLen] of [
      ["first_name", first_name, 100],
      ["last_name", last_name, 100],
      ["phone", phone, 50],
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

    const { rows } = await pool.query(
      `UPDATE nk_users SET
         first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         phone      = COALESCE($3, phone),
         updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, role, status, is_admin, athlete_id, coach_id,
                 first_name, last_name, phone`,
      [first_name, last_name, phone, req.user.id]
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

    const { role } = req.body ?? {};
    if (role !== "athlete" && role !== "coach") {
      return res
        .status(400)
        .json({ error: { message: "role must be 'athlete' or 'coach'" } });
    }
    if (role === "athlete" && !req.user.athlete_id) {
      return res
        .status(400)
        .json({ error: { message: "You don't have an athlete profile" } });
    }
    if (role === "coach" && !req.user.coach_id) {
      return res
        .status(400)
        .json({ error: { message: "You don't have a coach profile" } });
    }

    const { rows } = await pool.query(
      `UPDATE nk_users SET role = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, role, status, is_admin, athlete_id, coach_id,
                 first_name, last_name, phone`,
      [role, req.user.id]
    );

    res.json({ user: rows[0] });
  })
);

module.exports = router;
