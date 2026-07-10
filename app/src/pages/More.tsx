import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Tile({
  to,
  icon,
  label,
}: {
  to: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-white p-2 text-center shadow-card"
    >
      <span className="text-3xl leading-none">{icon}</span>
      <span className="text-xs font-medium text-stone-700">{label}</span>
    </Link>
  );
}

function TileGrid({ children }: PropsWithChildren) {
  return <div className="grid grid-cols-3 gap-3">{children}</div>;
}

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
    <div className="flex flex-col gap-5 p-4">
      <h1 className="text-2xl font-bold tracking-tight">More</h1>

      <TileGrid>
        <Tile to="/profile" icon="👤" label="My profile" />
      </TileGrid>

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
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Admin
          </span>
          <TileGrid>
            <Tile to="/admin/users" icon="🔐" label="Users" />
            <Tile to="/admin/coaches" icon="🧑‍🏫" label="Coaches" />
            <Tile to="/admin/coach-roles" icon="🏷️" label="Coach roles" />
            <Tile to="/admin/katas" icon="📜" label="Katas" />
            <Tile to="/admin/karate-styles" icon="🥋" label="Karate styles" />
          </TileGrid>
        </div>
      )}

      {(user?.is_admin || user?.role === "coach") && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Coach
          </span>
          <TileGrid>
            <Tile to="/admin/clubs" icon="🏯" label="Clubs" />
            <Tile to="/admin/associations" icon="🌐" label="Associations" />
            <Tile
              to="/admin/training-modules"
              icon="💪"
              label="Training modules"
            />
          </TileGrid>
        </div>
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
