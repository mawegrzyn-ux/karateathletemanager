import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClasses =
  "flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-3 font-medium shadow-card";

export default function More() {
  const { user, logout, switchRole } = useAuth();

  const availableRoles = (
    [
      { role: "athlete" as const, label: "Athlete", has: !!user?.athlete_id },
      { role: "coach" as const, label: "Coach", has: !!user?.coach_id },
      { role: "parent" as const, label: "Parent", has: !!user?.is_parent },
    ]
  ).filter((r) => r.has);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">More</h1>

      <Link to="/profile" className={linkClasses}>
        My profile
      </Link>

      {availableRoles.length >= 2 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-card">
          <span className="text-sm font-medium text-stone-700">
            Acting as
          </span>
          <div className="flex gap-1 rounded-full bg-stone-100 p-1">
            {availableRoles.map(({ role, label }) => (
              <button
                key={role}
                onClick={() => switchRole(role)}
                className={`min-h-[40px] flex-1 rounded-full px-3 text-sm font-medium transition-colors ${
                  user?.role === role
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-stone-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {user?.is_admin && (
        <>
          <Link to="/admin/users" className={linkClasses}>
            Manage users
          </Link>
          <Link to="/admin/coaches" className={linkClasses}>
            Manage coaches
          </Link>
          <Link to="/admin/katas" className={linkClasses}>
            Manage katas
          </Link>
          <Link to="/admin/karate-styles" className={linkClasses}>
            Manage karate styles
          </Link>
        </>
      )}

      {(user?.is_admin || user?.role === "coach") && (
        <>
          <Link to="/admin/clubs" className={linkClasses}>
            Manage clubs
          </Link>
          <Link to="/admin/associations" className={linkClasses}>
            Manage associations
          </Link>
          <Link to="/admin/training-modules" className={linkClasses}>
            Manage training modules
          </Link>
        </>
      )}

      <button
        onClick={() => logout()}
        className="min-h-[44px] rounded-full border border-stone-300 px-4 font-medium text-stone-700"
      >
        Log out
      </button>
    </div>
  );
}
