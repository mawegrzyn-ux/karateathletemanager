// authorize() -> any logged-in, active user
// authorize('admin') -> logged-in, active, and role === 'admin'
// authorize('admin', 'coach') -> role is one of the given roles
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: "Not authenticated" } });
    }

    if (req.user.status !== "active") {
      return res
        .status(403)
        .json({ error: { message: "Account pending approval" } });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    next();
  };
}

module.exports = authorize;
