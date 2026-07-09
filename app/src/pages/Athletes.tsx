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

interface KarateStyle {
  id: number;
  name: string;
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
  const [styleNames, setStyleNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ athlete: Athlete }>(`/athletes/${athleteId}`),
      api.get<{ styleIds: number[] }>(`/athletes/${athleteId}/styles`),
      api.get<{ styles: KarateStyle[] }>("/karate-styles"),
    ])
      .then(([athleteRes, styleIdsRes, stylesRes]) => {
        setAthlete(athleteRes.athlete);
        const ids = new Set(styleIdsRes.styleIds);
        setStyleNames(
          stylesRes.styles.filter((s) => ids.has(s.id)).map((s) => s.name)
        );
      })
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
        label="Styles"
        value={styleNames.length > 0 ? styleNames.join(", ") : "—"}
      />
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

      <LinkParentPin athleteId={athlete.id} />
    </div>
  );
}

function LinkParentPin({ athleteId }: { athleteId: number }) {
  const api = useApi();
  const [pin, setPin] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function generate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ pin: string; expires_at: string }>(
        `/athletes/${athleteId}/generate-pin`,
        {}
      );
      setPin(res.pin);
      setExpiresAt(res.expires_at);
    } catch {
      setError("Failed to generate a PIN");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
      <span className="text-sm font-medium text-slate-700">
        Link a parent
      </span>
      <p className="text-sm text-slate-600">
        Generate a one-time code and share it with your parent. They enter
        it on their own profile to link to yours.
      </p>
      {pin && (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white py-3">
          <span className="text-3xl font-semibold tracking-widest">
            {pin}
          </span>
          <span className="text-xs text-slate-500">
            Expires {new Date(expiresAt!).toLocaleTimeString()} or once used
          </span>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={generate}
        disabled={submitting}
        className="min-h-[44px] rounded-lg bg-red-700 font-medium text-white disabled:opacity-50"
      >
        {pin ? "Generate new PIN" : "Generate PIN"}
      </button>
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
  const [styles, setStyles] = useState<KarateStyle[]>([]);
  const [editingStyleIds, setEditingStyleIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | Athlete>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    load("");
    api
      .get<{ styles: KarateStyle[] }>("/karate-styles")
      .then((res) => setStyles(res.styles))
      .catch(() => setStyles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editingId = drawer !== "closed" && drawer !== "create" ? drawer.id : null;

  useEffect(() => {
    if (editingId == null) return;
    api
      .get<{ styleIds: number[] }>(`/athletes/${editingId}/styles`)
      .then((res) => setEditingStyleIds(res.styleIds))
      .catch(() => setEditingStyleIds([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function load(q: string) {
    const path = q ? `/athletes?q=${encodeURIComponent(q)}` : "/athletes";
    api
      .get<{ athletes: Athlete[] }>(path)
      .then((res) => setAthletes(res.athletes))
      .catch(() => setError("Failed to load athletes"));
  }

  async function addStyle(athleteId: number, styleId: number) {
    const next = [...editingStyleIds, styleId];
    await api.put(`/athletes/${athleteId}/styles`, { styleIds: next });
    setEditingStyleIds(next);
  }

  async function removeStyle(athleteId: number, styleId: number) {
    const next = editingStyleIds.filter((id) => id !== styleId);
    await api.put(`/athletes/${athleteId}/styles`, { styleIds: next });
    setEditingStyleIds(next);
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
            <StylePicker
              ids={editingStyleIds}
              options={styles}
              onAdd={(id) => addStyle(editing.id, id)}
              onRemove={(id) => removeStyle(editing.id, id)}
            />
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
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-600">
        Styles ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search styles..."
        className="min-h-[44px] rounded-lg border border-slate-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const added = ids.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => (added ? onRemove(o.id) : onAdd(o.id))}
              className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 text-left ${
                added
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-slate-200"
              }`}
            >
              <span>{o.name}</span>
              <span className="text-sm">{added ? "✓ Added" : "+ Add"}</span>
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
