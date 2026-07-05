import { useEffect, useState } from "react";
import { useApi } from "../../hooks/useApi";
import type { Role, Status } from "../../context/AuthContext";
import { Badge, Spinner } from "../../components/ui";

interface ManagedUser {
  id: number;
  email: string;
  role: Role | null;
  status: Status;
  athlete_id: number | null;
  coach_id: number | null;
}

const ROLES: Role[] = ["admin", "coach", "athlete", "parent"];
const STATUSES: Status[] = ["pending", "active", "disabled"];

export default function AdminUsers() {
  const api = useApi();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ users: ManagedUser[] }>("/admin/users")
      .then((res) => setUsers(res.users))
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

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">Users</h1>
      {users.map((u) => (
        <div
          key={u.id}
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{u.email}</span>
            <Badge>{u.status}</Badge>
          </div>
          <div className="flex gap-2">
            <select
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2"
              value={u.role ?? ""}
              onChange={(e) =>
                updateUser(u.id, { role: (e.target.value || null) as Role })
              }
            >
              <option value="">No role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-2"
              value={u.status}
              onChange={(e) =>
                updateUser(u.id, { status: e.target.value as Status })
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
