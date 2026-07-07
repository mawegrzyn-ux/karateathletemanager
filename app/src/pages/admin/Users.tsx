import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import type { Role, Status } from "../../context/AuthContext";
import { Badge, Spinner, Drawer, Field } from "../../components/ui";

interface ManagedUser {
  id: number;
  email: string;
  role: Role | null;
  status: Status;
  athlete_id: number | null;
  coach_id: number | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

interface Person {
  id: number;
  first_name: string;
  last_name: string;
}

const ROLES: Role[] = ["admin", "coach", "athlete", "parent"];
const STATUSES: Status[] = ["pending", "active", "disabled"];

export default function AdminUsers() {
  const api = useApi();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [athletes, setAthletes] = useState<Person[]>([]);
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ users: ManagedUser[] }>("/admin/users"),
      api.get<{ athletes: Person[] }>("/athletes"),
      api.get<{ coaches: Person[] }>("/admin/coaches"),
    ])
      .then(([usersRes, athletesRes, coachesRes]) => {
        setUsers(usersRes.users);
        setAthletes(athletesRes.athletes);
        setCoaches(coachesRes.coaches);
      })
      .catch(() => setError("Failed to load users"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateUser(id: number, patch: Partial<ManagedUser>) {
    const { user } = await api.patch<{ user: ManagedUser }>(
      `/admin/users/${id}`,
      patch
    );
    setUsers((prev) =>
      prev ? prev.map((u) => (u.id === id ? user : u)) : prev
    );
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!users)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = users.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">Users</h1>

      <div className="flex flex-col gap-2">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setSelectedId(u.id)}
            className="flex min-h-[44px] items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left"
          >
            <span className="font-medium">
              {u.first_name || u.last_name
                ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
                : u.email}
            </span>
            <Badge>{u.status}</Badge>
          </button>
        ))}
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setSelectedId(null)}
        title={editing?.email ?? ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="First name">
              <input
                defaultValue={editing.first_name ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.first_name ?? "")) {
                    updateUser(editing.id, { first_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Last name">
              <input
                defaultValue={editing.last_name ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.last_name ?? "")) {
                    updateUser(editing.id, { last_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Phone">
              <input
                defaultValue={editing.phone ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.phone ?? "")) {
                    updateUser(editing.id, { phone: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Role">
              <select
                value={editing.role ?? ""}
                onChange={(e) =>
                  updateUser(editing.id, {
                    role: (e.target.value || null) as Role,
                  })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                <option value="">No role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={editing.status}
                onChange={(e) =>
                  updateUser(editing.id, { status: e.target.value as Status })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <PersonPicker
              label="Linked athlete"
              selectedId={editing.athlete_id}
              options={athletes}
              onSelect={(id) => updateUser(editing.id, { athlete_id: id })}
            />
            <PersonPicker
              label="Linked coach"
              selectedId={editing.coach_id}
              options={coaches}
              onSelect={(id) => updateUser(editing.id, { coach_id: id })}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function PersonPicker({
  label,
  selectedId,
  options,
  onSelect,
}: {
  label: string;
  selectedId: number | null;
  options: Person[];
  onSelect: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(selected ? null : o.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 text-left ${
                selected
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-slate-200"
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
          <p className="px-1 py-2 text-sm text-slate-500">No matches.</p>
        )}
      </div>
    </div>
  );
}
