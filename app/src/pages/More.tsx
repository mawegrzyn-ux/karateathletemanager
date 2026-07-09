import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
      <h1 className="text-xl font-semibold">More</h1>

      <Link
        to="/profile"
        className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
      >
        My profile
      </Link>

      {availableRoles.length >= 2 && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <span className="text-sm font-medium text-slate-700">
            Acting as
          </span>
          <div className="flex gap-2">
            {availableRoles.map(({ role, label }) => (
              <button
                key={role}
                onClick={() => switchRole(role)}
                className={`min-h-[44px] flex-1 rounded-lg border px-3 font-medium ${
                  user?.role === role
                    ? "border-red-700 bg-red-700 text-white"
                    : "border-slate-300 text-slate-700"
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
          <Link
            to="/admin/users"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage users
          </Link>
          <Link
            to="/admin/coaches"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage coaches
          </Link>
          <Link
            to="/admin/katas"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage katas
          </Link>
          <Link
            to="/admin/karate-styles"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage karate styles
          </Link>
        </>
      )}

      {(user?.is_admin || user?.role === "coach") && (
        <>
          <Link
            to="/admin/clubs"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage clubs
          </Link>
          <Link
            to="/admin/associations"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage associations
          </Link>
          <Link
            to="/admin/training-modules"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage training modules
          </Link>
        </>
      )}

      <button
        onClick={() => logout()}
        className="min-h-[44px] rounded-lg border border-slate-300 px-4 font-medium text-slate-700"
      >
        Log out
      </button>
    </div>
  );
}
