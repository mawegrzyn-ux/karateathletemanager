const jwt = require("jsonwebtoken");

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function signSession(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

function verifySession(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { signSession, verifySession, SESSION_MAX_AGE_MS };
