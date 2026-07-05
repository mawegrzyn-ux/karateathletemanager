// Placeholder — no auth strategy has been decided yet. Wire up real
// session/JWT verification here before this app handles real user data.
function auth(req, res, next) {
  next();
}

module.exports = auth;
