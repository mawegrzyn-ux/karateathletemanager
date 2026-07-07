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
         RETURNING id, email, role, status`,
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
      `SELECT id, email, password_hash, role, status
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

module.exports = router;
