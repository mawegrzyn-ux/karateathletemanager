// authorize() -> any logged-in, active user
// authorize('coach') -> logged-in, active, and (role === 'coach' or is_admin)
// authorize('coach', 'athlete') -> role is one of the given roles, or is_admin
// is_admin always bypasses the roles check - it's a durable privilege,
// independent of whichever role (athlete/coach/parent) the user is
// currently acting as.
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

    if (req.user.is_admin) {
      return next();
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    next();
  };
}

// requireAdmin -> logged-in, active, and is_admin. Unlike authorize(),
// no role ever satisfies this - only the durable is_admin flag does.
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { message: "Not authenticated" } });
  }

  if (req.user.status !== "active") {
    return res
      .status(403)
      .json({ error: { message: "Account pending approval" } });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({ error: { message: "Forbidden" } });
  }

  next();
}

// authenticated -> logged in only, no active-status or role check. For
// actions a not-yet-approved user must still be able to do before a
// coach/admin has processed them, e.g. uploading their own avatar.
function authenticated(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { message: "Not authenticated" } });
  }
  next();
}

authorize.requireAdmin = requireAdmin;
authorize.authenticated = authenticated;

module.exports = authorize;
