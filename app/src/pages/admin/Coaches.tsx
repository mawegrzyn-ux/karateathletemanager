import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../hooks/useApi";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
} from "../../components/ui";

interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
}

interface CoachRole {
  id: number;
  name: string;
}

interface KarateStyle {
  id: number;
  name: string;
}

interface Coach {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  qualifications: string | null;
  role: string;
  athlete_id: number | null;
  is_active: boolean;
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  qualifications: "",
  role: "assistant",
};

export default function Coaches() {
  const api = useApi();
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [roles, setRoles] = useState<CoachRole[]>([]);
  const [styles, setStyles] = useState<KarateStyle[]>([]);
  const [editingStyleIds, setEditingStyleIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Coach>("closed");
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<{ coaches: Coach[] }>("/admin/coaches"),
      api.get<{ athletes: Athlete[] }>("/athletes"),
      api.get<{ roles: CoachRole[] }>("/coach-roles"),
      api.get<{ styles: KarateStyle[] }>("/karate-styles"),
    ])
      .then(([coachesRes, athletesRes, rolesRes, stylesRes]) => {
        setCoaches(coachesRes.coaches);
        setAthletes(athletesRes.athletes);
        setRoles(rolesRes.roles);
        setStyles(stylesRes.styles);
      })
      .catch(() => setError("Failed to load coaches"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editingId = drawer !== "closed" && drawer !== "create" ? drawer.id : null;

  useEffect(() => {
    if (editingId == null) return;
    api
      .get<{ styleIds: number[] }>(`/admin/coaches/${editingId}/styles`)
      .then((res) => setEditingStyleIds(res.styleIds))
      .catch(() => setEditingStyleIds([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createCoach(e: FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const { coach } = await api.post<{ coach: Coach }>(
      "/admin/coaches",
      form
    );
    setCoaches((prev) => (prev ? [...prev, coach] : [coach]));
    setDrawer("closed");
  }

  async function updateCoach(id: number, patch: Record<string, unknown>) {
    const { coach } = await api.patch<{ coach: Coach }>(
      `/admin/coaches/${id}`,
      patch
    );
    setCoaches((prev) =>
      prev ? prev.map((c) => (c.id === id ? coach : c)) : prev
    );
    setDrawer((prev) =>
      prev !== "closed" && prev !== "create" && prev.id === id ? coach : prev
    );
  }

  async function deleteCoach(id: number) {
    await api.del(`/admin/coaches/${id}`);
    setCoaches((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    setDrawer("closed");
  }

  async function addStyle(coachId: number, styleId: number) {
    const next = [...editingStyleIds, styleId];
    await api.put(`/admin/coaches/${coachId}/styles`, { styleIds: next });
    setEditingStyleIds(next);
  }

  async function removeStyle(coachId: number, styleId: number) {
    const next = editingStyleIds.filter((id) => id !== styleId);
    await api.put(`/admin/coaches/${coachId}/styles`, { styleIds: next });
    setEditingStyleIds(next);
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!coaches)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filteredCoaches = coaches.filter((c) =>
    `${c.first_name} ${c.last_name}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Coaches</h1>
        <AddButton onClick={openCreate} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search coaches..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filteredCoaches.map((c) => (
          <button
            key={c.id}
            onClick={() => setDrawer(c)}
            className="flex min-h-[44px] items-center rounded-2xl bg-white px-4 py-3 text-left font-medium shadow-card"
          >
            {c.first_name} {c.last_name}
          </button>
        ))}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New coach"
      >
        <form onSubmit={createCoach} className="flex flex-col gap-4">
          <Field label="First name">
            <input
              required
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Last name">
            <input
              required
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Qualifications">
            <textarea
              value={form.qualifications}
              onChange={(e) =>
                setForm({ ...form, qualifications: e.target.value })
              }
              className="rounded-xl border border-stone-300 px-3 py-2"
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
        title={editing ? `${editing.first_name} ${editing.last_name}` : ""}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="First name">
              <input
                defaultValue={editing.first_name}
                onBlur={(e) => {
                  if (e.target.value !== editing.first_name) {
                    updateCoach(editing.id, { first_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Last name">
              <input
                defaultValue={editing.last_name}
                onBlur={(e) => {
                  if (e.target.value !== editing.last_name) {
                    updateCoach(editing.id, { last_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Role">
              <select
                value={editing.role}
                onChange={(e) =>
                  updateCoach(editing.id, { role: e.target.value })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Email">
              <input
                defaultValue={editing.email ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.email ?? "")) {
                    updateCoach(editing.id, { email: e.target.value });
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
                    updateCoach(editing.id, { phone: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Qualifications">
              <textarea
                defaultValue={editing.qualifications ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.qualifications ?? "")) {
                    updateCoach(editing.id, {
                      qualifications: e.target.value,
                    });
                  }
                }}
                className="rounded-xl border border-stone-300 px-3 py-2"
              />
            </Field>
            <Field label="Also an athlete?">
              <select
                value={editing.athlete_id ?? ""}
                onChange={(e) =>
                  updateCoach(editing.id, {
                    athlete_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              >
                <option value="">Not also an athlete</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.first_name} {a.last_name}
                  </option>
                ))}
              </select>
            </Field>
            <StylePicker
              ids={editingStyleIds}
              options={styles}
              onAdd={(id) => addStyle(editing.id, id)}
              onRemove={(id) => removeStyle(editing.id, id)}
            />
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) =>
                  updateCoach(editing.id, { is_active: e.target.checked })
                }
              />
              Active
            </label>
            <DeleteButton
              onClick={() => deleteCoach(editing.id)}
              itemLabel={`${editing.first_name} ${editing.last_name}`}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function StylePicker({
  ids,
  options,
  onAdd,
  onRemove,
}: {
  ids: number[];
  options: KarateStyle[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Styles ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search styles..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => (added ? onRemove(o.id) : onAdd(o.id))}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span>{o.name}</span>
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
