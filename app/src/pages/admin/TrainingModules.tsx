import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  MediaField,
  Toast,
} from "../../components/ui";
import {
  TrainingModuleView,
  itemSummary,
  type TrainingModule,
  type TrainingModuleItem,
  type TrainingModuleItemType as ItemType,
} from "../../components/TrainingModuleView";
import { todayStr, addDaysStr, dateLabel, groupByDate } from "../../utils/dates";

const MAX_SETS = 50;
const MAX_REPS = 1000;
const MAX_DURATION_SECONDS = 6 * 60 * 60; // 6 hours

interface DraftItem {
  item_type: ItemType;
  name: string;
  explanation: string;
  video_url: string;
  image_url: string;
  mode: "reps" | "time";
  sets: string;
  reps: string;
  duration_seconds: string;
}

const EMPTY_FORM = { title: "", explanation: "" };

const EMPTY_EXERCISE: DraftItem = {
  item_type: "exercise",
  name: "",
  explanation: "",
  video_url: "",
  image_url: "",
  mode: "reps",
  sets: "",
  reps: "",
  duration_seconds: "",
};

const EMPTY_REST: DraftItem = {
  item_type: "rest",
  name: "",
  explanation: "",
  video_url: "",
  image_url: "",
  mode: "time",
  sets: "",
  reps: "",
  duration_seconds: "",
};

function toDraftItem(item: TrainingModuleItem): DraftItem {
  return {
    item_type: item.item_type,
    name: item.name ?? "",
    explanation: item.explanation ?? "",
    video_url: item.video_url ?? "",
    image_url: item.image_url ?? "",
    mode: item.duration_seconds != null && item.sets == null ? "time" : "reps",
    sets: item.sets != null ? String(item.sets) : "",
    reps: item.reps != null ? String(item.reps) : "",
    duration_seconds:
      item.duration_seconds != null ? String(item.duration_seconds) : "",
  };
}

function toApiItem(it: DraftItem) {
  if (it.item_type === "rest") {
    return {
      item_type: "rest",
      duration_seconds: it.duration_seconds ? Number(it.duration_seconds) : null,
    };
  }
  if (it.mode === "time") {
    return {
      item_type: "exercise",
      name: it.name,
      explanation: it.explanation || null,
      video_url: it.video_url || null,
      image_url: it.image_url || null,
      duration_seconds: it.duration_seconds ? Number(it.duration_seconds) : null,
    };
  }
  return {
    item_type: "exercise",
    name: it.name,
    explanation: it.explanation || null,
    video_url: it.video_url || null,
    image_url: it.image_url || null,
    sets: it.sets ? Number(it.sets) : null,
    reps: it.reps ? Number(it.reps) : null,
  };
}

function ModuleItemsEditor({
  items,
  onChange,
  onError,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  onError: (message: string) => void;
}) {
  function updateItem(index: number, patch: Partial<DraftItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Exercises &amp; rest ({items.length})
      </span>

      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3"
          >
            <div className="flex items-center gap-2">
              <select
                value={item.item_type}
                onChange={(e) =>
                  updateItem(i, { item_type: e.target.value as ItemType })
                }
                className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
              >
                <option value="exercise">Exercise</option>
                <option value="rest">Rest</option>
              </select>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label="Remove item"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-red-700"
              >
                ✕
              </button>
            </div>

            {item.item_type === "exercise" ? (
              <>
                <Field label="Name">
                  <input
                    required
                    defaultValue={item.name}
                    onBlur={(e) => updateItem(i, { name: e.target.value })}
                    className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                  />
                </Field>
                <Field label="Explanation">
                  <textarea
                    defaultValue={item.explanation}
                    onBlur={(e) =>
                      updateItem(i, { explanation: e.target.value })
                    }
                    className="rounded-xl border border-stone-300 px-3 py-2"
                  />
                </Field>
                <MediaField
                  label="Video"
                  kind="video"
                  value={item.video_url}
                  onChange={(url) => updateItem(i, { video_url: url })}
                  onError={onError}
                />
                <MediaField
                  label="Image"
                  kind="image"
                  value={item.image_url}
                  onChange={(url) => updateItem(i, { image_url: url })}
                  onError={onError}
                />
                <Field label="Measured by">
                  <select
                    value={item.mode}
                    onChange={(e) =>
                      updateItem(i, { mode: e.target.value as "reps" | "time" })
                    }
                    className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                  >
                    <option value="reps">Sets &amp; reps</option>
                    <option value="time">Time</option>
                  </select>
                </Field>
                {item.mode === "reps" ? (
                  <div className="flex gap-2">
                    <Field label="Sets">
                      <input
                        type="number"
                        min={1}
                        max={MAX_SETS}
                        defaultValue={item.sets}
                        onBlur={(e) => updateItem(i, { sets: e.target.value })}
                        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                      />
                    </Field>
                    <Field label="Reps">
                      <input
                        type="number"
                        min={1}
                        max={MAX_REPS}
                        defaultValue={item.reps}
                        onBlur={(e) => updateItem(i, { reps: e.target.value })}
                        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                      />
                    </Field>
                  </div>
                ) : (
                  <Field label="Duration (seconds)">
                    <input
                      type="number"
                      min={1}
                      max={MAX_DURATION_SECONDS}
                      defaultValue={item.duration_seconds}
                      onBlur={(e) =>
                        updateItem(i, { duration_seconds: e.target.value })
                      }
                      className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                    />
                  </Field>
                )}
              </>
            ) : (
              <Field label="Duration (seconds)">
                <input
                  type="number"
                  min={1}
                  max={MAX_DURATION_SECONDS}
                  defaultValue={item.duration_seconds}
                  onBlur={(e) =>
                    updateItem(i, { duration_seconds: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                />
              </Field>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange([...items, { ...EMPTY_EXERCISE }])}
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
        >
          + Add exercise
        </button>
        <button
          type="button"
          onClick={() => onChange([...items, { ...EMPTY_REST }])}
          className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
        >
          + Add rest
        </button>
      </div>
    </div>
  );
}

export default function TrainingModules() {
  const { user } = useAuth();
  if (user?.role === "athlete") {
    return <AthleteTrainingLog />;
  }
  return <TrainingModulesManager />;
}

function TrainingModulesManager() {
  const api = useApi();
  const { user } = useAuth();
  const canEdit = !!user?.is_admin || user?.role === "coach";
  const [modules, setModules] = useState<TrainingModule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | TrainingModule>(
    "closed"
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [formItems, setFormItems] = useState<DraftItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  function showError(err: unknown) {
    showToast(err instanceof ApiError ? err.message : "Something went wrong");
  }

  function load() {
    api
      .get<{ modules: TrainingModule[] }>("/training-modules")
      .then((res) => setModules(res.modules))
      .catch(() => setError("Failed to load training modules"));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormItems([]);
    setDrawer("create");
  }

  async function createModule(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      const { module: created } = await api.post<{ module: TrainingModule }>(
        "/training-modules",
        {
          title: form.title,
          explanation: form.explanation,
          items: formItems.map(toApiItem),
        }
      );
      setModules((prev) => (prev ? [...prev, created] : [created]));
      setDrawer("closed");
    } catch (err) {
      showError(err);
    }
  }

  async function updateModule(id: number, patch: Record<string, unknown>) {
    try {
      const { module: updated } = await api.patch<{ module: TrainingModule }>(
        `/training-modules/${id}`,
        patch
      );
      setModules((prev) =>
        prev ? prev.map((m) => (m.id === id ? updated : m)) : prev
      );
      setDrawer((prev) =>
        prev !== "closed" && prev !== "create" && prev.id === id
          ? updated
          : prev
      );
    } catch (err) {
      showError(err);
    }
  }

  async function deleteModule(id: number) {
    try {
      await api.del(`/training-modules/${id}`);
      setModules((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
      setDrawer("closed");
    } catch (err) {
      showError(err);
    }
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!modules)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;
  const filtered = modules.filter((m) =>
    m.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Training modules</h1>
        {canEdit && <AddButton onClick={openCreate} />}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search training modules..."
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-2">
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => setDrawer(m)}
            className="flex min-h-[44px] flex-col items-start gap-1 rounded-2xl bg-white px-4 py-3 text-left shadow-card"
          >
            <span className="font-medium">{m.title}</span>
            {m.items.length > 0 && (
              <span className="text-xs text-stone-500">
                {m.items.map(itemSummary).join(", ")}
              </span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">
            No training modules yet.
          </p>
        )}
      </div>

      {canEdit && (
        <Drawer
          open={drawer === "create"}
          onClose={() => setDrawer("closed")}
          title="New training module"
        >
          <form onSubmit={createModule} className="flex flex-col gap-4">
            <Field label="Title">
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Explanation">
              <textarea
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                className="rounded-xl border border-stone-300 px-3 py-2"
              />
            </Field>
            <ModuleItemsEditor
              items={formItems}
              onChange={setFormItems}
              onError={showToast}
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
            >
              Create
            </button>
          </form>
        </Drawer>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setDrawer("closed")}
        title={editing?.title ?? ""}
      >
        {editing && canEdit && (
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <input
                defaultValue={editing.title}
                onBlur={(e) => {
                  if (e.target.value !== editing.title) {
                    updateModule(editing.id, { title: e.target.value });
                  }
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Explanation">
              <textarea
                defaultValue={editing.explanation ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (editing.explanation ?? "")) {
                    updateModule(editing.id, { explanation: e.target.value });
                  }
                }}
                className="rounded-xl border border-stone-300 px-3 py-2"
              />
            </Field>
            <ModuleItemsEditor
              items={editing.items.map(toDraftItem)}
              onChange={(next) =>
                updateModule(editing.id, { items: next.map(toApiItem) })
              }
              onError={showToast}
            />
            <DeleteButton
              onClick={() => deleteModule(editing.id)}
              itemLabel={editing.title}
            />
          </div>
        )}
        {editing && !canEdit && (
          <div className="flex flex-col gap-4">
            <TrainingModuleView module={editing} />
          </div>
        )}
      </Drawer>

      {toast && <Toast message={toast} />}
    </div>
  );
}

interface TrainingLogEntry {
  source: "item" | "event";
  id: number;
  event_id: number;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  module_title: string | null;
  status: "pending" | "completed" | "failed";
  notes: string | null;
}

const STATUS_LABELS: Record<TrainingLogEntry["status"], string> = {
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
};

const STATUS_CLASSES: Record<TrainingLogEntry["status"], string> = {
  pending: "bg-stone-100 text-stone-600",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function timeSpentLabel(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// The athlete's own view of this tab (see `TrainingModules` above): a
// today-centered log of their training schedule rather than the shared
// module library coaches/admins manage. Loads a 2-week window (a week
// back, a week forward - tighter than Schedule.tsx's 4-week window, since
// this is a single-purpose personal log rather than the whole calendar)
// and lazy-loads another week in whichever direction the user scrolls
// toward, via the same real-`scroll`-listener approach Schedule.tsx uses
// (see that file's comment for why not IntersectionObserver). A floating
// "+" opens a minimal quick-add form (title/date/times/notes) that POSTs
// a plain `training`-type event - self-only per `resolveAthleteIds`, so
// no athlete picker is needed - and prepends the result locally.
const TRAINING_LOG_WINDOW_DAYS = 7;
const TRAINING_LOG_MAX_WINDOW_DAYS = 365;

function mergeTrainingLogEntries(
  prev: TrainingLogEntry[] | null,
  incoming: TrainingLogEntry[]
) {
  const map = new Map((prev ?? []).map((e) => [`${e.source}-${e.id}`, e]));
  for (const e of incoming) map.set(`${e.source}-${e.id}`, e);
  return [...map.values()];
}

function AthleteTrainingLog() {
  const api = useApi();
  const [entries, setEntries] = useState<TrainingLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const loadedFromRef = useRef(addDaysStr(todayStr(), -TRAINING_LOG_WINDOW_DAYS));
  const loadedToRef = useRef(addDaysStr(todayStr(), TRAINING_LOG_WINDOW_DAYS));
  const loadingPastRef = useRef(false);
  const loadingFutureRef = useRef(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasAutoScrolledRef = useRef(false);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    api
      .get<{ entries: TrainingLogEntry[] }>(
        `/events/training-log?from=${loadedFromRef.current}&to=${loadedToRef.current}`
      )
      .then((res) => setEntries(res.entries))
      .catch(() => setError("Failed to load training history"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (entries && !hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      requestAnimationFrame(() => {
        const today = todayStr();
        const groups = groupByDate(entries, (e) => e.date.slice(0, 10));
        const target =
          groups.find((g) => g.date >= today) ?? groups[groups.length - 1];
        if (target) {
          sectionRefs.current[target.date]?.scrollIntoView({
            behavior: "auto",
            block: "start",
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  useEffect(() => {
    const container = document.querySelector("main");
    if (!container) return;

    function onScroll() {
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop < 150) loadMorePast();
      if (scrollHeight - scrollTop - clientHeight < 150) loadMoreFuture();
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMorePast() {
    const oldestAllowed = addDaysStr(todayStr(), -TRAINING_LOG_MAX_WINDOW_DAYS);
    if (loadingPastRef.current || loadedFromRef.current <= oldestAllowed) return;
    loadingPastRef.current = true;
    setLoadingPast(true);
    const to = addDaysStr(loadedFromRef.current, -1);
    let from = addDaysStr(loadedFromRef.current, -TRAINING_LOG_WINDOW_DAYS);
    if (from < oldestAllowed) from = oldestAllowed;
    try {
      const res = await api.get<{ entries: TrainingLogEntry[] }>(
        `/events/training-log?from=${from}&to=${to}`
      );
      setEntries((prev) => mergeTrainingLogEntries(prev, res.entries));
      loadedFromRef.current = from;
    } catch {
      // leave the window as-is; the next scroll near the edge retries
    } finally {
      loadingPastRef.current = false;
      setLoadingPast(false);
    }
  }

  async function loadMoreFuture() {
    const newestAllowed = addDaysStr(todayStr(), TRAINING_LOG_MAX_WINDOW_DAYS);
    if (loadingFutureRef.current || loadedToRef.current >= newestAllowed) return;
    loadingFutureRef.current = true;
    setLoadingFuture(true);
    const from = addDaysStr(loadedToRef.current, 1);
    let to = addDaysStr(loadedToRef.current, TRAINING_LOG_WINDOW_DAYS);
    if (to > newestAllowed) to = newestAllowed;
    try {
      const res = await api.get<{ entries: TrainingLogEntry[] }>(
        `/events/training-log?from=${from}&to=${to}`
      );
      setEntries((prev) => mergeTrainingLogEntries(prev, res.entries));
      loadedToRef.current = to;
    } catch {
      // leave the window as-is; the next scroll near the edge retries
    } finally {
      loadingFutureRef.current = false;
      setLoadingFuture(false);
    }
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!entries)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const q = query.trim().toLowerCase();
  const filtered = entries.filter((entry) =>
    `${entry.module_title ?? entry.title}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Training</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by exercise group"
        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
      />

      <div className="flex flex-col gap-4">
        {loadingPast && (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
        {groupByDate(filtered, (e) => e.date.slice(0, 10)).map(
          ({ date, items }) => (
            <div
              key={date}
              ref={(el) => {
                sectionRefs.current[date] = el;
              }}
              className="flex flex-col gap-2"
            >
              <h2 className="text-sm font-semibold text-stone-500">
                {dateLabel(date)}
              </h2>
              {items.map((entry) => (
                <div
                  key={`${entry.source}-${entry.id}`}
                  className="flex flex-col gap-1 rounded-2xl bg-white px-4 py-3 shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {entry.module_title ?? entry.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[entry.status]}`}
                    >
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </div>
                  <span className="text-xs text-stone-500">
                    {timeSpentLabel(entry.start_time, entry.end_time)}
                  </span>
                  {entry.notes && (
                    <p className="text-sm text-stone-700">{entry.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )
        )}
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-sm text-stone-500">
            No scheduled training sessions yet.
          </p>
        )}
        {loadingFuture && (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label="Add training"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-3xl leading-none text-white shadow-lg"
      >
        +
      </button>
      <Drawer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New training"
      >
        <TrainingLogComposer
          onCreated={(entry) => {
            setEntries((prev) => (prev ? [entry, ...prev] : [entry]));
            setComposerOpen(false);
          }}
          showToast={showToast}
        />
      </Drawer>
      {toast && <Toast message={toast} />}
    </div>
  );
}

function TrainingLogComposer({
  onCreated,
  showToast,
}: {
  onCreated: (entry: TrainingLogEntry) => void;
  showToast: (message: string) => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState("Training");
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || submitting) return;
    setSubmitting(true);
    try {
      const { event } = await api.post<{
        event: {
          id: number;
          title: string;
          start_date: string;
          start_time: string | null;
          end_time: string | null;
        };
      }>("/events", {
        title: title.trim(),
        event_type: "training",
        start_date: date,
        end_date: date,
        start_time: startTime || undefined,
        end_time: endTime || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated({
        source: "event",
        id: event.id,
        event_id: event.id,
        title: event.title,
        date: event.start_date,
        start_time: event.start_time,
        end_time: event.end_time,
        module_title: null,
        status: "pending",
        notes: notes.trim() || null,
      });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to add training");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        <Field label="Start time">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
      </div>
      <Field label="End time">
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
      </Field>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-[80px] rounded-xl border border-stone-300 px-3 py-2"
        />
      </Field>
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
