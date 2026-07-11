import { useEffect, useState, type PropsWithChildren } from "react";
import { Link } from "react-router-dom";
import { useAuth, type Profile } from "../context/AuthContext";
import { Drawer } from "../components/ui";

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
  const { user, logout, switchRole, fetchMyProfiles } = useAuth();
  const [profiles, setProfiles] = useState<{
    athletes: Profile[];
    coaches: Profile[];
  }>({ athletes: [], coaches: [] });
  const [picker, setPicker] = useState<"athlete" | "coach" | null>(null);

  useEffect(() => {
    if (user?.athlete_id || user?.coach_id) {
      fetchMyProfiles().then(setProfiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.athlete_id, user?.coach_id]);

  const availableRoles = (
    [
      { role: "athlete" as const, label: "Athlete", has: !!user?.athlete_id },
      { role: "coach" as const, label: "Coach", has: !!user?.coach_id },
      { role: "parent" as const, label: "Parent", has: !!user?.is_parent },
    ]
  ).filter((r) => r.has);

  async function handleRoleClick(role: "athlete" | "coach" | "parent") {
    if (role === "athlete" && profiles.athletes.length > 1) {
      setPicker("athlete");
      return;
    }
    if (role === "coach" && profiles.coaches.length > 1) {
      setPicker("coach");
      return;
    }
    await switchRole(role);
  }

  const pickerOptions =
    picker === "athlete"
      ? profiles.athletes
      : picker === "coach"
        ? profiles.coaches
        : [];
  const pickerSelectedId =
    picker === "athlete" ? user?.athlete_id : user?.coach_id;

  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="text-2xl font-bold tracking-tight">More</h1>

      <TileGrid>
        <Tile to="/profile" icon="👤" label="My profile" />
        <Tile to="/grades" icon="🥋" label="Grades" />
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
                onClick={() => handleRoleClick(role)}
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

      <Drawer
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={`Choose ${picker ?? ""} profile`}
      >
        <ProfilePicker
          options={pickerOptions}
          selectedId={pickerSelectedId ?? null}
          onSelect={async (id) => {
            if (picker) await switchRole(picker, id);
            setPicker(null);
          }}
        />
      </Drawer>

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

function ProfilePicker({
  options,
  selectedId,
  onSelect,
}: {
  options: Profile[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search profiles..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                selected
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span>
                {o.first_name} {o.last_name}
              </span>
              <span className="text-sm">
                {selected ? "✓ Selected" : "Select"}
              </span>
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
        )}
      </div>
    </div>
  );
}
