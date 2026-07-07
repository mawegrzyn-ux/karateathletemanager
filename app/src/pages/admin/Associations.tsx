import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
} from "../../components/ui";

interface Association {
  id: number;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

interface Person {
  id: number;
  first_name: string;
  last_name: string;
}

const EMPTY_FORM = { name: "", description: "", contact_email: "", contact_phone: "" };

export default function Associations() {
  const api = useApi();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [associations, setAssociations] = useState<Association[] | null>(
    null
  );
  const [allCoaches, setAllCoaches] = useState<Person[]>([]);
  const [admins, setAdmins] = useState<Record<number, number[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Association>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const associationsRes = await api.get<{ associations: Association[] }>(
        "/admin/associations"
      );
      setAssociations(associationsRes.associations);

      if (isAdmin) {
        const coachesRes = await api.get<{ coaches: Person[] }>(
          "/admin/coaches"
        );
        setAllCoaches(coachesRes.coaches);

        const entries = await Promise.all(
          associationsRes.associations.map(async (a) => {
            const res = await api.get<{ coachIds: number[] }>(
              `/admin/associations/${a.id}/admins`
            );
            return [a.id, res.coachIds] as const;
          })
        );
        setAdmins(Object.fromEntries(entries));
      }
    } catch {
      setError("Failed to load associations");
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createAssociation(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { association } = await api.post<{ association: Association }>(
      "/admin/associations",
      form
    );
    setAssociations((prev) => (prev ? [...prev, association] : [association]));
    setAdmins((prev) => ({ ...prev, [association.id]: [] }));
    setDrawer("closed");
  }

  async function updateAssociation(id: number, patch: Partial<Association>) {
    const { association } = await api.patch<{ association: Association }>(
      `/admin/associations/${id}`,
      patch
    );
    setAssociations((prev) =>
      prev ? prev.map((a) => (a.id === id ? association : a)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id
        ? association
        : prev
    );
  }

  async function deleteAssociation(id: number) {
    await api.del(`/admin/associations/${id}`);
    setAssociations((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    setDrawer("closed");
  }

  async function addAdmin(associationId: number, idValue: string) {
    const id = Number(idValue);
    const current = admins[associationId] ?? [];
    if (current.includes(id)) return;
    const nextIds = [...current, id];
    await api.put(`/admin/associations/${associationId}/admins`, {
      coachIds: nextIds,
    });
    setAdmins((prev) => ({ ...prev, [associationId]: nextIds }));
  }

  async function removeAdmin(associationId: number, id: number) {
    const current = admins[associationId] ?? [];
    const nextIds = current.filter((existing) => existing !== id);
    await api.put(`/admin/associations/${associationId}/admins`, {
      coachIds: nextIds,
    });
    setAdmins((prev) => ({ ...prev, [associationId]: nextIds }));
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!associations)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filteredAssociations = associations.filter((a) =>
    a.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Associations</h1>
        {isAdmin && <AddButton onClick={openCreate} />}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search associations..."
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filteredAssociations.map((a) => (
          <button
            key={a.id}
            onClick={() => setDrawer(a)}
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-left font-medium"
          >
            {a.name}
          </button>
        ))}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New association"
      >
        <form onSubmit={createAssociation} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) =>
                setForm({ ...form, contact_email: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={form.contact_phone}
              onChange={(e) =>
                setForm({ ...form, contact_phone: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </Field>
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-red-700 font-medium text-white"
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
                    updateAssociation(editing.id, { name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Contact email">
              <input
                defaultValue={editing.contact_email ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.contact_email ?? "")) {
                    updateAssociation(editing.id, {
                      contact_email: e.target.value,
                    });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Contact phone">
              <input
                defaultValue={editing.contact_phone ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.contact_phone ?? "")) {
                    updateAssociation(editing.id, {
                      contact_phone: e.target.value,
                    });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Description">
              <textarea
                defaultValue={editing.description ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.description ?? "")) {
                    updateAssociation(editing.id, {
                      description: e.target.value,
                    });
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </Field>

            {isAdmin && (
              <CoachAdminEditor
                ids={admins[editing.id] ?? []}
                options={allCoaches}
                onAdd={(value) => addAdmin(editing.id, value)}
                onRemove={(id) => removeAdmin(editing.id, id)}
              />
            )}

            {isAdmin && (
              <DeleteButton
                onClick={() => deleteAssociation(editing.id)}
                itemLabel={editing.name}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function CoachAdminEditor({
  ids,
  options,
  onAdd,
  onRemove,
}: {
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
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">
        Coach admins ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search coaches..."
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => (added ? onRemove(o.id) : onAdd(String(o.id)))}
              className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 text-left ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-slate-200"
              }`}
            >
              <span>
                {o.first_name} {o.last_name}
              </span>
              <span className="text-sm">{added ? "✓ Admin" : "+ Add"}</span>
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
