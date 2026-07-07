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

const ROLES = ["head coach", "assistant"];

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
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"closed" | "create" | Coach>("closed");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    Promise.all([
      api.get<{ coaches: Coach[] }>("/admin/coaches"),
      api.get<{ athletes: Athlete[] }>("/athletes"),
    ])
      .then(([coachesRes, athletesRes]) => {
        setCoaches(coachesRes.coaches);
        setAthletes(athletesRes.athletes);
      })
      .catch(() => setError("Failed to load coaches"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!coaches)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Coaches</h1>
        <AddButton onClick={openCreate} />
      </div>

      <div className="flex flex-col gap-2">
        {coaches.map((c) => (
          <button
            key={c.id}
            onClick={() => setDrawer(c)}
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-left font-medium"
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
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Last name">
            <input
              required
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Qualifications">
            <textarea
              value={form.qualifications}
              onChange={(e) =>
                setForm({ ...form, qualifications: e.target.value })
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
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
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
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Role">
              <select
                value={editing.role}
                onChange={(e) =>
                  updateCoach(editing.id, { role: e.target.value })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
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
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
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
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
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
                className="rounded-lg border border-slate-300 px-3 py-2"
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
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                <option value="">Not also an athlete</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.first_name} {a.last_name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
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
