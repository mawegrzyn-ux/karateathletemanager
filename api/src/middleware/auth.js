const pool = require("../db/pool");
const { verifySession } = require("../utils/jwt");

// Attaches req.user from the session cookie (or null). Never blocks by
// itself — routes that need a logged-in/authorized user use authorize().
async function auth(req, res, next) {
  const token = req.cookies?.session;
  const payload = token ? verifySession(token) : null;

  if (!payload) {
    req.user = null;
    return next();
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, status, athlete_id, coach_id,
              first_name, last_name, phone
       FROM nk_users WHERE id = $1`,
      [payload.id]
    );
    req.user = rows[0] ?? null;
  } catch (err) {
    console.error(err);
    req.user = null;
  }

  next();
}

module.exports = auth;
