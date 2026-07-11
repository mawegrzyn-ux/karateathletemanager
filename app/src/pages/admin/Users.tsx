import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import type { Role, Status } from "../../context/AuthContext";
import { Badge, Spinner, Drawer, Field, DeleteButton } from "../../components/ui";

interface ManagedUser {
  id: number;
  email: string;
  role: Role | null;
  status: Status;
  is_admin: boolean;
  athlete_id: number | null;
  coach_id: number | null;
  athlete_ids: number[];
  coach_ids: number[];
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

interface Person {
  id: number;
  first_name: string;
  last_name: string;
}

const ROLES: Role[] = ["coach", "athlete", "parent"];
const STATUSES: Status[] = ["pending", "active", "disabled"];

export default function AdminUsers() {
  const api = useApi();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [athletes, setAthletes] = useState<Person[]>([]);
  const [coaches, setCoaches] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

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
      prev ? prev.map((u) => (u.id === id ? { ...u, ...user } : u)) : prev
    );
  }

  async function deleteUser(id: number) {
    await api.del(`/admin/users/${id}`);
    setUsers((prev) => (prev ? prev.filter((u) => u.id !== id) : prev));
    setSelectedId(null);
  }

  async function addLinkedProfile(
    userId: number,
    kind: "athlete" | "coach",
    idValue: string
  ) {
    const id = Number(idValue);
    if (!Number.isInteger(id) || id <= 0) return;
    const current = users?.find((u) => u.id === userId);
    if (!current) return;
    const key = kind === "athlete" ? "athlete_ids" : "coach_ids";
    if (current[key].includes(id)) return;
    const nextIds = [...current[key], id];
    const path =
      kind === "athlete"
        ? `/admin/users/${userId}/athletes`
        : `/admin/users/${userId}/coaches`;
    const body =
      kind === "athlete" ? { athleteIds: nextIds } : { coachIds: nextIds };
    await api.put(path, body);
    setUsers((prev) =>
      prev
        ? prev.map((u) => (u.id === userId ? { ...u, [key]: nextIds } : u))
        : prev
    );
  }

  async function removeLinkedProfile(
    userId: number,
    kind: "athlete" | "coach",
    id: number
  ) {
    const current = users?.find((u) => u.id === userId);
    if (!current) return;
    const key = kind === "athlete" ? "athlete_ids" : "coach_ids";
    const nextIds = current[key].filter((existing) => existing !== id);
    const path =
      kind === "athlete"
        ? `/admin/users/${userId}/athletes`
        : `/admin/users/${userId}/coaches`;
    const body =
      kind === "athlete" ? { athleteIds: nextIds } : { coachIds: nextIds };
    await api.put(path, body);
    setUsers((prev) =>
      prev
        ? prev.map((u) => (u.id === userId ? { ...u, [key]: nextIds } : u))
        : prev
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
  const q = query.trim().toLowerCase();
  const filteredUsers = users.filter((u) =>
    `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email}`
      .toLowerCase()
      .includes(q)
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search users..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filteredUsers.map((u) => (
          <button
            key={u.id}
            onClick={() => setSelectedId(u.id)}
            className="flex min-h-[44px] items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-left"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 px-3">
              <input
                type="checkbox"
                checked={editing.is_admin}
                onChange={(e) =>
                  updateUser(editing.id, { is_admin: e.target.checked })
                }
              />
              Admin access
            </label>

            <MemberEditor
              label="Linked athlete profiles"
              ids={editing.athlete_ids}
              options={athletes}
              onAdd={(value) => addLinkedProfile(editing.id, "athlete", value)}
              onRemove={(id) => removeLinkedProfile(editing.id, "athlete", id)}
            />
            <MemberEditor
              label="Linked coach profiles"
              ids={editing.coach_ids}
              options={coaches}
              onAdd={(value) => addLinkedProfile(editing.id, "coach", value)}
              onRemove={(id) => removeLinkedProfile(editing.id, "coach", id)}
            />

            <DeleteButton
              onClick={() => deleteUser(editing.id)}
              itemLabel={
                editing.first_name || editing.last_name
                  ? `${editing.first_name ?? ""} ${editing.last_name ?? ""}`.trim()
                  : editing.email
              }
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function MemberEditor({
  label,
  ids,
  options,
  onAdd,
  onRemove,
}: {
  label: string;
  ids: number[];
  options: Person[];
  onAdd: (value: string) => void;
  onRemove: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        {label} ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => (added ? onRemove(o.id) : onAdd(String(o.id)))}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span>
                {o.first_name} {o.last_name}
              </span>
              <span className="text-sm">{added ? "✓ Added" : "+ Add"}</span>
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
