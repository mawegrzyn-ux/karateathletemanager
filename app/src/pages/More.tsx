import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function More() {
  const { user, logout, switchRole } = useAuth();

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">More</h1>

      <Link
        to="/profile"
        className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
      >
        My profile
      </Link>

      {user?.athlete_id && user?.coach_id && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <span className="text-sm font-medium text-slate-700">
            Acting as
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => switchRole("athlete")}
              className={`min-h-[44px] flex-1 rounded-lg border px-3 font-medium ${
                user.role === "athlete"
                  ? "border-red-700 bg-red-700 text-white"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              Athlete
            </button>
            <button
              onClick={() => switchRole("coach")}
              className={`min-h-[44px] flex-1 rounded-lg border px-3 font-medium ${
                user.role === "coach"
                  ? "border-red-700 bg-red-700 text-white"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              Coach
            </button>
          </div>
        </div>
      )}

      {user?.role === "admin" && (
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
        </>
      )}

      {(user?.role === "admin" || user?.role === "coach") && (
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
