import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  MediaField,
  Toast,
  BeltSwatch,
} from "../components/ui";
import { AthleteSelfProfile } from "../components/AthleteSelfProfile";

interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  grade_id: number | null;
  join_date: string;
  photo_url: string | null;
  medical_notes: string | null;
  is_active: boolean;
}

interface KarateStyle {
  id: number;
  name: string;
}

interface Grade {
  id: number;
  kind: string;
  rank_order: number;
  name: string;
  belt_color: string;
  club_id: number | null;
  club_name: string | null;
}

interface Grading {
  id: number;
  athlete_id: number;
  grade_id: number;
  event_id: number | null;
  recorded_by_coach_id: number | null;
  graded_at: string;
  grading_body: string | null;
  examiner: string | null;
  passed: boolean;
  next_grade_due: string | null;
  created_at: string;
}

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  email: "",
  phone: "",
  emergency_name: "",
  emergency_phone: "",
  grade_id: null as number | null,
  medical_notes: "",
};

export default function Athletes() {
  const { user } = useAuth();

  if (user?.is_admin || user?.role === "coach") {
    return <AthletesManager isAdmin={!!user.is_admin} />;
  }

  if (user?.role === "athlete" && user.athlete_id) {
    return (
      <div className="p-4">
        <AthleteSelfProfile athleteId={user.athlete_id} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Athletes</h1>
      <p className="text-stone-600">
        Ask your coach for your athlete profile and grade info.
      </p>
    </div>
  );
}

function AthletesManager({ isAdmin }: { isAdmin: boolean }) {
  const api = useApi();
  const [athletes, setAthletes] = useState<Athlete[] | null>(null);
  const [styles, setStyles] = useState<KarateStyle[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [editingStyleIds, setEditingStyleIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | Athlete>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [createPhotoUrl, setCreatePhotoUrl] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    load("");
    api
      .get<{ styles: KarateStyle[] }>("/karate-styles")
      .then((res) => setStyles(res.styles))
      .catch(() => setStyles([]));
    api
      .get<{ grades: Grade[] }>("/grades")
      .then((res) => setGrades(res.grades))
      .catch(() => setGrades([]));
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
    setCreatePhotoUrl("");
    setDrawer("create");
  }

  async function createAthlete(e: FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    const { athlete } = await api.post<{ athlete: Athlete }>("/athletes", {
      ...form,
      date_of_birth: form.date_of_birth || null,
      photo_url: createPhotoUrl || null,
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
        <h1 className="text-2xl font-bold tracking-tight">Athletes</h1>
        <AddButton onClick={openCreate} />
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
        />
        <button
          type="submit"
          className="min-h-[44px] rounded-xl border border-stone-300 px-4 font-medium"
        >
          Search
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {athletes.map((a) => (
          <button
            key={a.id}
            onClick={() => setDrawer(a)}
            className="flex min-h-[56px] items-stretch overflow-hidden rounded-2xl bg-white text-left font-medium shadow-card"
          >
            <AthleteThumb name={`${a.first_name} ${a.last_name}`} url={a.photo_url} />
            <span className="flex flex-1 flex-col justify-center gap-0.5 py-3 pl-4 pr-4">
              <span>
                {a.first_name} {a.last_name}
              </span>
              {a.grade_id != null &&
                (() => {
                  const grade = grades.find((g) => g.id === a.grade_id);
                  return grade ? (
                    <span className="flex items-center gap-1.5 text-sm font-normal text-stone-500">
                      <BeltSwatch color={grade.belt_color} />
                      {grade.name}
                    </span>
                  ) : null;
                })()}
            </span>
          </button>
        ))}
      </div>

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New athlete"
      >
        <form onSubmit={createAthlete} className="flex flex-col gap-4">
          <MediaField
            label="Photo"
            kind="image"
            value={createPhotoUrl}
            onChange={setCreatePhotoUrl}
            onError={showToast}
          />
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
          <GradePicker
            selectedId={form.grade_id}
            options={grades}
            onSelect={(id) => setForm({ ...form, grade_id: id })}
          />
          <Field label="Date of birth">
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) =>
                setForm({ ...form, date_of_birth: e.target.value })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
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
          <Field label="Emergency contact name">
            <input
              value={form.emergency_name}
              onChange={(e) =>
                setForm({ ...form, emergency_name: e.target.value })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Emergency phone">
            <input
              value={form.emergency_phone}
              onChange={(e) =>
                setForm({ ...form, emergency_phone: e.target.value })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Medical notes">
            <textarea
              value={form.medical_notes}
              onChange={(e) =>
                setForm({ ...form, medical_notes: e.target.value })
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
            <MediaField
              label="Photo"
              kind="image"
              value={editing.photo_url ?? ""}
              onChange={(url) =>
                updateAthlete(editing.id, { photo_url: url || null })
              }
              onError={showToast}
            />
            <Field label="First name">
              <input
                defaultValue={editing.first_name}
                onBlur={(e) => {
                  if (e.target.value !== editing.first_name) {
                    updateAthlete(editing.id, { first_name: e.target.value });
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
                    updateAthlete(editing.id, { last_name: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <GradePicker
              selectedId={editing.grade_id}
              options={grades}
              onSelect={(id) => updateAthlete(editing.id, { grade_id: id })}
            />
            <Field label="Date of birth">
              <input
                type="date"
                defaultValue={editing.date_of_birth ?? ""}
                onChange={(e) =>
                  updateAthlete(editing.id, {
                    date_of_birth: e.target.value || null,
                  })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
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
                className="rounded-xl border border-stone-300 px-3 py-2"
              />
            </Field>
            <StylePicker
              ids={editingStyleIds}
              options={styles}
              onAdd={(id) => addStyle(editing.id, id)}
              onRemove={(id) => removeStyle(editing.id, id)}
            />
            <GradingHistorySection athleteId={editing.id} grades={grades} />
            <label className="flex items-center gap-2 text-sm text-stone-600">
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

      {toast && <Toast message={toast} />}
    </div>
  );
}

function AthleteThumb({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="w-[20%] min-w-[64px] shrink-0 object-cover"
      />
    );
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex w-[20%] min-w-[64px] shrink-0 items-center justify-center bg-red-100 font-semibold text-red-700">
      {initials || "?"}
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

function GradePicker({
  selectedId,
  options,
  onSelect,
}: {
  selectedId: number | null;
  options: Grade[];
  onSelect: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">Grade</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search grades..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {results.map((o) => {
          const selected = selectedId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(selected ? null : o.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                selected
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-stone-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <BeltSwatch color={o.belt_color} />
                {o.name}
                {o.club_name ? ` (${o.club_name})` : ""}
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

const EMPTY_GRADING_FORM = {
  grade_id: null as number | null,
  graded_at: "",
  grading_body: "",
  examiner: "",
  passed: true,
  next_grade_due: "",
};

function GradingHistorySection({
  athleteId,
  grades,
}: {
  athleteId: number;
  grades: Grade[];
}) {
  const api = useApi();
  const [gradings, setGradings] = useState<Grading[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_GRADING_FORM);

  useEffect(() => {
    setGradings(null);
    setExpandedId(null);
    setAdding(false);
    setForm(EMPTY_GRADING_FORM);
    api
      .get<{ gradings: Grading[] }>(`/athletes/${athleteId}/gradings`)
      .then((res) => setGradings(res.gradings))
      .catch(() => setGradings([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function record() {
    if (!form.grade_id) return;
    const { grading } = await api.post<{ grading: Grading }>(
      `/athletes/${athleteId}/gradings`,
      {
        grade_id: form.grade_id,
        graded_at: form.graded_at || null,
        grading_body: form.grading_body || null,
        examiner: form.examiner || null,
        passed: form.passed,
        next_grade_due: form.next_grade_due || null,
      }
    );
    setGradings((prev) => (prev ? [grading, ...prev] : [grading]));
    setForm(EMPTY_GRADING_FORM);
    setAdding(false);
  }

  async function remove(id: number) {
    await api.del(`/athletes/${athleteId}/gradings/${id}`);
    setGradings((prev) => (prev ? prev.filter((g) => g.id !== id) : prev));
    setExpandedId((prev) => (prev === id ? null : prev));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Grading history ({gradings?.length ?? 0})
      </span>
      {gradings === null ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-1">
          {gradings.map((g) => {
            const grade = grades.find((gr) => gr.id === g.grade_id);
            const expanded = expandedId === g.id;
            return (
              <div
                key={g.id}
                className="rounded-xl border border-stone-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : g.id)}
                  className="flex min-h-[44px] w-full items-center justify-between px-3 text-left"
                >
                  <span className="flex items-center gap-2">
                    {grade && <BeltSwatch color={grade.belt_color} />}
                    <span className={g.passed ? "" : "text-red-700"}>
                      {grade?.name ?? "Unknown grade"}
                      {!g.passed && " (not passed)"}
                    </span>
                  </span>
                  <span className="text-sm text-stone-500">
                    {g.graded_at.slice(0, 10)}
                  </span>
                </button>
                {expanded && (
                  <div className="flex flex-col gap-2 border-t border-stone-100 p-3 text-sm text-stone-600">
                    {g.grading_body && <p>Grading body: {g.grading_body}</p>}
                    {g.examiner && <p>Examiner: {g.examiner}</p>}
                    {g.next_grade_due && (
                      <p>Next grade due: {g.next_grade_due.slice(0, 10)}</p>
                    )}
                    <DeleteButton
                      onClick={() => remove(g.id)}
                      itemLabel={`this grading (${grade?.name ?? "grade"})`}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {gradings.length === 0 && !adding && (
            <p className="px-1 py-2 text-sm text-stone-500">
              No gradings recorded yet.
            </p>
          )}
          {adding ? (
            <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3">
              <GradePicker
                selectedId={form.grade_id}
                options={grades}
                onSelect={(id) => setForm({ ...form, grade_id: id })}
              />
              <Field label="Date">
                <input
                  type="date"
                  value={form.graded_at}
                  onChange={(e) =>
                    setForm({ ...form, graded_at: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                />
              </Field>
              <Field label="Grading body">
                <input
                  value={form.grading_body}
                  onChange={(e) =>
                    setForm({ ...form, grading_body: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                />
              </Field>
              <Field label="Examiner">
                <input
                  value={form.examiner}
                  onChange={(e) =>
                    setForm({ ...form, examiner: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={form.passed}
                  onChange={(e) =>
                    setForm({ ...form, passed: e.target.checked })
                  }
                />
                Passed
              </label>
              <Field label="Next grade due">
                <input
                  type="date"
                  value={form.next_grade_due}
                  onChange={(e) =>
                    setForm({ ...form, next_grade_due: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                />
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={record}
                  className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white"
                >
                  Record
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="min-h-[44px] rounded-xl border border-dashed border-stone-300 text-sm font-medium text-stone-600"
            >
              + Record grading
            </button>
          )}
        </div>
      )}
    </div>
  );
}
