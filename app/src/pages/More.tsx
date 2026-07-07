import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function More() {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">More</h1>

      <Link
        to="/profile"
        className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
      >
        My profile
      </Link>

      {user?.role === "admin" && (
        <>
          <Link
            to="/admin/users"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage users
          </Link>
          <Link
            to="/admin/clubs"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage clubs
          </Link>
          <Link
            to="/admin/coaches"
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 font-medium"
          >
            Manage coaches
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
