import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../../components/ui";

interface CoachRole {
  id: number;
  name: string;
}

const EMPTY_FORM = { name: "" };

export default function CoachRoles() {
  const api = useApi();
  const [roles, setRoles] = useState<CoachRole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | CoachRole>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get<{ roles: CoachRole[] }>("/coach-roles")
      .then((res) => setRoles(res.roles))
      .catch(() => setError("Failed to load coach roles"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createRole(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { role } = await api.post<{ role: CoachRole }>(
      "/coach-roles",
      form
    );
    setRoles((prev) => (prev ? [...prev, role] : [role]));
    setDrawer("closed");
  }

  async function updateRole(id: number, patch: Record<string, unknown>) {
    const { role } = await api.patch<{ role: CoachRole }>(
      `/coach-roles/${id}`,
      patch
    );
    setRoles((prev) =>
      prev ? prev.map((r) => (r.id === id ? role : r)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? role : prev
    );
  }

  async function deleteRole(id: number) {
    await api.del(`/coach-roles/${id}`);
    setRoles((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!roles)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = roles.filter((r) =>
    r.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Coach roles</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search coach roles..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => setDrawer(r)}
            className="flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            {r.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">
            No coach roles yet.
          </p>
        )}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New coach role"
      >
        <form onSubmit={createRole} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <button
            type="submit"
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
          >
            Create
          </button>
        </form>
      </Drawer>

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.name ?? ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                defaultValue={editing.name}
                onBlur={(e) => {
                  if (e.target.value !== editing.name) {
                    updateRole(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <DeleteButton
              onClick={() => deleteRole(editing.id)}
              itemLabel={editing.name}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
