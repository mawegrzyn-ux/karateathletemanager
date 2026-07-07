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
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: { message: "Invalid email" } });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        error: { message: "Password must be at least 8 characters" },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_users (email, password_hash, role, status)
         VALUES (
           $1, $2,
           CASE WHEN (SELECT COUNT(*) FROM nk_users) = 0 THEN 'admin' ELSE NULL END,
           CASE WHEN (SELECT COUNT(*) FROM nk_users) = 0 THEN 'active' ELSE 'pending' END
         )
         RETURNING id, email, role, status, first_name, last_name, phone`,
        [email.toLowerCase(), passwordHash]
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
      `SELECT id, email, password_hash, role, status, first_name, last_name, phone
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
       RETURNING id, email, role, status, athlete_id, coach_id,
                 first_name, last_name, phone`,
      [first_name, last_name, phone, req.user.id]
    );

    res.json({ user: rows[0] });
  })
);

module.exports = router;
