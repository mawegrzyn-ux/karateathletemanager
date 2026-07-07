import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { Spinner, Drawer, AddButton, DeleteButton, Field } from "../components/ui";

interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  belt: string;
  join_date: string;
  medical_notes: string | null;
  is_active: boolean;
}

const BELTS = [
  "white",
  "yellow",
  "orange",
  "green",
  "blue",
  "purple",
  "brown",
  "black",
];

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  email: "",
  phone: "",
  emergency_name: "",
  emergency_phone: "",
  belt: "white",
  medical_notes: "",
};

export default function Athletes() {
  const { user } = useAuth();

  if (user?.is_admin || user?.role === "coach") {
    return <AthletesManager isAdmin={!!user.is_admin} />;
  }

  if (user?.role === "athlete" && user.athlete_id) {
    return <MyAthleteProfile athleteId={user.athlete_id} />;
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Athletes</h1>
      <p className="text-slate-600">
        Ask your coach for your athlete profile and grade info.
      </p>
    </div>
  );
}

function MyAthleteProfile({ athleteId }: { athleteId: number }) {
  const api = useApi();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ athlete: Athlete }>(`/athletes/${athleteId}`)
      .then((res) => setAthlete(res.athlete))
      .catch(() => setError("Failed to load your athlete profile"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!athlete)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">
        {athlete.first_name} {athlete.last_name}
      </h1>
      <ReadOnlyField label="Belt" value={athlete.belt} />
      <ReadOnlyField
        label="Date of birth"
        value={athlete.date_of_birth ?? "—"}
      />
      <ReadOnlyField label="Email" value={athlete.email ?? "—"} />
      <ReadOnlyField label="Phone" value={athlete.phone ?? "—"} />
      <ReadOnlyField
        label="Emergency contact name"
        value={athlete.emergency_name ?? "—"}
      />
      <ReadOnlyField
        label="Emergency phone"
        value={athlete.emergency_phone ?? "—"}
      />
      <ReadOnlyField label="Join date" value={athlete.join_date.slice(0, 10)} />
      <ReadOnlyField
        label="Medical notes"
        value={athlete.medical_notes ?? "—"}
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
        {value}
      </span>
    </div>
  );
}

function AthletesManager({ isAdmin }: { isAdmin: boolean }) {
  const api = useApi();
  const [athletes, setAthletes] = useState<Athlete[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | Athlete>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(q: string) {
    const path = q ? `/athletes?q=${encodeURIComponent(q)}` : "/athletes";
    api
      .get<{ athletes: Athlete[] }>(path)
      .then((res) => setAthletes(res.athletes))
      .catch(() => setError("Failed to load athletes"));
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load(query);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDrawer("create");
  }

  async function createAthlete(e: FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const { athlete } = await api.post<{ athlete: Athlete }>("/athletes", {
      ...form,
      date_of_birth: form.date_of_birth || null,
    });
    setAthletes((prev) => (prev ? [...prev, athlete] : [athlete]));
    setDrawer("closed");
  }

  async function updateAthlete(id: number, patch: Record<string, unknown>) {
    const { athlete } = await api.patch<{ athlete: Athlete }>(
      `/athletes/${id}`,
      patch
    );
    setAthletes((prev) =>
      prev ? prev.map((a) => (a.id === id ? athlete : a)) : prev
    );
    setDrawer((prev) => (prev !== "closed" && prev !== "create" && prev.id === id ? athlete : prev));
  }

  async function deleteAthlete(id: number) {
    await api.del(`/athletes/${id}`);
    setAthletes((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    setDrawer("closed");
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!athletes)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Athletes</h1>
        <AddButton onClick={openCreate} />
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-lg border border-slate-300 px-4 font-medium"
        >
          Search
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {athletes.map((a) => (
          <button
            key={a.id}
            onClick={() => setDrawer(a)}
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-left font-medium"
          >
            {a.first_name} {a.last_name}
          </button>
        ))}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New athlete"
      >
        <form onSubmit={createAthlete} className="flex flex-col gap-4">
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
          <Field label="Belt">
            <select
              value={form.belt}
              onChange={(e) => setForm({ ...form, belt: e.target.value })}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            >
              {BELTS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) =>
                setForm({ ...form, date_of_birth: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
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
          <Field label="Emergency contact name">
            <input
              value={form.emergency_name}
              onChange={(e) =>
                setForm({ ...form, emergency_name: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Emergency phone">
            <input
              value={form.emergency_phone}
              onChange={(e) =>
                setForm({ ...form, emergency_phone: e.target.value })
              }
              className="min-h-[44px] rounded-lg border border-slate-300 px-3"
            />
          </Field>
          <Field label="Medical notes">
            <textarea
              value={form.medical_notes}
              onChange={(e) =>
                setForm({ ...form, medical_notes: e.target.value })
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
                    updateAthlete(editing.id, { first_name: e.target.value });
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
                    updateAthlete(editing.id, { last_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Belt">
              <select
                value={editing.belt}
                onChange={(e) =>
                  updateAthlete(editing.id, { belt: e.target.value })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              >
                {BELTS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                defaultValue={editing.date_of_birth ?? ""}
                onChange={(e) =>
                  updateAthlete(editing.id, {
                    date_of_birth: e.target.value || null,
                  })
                }
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Email">
              <input
                defaultValue={editing.email ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.email ?? "")) {
                    updateAthlete(editing.id, { email: e.target.value });
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
                    updateAthlete(editing.id, { phone: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Emergency contact name">
              <input
                defaultValue={editing.emergency_name ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.emergency_name ?? "")) {
                    updateAthlete(editing.id, {
                      emergency_name: e.target.value,
                    });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Emergency phone">
              <input
                defaultValue={editing.emergency_phone ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.emergency_phone ?? "")) {
                    updateAthlete(editing.id, {
                      emergency_phone: e.target.value,
                    });
                  }
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 px-3"
              />
            </Field>
            <Field label="Medical notes">
              <textarea
                defaultValue={editing.medical_notes ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.medical_notes ?? "")) {
                    updateAthlete(editing.id, {
                      medical_notes: e.target.value,
                    });
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) =>
                  updateAthlete(editing.id, { is_active: e.target.checked })
                }
              />
              Active
            </label>
            {isAdmin && (
              <DeleteButton
                onClick={() => deleteAthlete(editing.id)}
                itemLabel={`${editing.first_name} ${editing.last_name}`}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
