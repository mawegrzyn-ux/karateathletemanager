import { useEffect, useState } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Spinner, Drawer, AddButton, DeleteButton, Field, Badge, Toast } from "../../components/ui";

// Matches Schedule.tsx's own WEEKDAY_LABELS ordering (Sun-first) and the
// nk_events.weekday / EXTRACT(DOW) convention the backend already uses -
// index 0 is Sunday.
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TrainingModuleType {
  id: number;
  name: string;
  icon: string | null;
  bg_color: string;
}

interface TrainingModuleOption {
  id: number;
  title: string;
  icon: string | null;
}

interface ProgramSession {
  id: number;
  weekday: number;
  position: number;
  training_module_id: number | null;
  module_title: string | null;
  module_icon: string | null;
}

interface TrainingProgram {
  id: number;
  title: string;
  explanation: string | null;
  type_id: number | null;
  type_name: string | null;
  icon: string | null;
  duration_weeks: number;
  archived: boolean;
  sessions: ProgramSession[];
}

interface EnrollmentEvent {
  id: number;
  title: string;
  start_date: string;
  sequence_index: number;
}

interface Enrollment {
  id: number;
  training_program_id: number | null;
  athlete_id: number;
  start_date: string;
  program_title: string | null;
  events: EnrollmentEvent[];
}

const EMPTY_FORM = {
  title: "",
  explanation: "",
  type_id: null as number | null,
  icon: "",
  duration_weeks: "8",
};

function sessionsByWeekday(sessions: ProgramSession[]) {
  const map = new Map<number, ProgramSession[]>();
  for (const s of sessions) {
    if (!map.has(s.weekday)) map.set(s.weekday, []);
    map.get(s.weekday)!.push(s);
  }
  return map;
}

// A weekday's assigned sessions plus an inline, accordion-style search
// picker to add more - same "expand in place" shape as any other nested
// line-item editor in a drawer (see Schedule.tsx's ItemsSection), and the
// same search-box + "+ Add"/"✓ Added" idiom as Clubs.tsx's MemberEditor,
// just scoped to one weekday instead of one club.
function WeekdaySessionEditor({
  weekday,
  sessions,
  moduleOptions,
  expanded,
  onToggleExpanded,
  onAdd,
  onRemove,
}: {
  weekday: number;
  sessions: ProgramSession[];
  moduleOptions: TrainingModuleOption[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onAdd: (moduleId: number) => void;
  onRemove: (sessionId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = moduleOptions.filter((m) => m.title.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-stone-700">
          {WEEKDAY_LABELS[weekday]}
        </span>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-sm font-medium text-red-700"
        >
          {expanded ? "Done" : "+ Add"}
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="flex flex-col gap-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex min-h-[44px] items-center justify-between rounded-xl border border-stone-200 bg-white px-3"
            >
              <span>
                {s.module_icon ? `${s.module_icon} ` : ""}
                {s.module_title ?? "(deleted session)"}
              </span>
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.module_title ?? "session"} from ${WEEKDAY_LABELS[weekday]}`}
                className="flex h-8 w-8 items-center justify-center text-red-700"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      {sessions.length === 0 && !expanded && (
        <p className="text-xs text-stone-500">No sessions</p>
      )}

      {expanded && (
        <div className="flex flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search training sessions..."
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onAdd(m.id)}
                className="flex min-h-[44px] items-center justify-between rounded-xl border border-stone-200 px-3 text-left"
              >
                <span>
                  {m.icon ? `${m.icon} ` : ""}
                  {m.title}
                </span>
                <span className="text-sm text-stone-500">+ Add</span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Shared by the create drawer and the edit drawer - a plain full-form
// (per CLAUDE.md's list+drawer convention) rather than a paginated
// wizard, since a session slot has just one real choice (which existing
// training session) and no deep per-item sub-form the way a training
// session's own exercises do.
function ProgramForm({
  types,
  moduleOptions,
  title,
  explanation,
  typeId,
  icon,
  durationWeeks,
  sessions,
  onField,
  onAddSession,
  onRemoveSession,
}: {
  types: TrainingModuleType[];
  moduleOptions: TrainingModuleOption[];
  title: string;
  explanation: string;
  typeId: number | null;
  icon: string;
  durationWeeks: string;
  sessions: ProgramSession[];
  onField: (patch: Record<string, unknown>) => void;
  onAddSession: (weekday: number, moduleId: number) => void;
  onRemoveSession: (sessionId: number) => void;
}) {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const grouped = sessionsByWeekday(sessions);

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => onField({ title: e.target.value })}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Explanation">
        <textarea
          value={explanation}
          onChange={(e) => onField({ explanation: e.target.value })}
          className="rounded-xl border border-stone-300 px-3 py-2"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select
            value={typeId ?? ""}
            onChange={(e) =>
              onField({ type_id: e.target.value ? Number(e.target.value) : null })
            }
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          >
            <option value="">No type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon ? `${t.icon} ` : ""}
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icon">
          <input
            value={icon}
            onChange={(e) => onField({ icon: e.target.value })}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
      </div>
      <Field label="Duration (weeks)">
        <input
          type="number"
          min={1}
          max={52}
          value={durationWeeks}
          onChange={(e) => onField({ duration_weeks: e.target.value })}
          className="min-h-[44px] w-24 rounded-xl border border-stone-300 px-3"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-stone-600">Weekly pattern</span>
        {WEEKDAY_LABELS.map((_, weekday) => (
          <WeekdaySessionEditor
            key={weekday}
            weekday={weekday}
            sessions={grouped.get(weekday) ?? []}
            moduleOptions={moduleOptions}
            expanded={expandedDay === weekday}
            onToggleExpanded={() =>
              setExpandedDay((d) => (d === weekday ? null : weekday))
            }
            onAdd={(moduleId) => onAddSession(weekday, moduleId)}
            onRemove={onRemoveSession}
          />
        ))}
      </div>
    </div>
  );
}

interface AthleteOption {
  id: number;
  first_name: string;
  last_name: string;
}

// `athleteOptions` present (even as an empty array while still loading)
// means the viewer can enroll OTHER athletes (coach/admin) - a search
// picker (the standard MemberEditor shape) replaces the plain self-only
// button. Undefined means "self only" (a plain athlete adding it to
// their own calendar), matching the resolveAthleteIds branching the
// backend itself uses: an explicit athlete_ids list is honored for a
// coach/admin, but a plain athlete is always forced onto themselves
// regardless of what's sent.
function EnrollAction({
  programId,
  onEnrolled,
  athleteOptions,
}: {
  programId: number;
  onEnrolled: () => void;
  athleteOptions?: AthleteOption[];
}) {
  const api = useApi();
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const forOthers = athleteOptions !== undefined;

  async function enroll() {
    if (!startDate) {
      setError("Pick a start date");
      return;
    }
    if (forOthers && selectedIds.length === 0) {
      setError("Pick at least one athlete");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/training-programs/${programId}/enroll`, {
        start_date: startDate,
        ...(forOthers ? { athlete_ids: selectedIds } : {}),
      });
      onEnrolled();
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const q = query.trim().toLowerCase();
  const results = (athleteOptions ?? []).filter((a) =>
    `${a.first_name} ${a.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
      <span className="text-sm font-medium text-stone-700">
        {forOthers ? "Enroll athletes" : "Add to my calendar"}
      </span>

      {forOthers && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search athletes..."
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {results.map((a) => {
              const added = selectedIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    setSelectedIds((prev) =>
                      added ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                    )
                  }
                  className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
                    added
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <span>
                    {a.first_name} {a.last_name}
                  </span>
                  <span className="text-sm">{added ? "✓ Added" : "+ Add"}</span>
                </button>
              );
            })}
            {results.length === 0 && (
              <p className="px-1 py-2 text-sm text-stone-500">No matches.</p>
            )}
          </div>
        </>
      )}

      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />
      <button
        type="button"
        onClick={enroll}
        disabled={submitting}
        className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
      >
        {submitting
          ? "Adding..."
          : !forOthers
            ? "Add to my calendar"
            : selectedIds.length === 0
              ? "Enroll athletes"
              : `Enroll ${selectedIds.length} athlete${selectedIds.length === 1 ? "" : "s"}`}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function EnrollmentDrawer({
  enrollment,
  onDeleted,
  onShifted,
}: {
  enrollment: Enrollment;
  onDeleted: () => void;
  onShifted: () => void;
}) {
  const api = useApi();
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [newDate, setNewDate] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function shift() {
    if (!anchorId || !newDate) {
      showToast("Pick a session and a new date");
      return;
    }
    try {
      await api.patch(`/training-programs/enrollments/${enrollment.id}/shift`, {
        from_event_id: anchorId,
        new_start_date: newDate,
      });
      setAnchorId(null);
      setNewDate("");
      onShifted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function remove() {
    try {
      await api.del(`/training-programs/enrollments/${enrollment.id}`);
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-600">
        Started {enrollment.start_date}
      </p>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-stone-600">Sessions</span>
        {enrollment.events.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setAnchorId(anchorId === e.id ? null : e.id)}
            className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-left ${
              anchorId === e.id
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-stone-200 bg-white"
            }`}
          >
            <span>{e.title}</span>
            <span className="text-sm">{e.start_date}</span>
          </button>
        ))}
      </div>

      {anchorId && (
        <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
          <span className="text-sm font-medium text-stone-700">
            Shift this session (and every session after it) to:
          </span>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
          <button
            type="button"
            onClick={shift}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
          >
            Shift from here
          </button>
        </div>
      )}

      <DeleteButton
        onClick={remove}
        itemLabel={enrollment.program_title ?? "this programme"}
        label="Remove from my calendar"
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}

export default function TrainingProgrammesTab() {
  const api = useApi();
  const { user } = useAuth();
  const canEdit = !!user?.is_admin || user?.role === "coach";
  const canEnroll = user?.role === "athlete" && !!user?.athlete_id;

  const [programs, setPrograms] = useState<TrainingProgram[] | null>(null);
  const [types, setTypes] = useState<TrainingModuleType[]>([]);
  const [moduleOptions, setModuleOptions] = useState<TrainingModuleOption[]>([]);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | TrainingProgram>("closed");
  const [openEnrollment, setOpenEnrollment] = useState<Enrollment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [draftSessions, setDraftSessions] = useState<ProgramSession[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function loadPrograms() {
    api
      .get<{ programs: TrainingProgram[] }>("/training-programs")
      .then((res) => setPrograms(res.programs))
      .catch(() => showToast("Failed to load training programmes"));
  }

  function loadEnrollments() {
    if (!user?.athlete_id) return;
    api
      .get<{ enrollments: Enrollment[] }>(`/training-programs/enrollments/${user.athlete_id}`)
      .then((res) => setEnrollments(res.enrollments))
      .catch(() => {});
  }

  useEffect(() => {
    loadPrograms();
    loadEnrollments();
    api
      .get<{ types: TrainingModuleType[] }>("/training-module-types")
      .then((res) => setTypes(res.types))
      .catch(() => {});
    api
      .get<{ modules: TrainingModuleOption[] }>("/training-modules")
      .then((res) => setModuleOptions(res.modules))
      .catch(() => {});
    // Only coach/admin can enroll OTHER athletes (GET /athletes itself is
    // gated the same way server-side) - a plain athlete only ever needs
    // themselves, resolved automatically server-side with no picker.
    if (user?.is_admin || user?.role === "coach") {
      api
        .get<{ athletes: AthleteOption[] }>("/athletes")
        .then((res) => setAthletes(res.athletes))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.athlete_id]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDraftSessions([]);
    setDrawer("create");
  }

  function openEdit(p: TrainingProgram) {
    setForm({
      title: p.title,
      explanation: p.explanation ?? "",
      type_id: p.type_id,
      icon: p.icon ?? "",
      duration_weeks: String(p.duration_weeks),
    });
    setDraftSessions(p.sessions);
    setDrawer(p);
  }

  function addDraftSession(weekday: number, moduleId: number) {
    const mod = moduleOptions.find((m) => m.id === moduleId);
    setDraftSessions((prev) => [
      ...prev,
      {
        id: -(prev.length + 1),
        weekday,
        position: prev.filter((s) => s.weekday === weekday).length,
        training_module_id: moduleId,
        module_title: mod?.title ?? null,
        module_icon: mod?.icon ?? null,
      },
    ]);
  }

  function removeDraftSession(sessionId: number) {
    setDraftSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  function sessionsPayload() {
    return draftSessions.map((s) => ({
      weekday: s.weekday,
      training_module_id: s.training_module_id,
    }));
  }

  async function createProgram() {
    if (!form.title.trim()) {
      showToast("Title is required");
      return;
    }
    try {
      const { program } = await api.post<{ program: TrainingProgram }>(
        "/training-programs",
        {
          title: form.title,
          explanation: form.explanation,
          type_id: form.type_id,
          icon: form.icon,
          duration_weeks: Number(form.duration_weeks),
          sessions: sessionsPayload(),
        }
      );
      setPrograms((prev) => (prev ? [...prev, program] : [program]));
      setDrawer("closed");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function saveEdit(id: number) {
    try {
      const { program } = await api.patch<{ program: TrainingProgram }>(
        `/training-programs/${id}`,
        {
          title: form.title,
          explanation: form.explanation,
          type_id: form.type_id,
          icon: form.icon,
          duration_weeks: Number(form.duration_weeks),
          sessions: sessionsPayload(),
        }
      );
      setPrograms((prev) => (prev ? prev.map((p) => (p.id === id ? program : p)) : prev));
      setDraftSessions(program.sessions);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function deleteProgram(id: number) {
    try {
      await api.del(`/training-programs/${id}`);
      setPrograms((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
      setDrawer("closed");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  if (!programs) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = programs.filter((p) =>
    p.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">
      {canEnroll && enrollments.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
            My programmes
          </span>
          {enrollments.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setOpenEnrollment(e)}
              className="flex min-h-[44px] flex-col items-start gap-1 rounded-2xl bg-white p-4 text-left shadow-card"
            >
              <span className="font-medium">{e.program_title ?? "Training programme"}</span>
              <span className="text-xs text-stone-500">Started {e.start_date}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Programmes
        </span>
        {canEdit && <AddButton onClick={openCreate} />}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search training programmes..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-3">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => openEdit(p)}
            className="flex min-h-[44px] flex-col items-start gap-1 rounded-2xl bg-white p-4 text-left shadow-card"
          >
            <span className="font-medium">
              {p.icon ? `${p.icon} ` : ""}
              {p.title}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {p.type_name && <Badge>{p.type_name}</Badge>}
              <Badge>{p.duration_weeks} weeks</Badge>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">No training programmes yet.</p>
        )}
      </div>

      {canEdit && (
        <Drawer
          open={drawer === "create"}
          onClose={() => setDrawer("closed")}
          title="New training programme"
        >
          {drawer === "create" && (
            <div className="flex flex-col gap-4">
              <ProgramForm
                types={types}
                moduleOptions={moduleOptions}
                title={form.title}
                explanation={form.explanation}
                typeId={form.type_id}
                icon={form.icon}
                durationWeeks={form.duration_weeks}
                sessions={draftSessions}
                onField={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                onAddSession={addDraftSession}
                onRemoveSession={removeDraftSession}
              />
              <button
                type="button"
                onClick={createProgram}
                className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
              >
                Create
              </button>
            </div>
          )}
        </Drawer>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.title ?? ""}
      >
        {editing && canEdit && (
          <div className="flex flex-col gap-4">
            <ProgramForm
              types={types}
              moduleOptions={moduleOptions}
              title={form.title}
              explanation={form.explanation}
              typeId={form.type_id}
              icon={form.icon}
              durationWeeks={form.duration_weeks}
              sessions={draftSessions}
              onField={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              onAddSession={addDraftSession}
              onRemoveSession={removeDraftSession}
            />
            <button
              type="button"
              onClick={() => saveEdit(editing.id)}
              className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
            >
              Save changes
            </button>
            <EnrollAction
              programId={editing.id}
              athleteOptions={athletes}
              onEnrolled={() => {
                showToast("Enrolled");
                loadEnrollments();
              }}
            />
            <DeleteButton onClick={() => deleteProgram(editing.id)} itemLabel={editing.title} />
          </div>
        )}
        {editing && !canEdit && (
          <div className="flex flex-col gap-4">
            {editing.explanation && (
              <p className="text-sm text-stone-600">{editing.explanation}</p>
            )}
            <div className="flex flex-col gap-2">
              {WEEKDAY_LABELS.map((label, weekday) => {
                const daySessions = editing.sessions.filter((s) => s.weekday === weekday);
                if (daySessions.length === 0) return null;
                return (
                  <div key={weekday} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-stone-500">{label}</span>
                    {daySessions.map((s) => (
                      <p key={s.id} className="text-sm">
                        {s.module_icon ? `${s.module_icon} ` : ""}
                        {s.module_title ?? "(deleted session)"}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
            {canEnroll && (
              <EnrollAction
                programId={editing.id}
                onEnrolled={() => {
                  showToast("Added to your calendar");
                  loadEnrollments();
                  setDrawer("closed");
                }}
              />
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={openEnrollment !== null}
        onClose={() => setOpenEnrollment(null)}
        title={openEnrollment?.program_title ?? "Programme"}
      >
        {openEnrollment && (
          <EnrollmentDrawer
            enrollment={openEnrollment}
            onDeleted={() => {
              showToast("Removed from your calendar");
              setOpenEnrollment(null);
              loadEnrollments();
            }}
            onShifted={() => {
              showToast("Shifted");
              loadEnrollments();
              api
                .get<{ enrollments: Enrollment[] }>(
                  `/training-programs/enrollments/${user?.athlete_id}`
                )
                .then((res) => {
                  const fresh = res.enrollments.find((e) => e.id === openEnrollment.id);
                  if (fresh) setOpenEnrollment(fresh);
                });
            }}
          />
        )}
      </Drawer>

      {toast && <Toast message={toast} />}
    </div>
  );
}
