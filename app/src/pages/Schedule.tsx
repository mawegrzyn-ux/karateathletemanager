import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  Badge,
} from "../components/ui";
import { TrainingModuleView, type TrainingModule } from "../components/TrainingModuleView";

type CompletionStatus = "pending" | "completed" | "failed";

interface Event {
  id: number;
  title: string;
  event_type: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  training_module_id: number | null;
  athlete_status: AthleteStatus[];
  my_status: CompletionStatus | null;
}

interface AthleteStatus {
  athlete_id: number;
  status: CompletionStatus;
  notes: string | null;
  can_edit: boolean;
}

interface EventItem {
  id: number;
  event_id: number;
  item_type: string;
  title: string;
  item_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  training_module_id: number | null;
  kata_id: number | null;
  athlete_status: AthleteStatus[];
}

interface Person {
  id: number;
  first_name: string;
  last_name: string;
}

interface Kata {
  id: number;
  name: string;
  style: string | null;
  wkf_number: number | null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_TYPES = [
  "competition",
  "squad_session",
  "training",
  "travel",
  "time_off",
  "seminar",
  "training_camp",
];
const ITEM_TYPES = [...EVENT_TYPES, "rest", "other", "kata_performance"];

const TYPE_LABELS: Record<string, string> = {
  competition: "Competition",
  squad_session: "Squad session",
  training: "Training",
  travel: "Travel",
  time_off: "Time off",
  seminar: "Seminar",
  training_camp: "Training camp",
  rest: "Rest",
  other: "Other",
  kata_performance: "Kata performance",
};

const TYPE_ICONS: Record<string, string> = {
  competition: "🏆",
  squad_session: "👥",
  training: "💪",
  travel: "✈️",
  time_off: "🌴",
  seminar: "🎓",
  training_camp: "⛺",
  rest: "😴",
  other: "📌",
  kata_performance: "🥋",
};

const EMPTY_FORM = {
  title: "",
  event_type: "training",
  start_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  location: "",
  notes: "",
  training_module_id: null as number | null,
};

const EMPTY_ITEM_FORM = {
  item_type: "training",
  title: "",
  item_date: "",
  start_time: "",
  end_time: "",
  notes: "",
  training_module_id: null as number | null,
  kata_id: null as number | null,
  repeat_freq: "none",
  repeat_until: "",
  repeat_weekdays: [] as number[],
};

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : "";
}

function toTimeInput(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function groupEventsByDate(events: Event[]) {
  const map = new Map<string, Event[]>();
  for (const e of events) {
    const date = toDateInput(e.start_date);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(e);
  }
  return [...map.entries()]
    .map(([date, events]) => ({ date, events }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateLabel(dateStr: string) {
  const today = todayStr();
  if (dateStr === today) return "Today";
  if (dateStr === addDaysStr(today, 1)) return "Tomorrow";
  if (dateStr === addDaysStr(today, -1)) return "Yesterday";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function startOfWeek(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function startOfMonth(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

function daysInMonthOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

function monthLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekRangeLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${addDaysStr(weekStart, 6)}T00:00:00Z`);
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    });
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}

function shortDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function eventOverlapsDate(event: Event, dateStr: string) {
  return (
    toDateInput(event.start_date) <= dateStr && dateStr <= toDateInput(event.end_date)
  );
}

function timeToMinutes(t: string | null) {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, mins));
  const h = Math.floor(clamped / 60);
  const m = Math.round(clamped % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const HOUR_HEIGHT = 56;
const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 10;
const GRID_HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
);

function formatHour(hour: number) {
  const h = hour % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

export default function Schedule() {
  const { user } = useAuth();

  if (user?.is_admin || user?.role === "coach" || user?.role === "athlete") {
    return (
      <ScheduleManager canPickAthletes={!!user.is_admin || user.role === "coach"} />
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
      <p className="text-stone-600">
        Ask your coach about upcoming training and events.
      </p>
    </div>
  );
}

function ScheduleManager({ canPickAthletes }: { canPickAthletes: boolean }) {
  const api = useApi();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [athletes, setAthletes] = useState<Person[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [katas, setKatas] = useState<Kata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"closed" | "create" | Event>("closed");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formAthleteIds, setFormAthleteIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "day" | "week" | "month">(
    "list"
  );
  const [focusedDate, setFocusedDate] = useState(todayStr());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasAutoScrolledRef = useRef(false);

  function scrollToToday(behavior: ScrollBehavior = "smooth") {
    const today = todayStr();
    const groups = groupEventsByDate(events ?? []);
    const target =
      groups.find((g) => g.date >= today) ?? groups[groups.length - 1];
    if (target) {
      sectionRefs.current[target.date]?.scrollIntoView({
        behavior,
        block: "start",
      });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (events && !hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;
      requestAnimationFrame(() => scrollToToday("auto"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  function load() {
    api
      .get<{ events: Event[] }>("/events")
      .then((res) => setEvents(res.events))
      .catch(() => setError("Failed to load schedule"));

    if (canPickAthletes) {
      api
        .get<{ athletes: Person[] }>("/athletes")
        .then((res) => setAthletes(res.athletes))
        .catch(() => setAthletes([]));
    }

    api
      .get<{ modules: TrainingModule[] }>("/training-modules")
      .then((res) => setModules(res.modules))
      .catch(() => setModules([]));

    api
      .get<{ katas: Kata[] }>("/katas")
      .then((res) => setKatas(res.katas))
      .catch(() => setKatas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormAthleteIds([]);
    setDrawer("create");
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.start_date || !form.end_date) return;
    const { event } = await api.post<{ event: Event }>("/events", {
      ...form,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      training_module_id:
        form.event_type === "training" ? form.training_module_id : null,
      athlete_ids: canPickAthletes ? formAthleteIds : undefined,
    });
    setEvents((prev) => (prev ? [...prev, event] : [event]));
    setDrawer("closed");
  }

  async function deleteEvent(id: number) {
    await api.del(`/events/${id}`);
    setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    setDrawer("closed");
  }

  function updateEventInList(updated: Event) {
    // Merge (not replace): the event-detail endpoints don't recompute the
    // list-only `my_status` rollup, so keep whatever the list already has.
    setEvents((prev) =>
      prev ? prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)) : prev
    );
  }

  async function swipeEventStatus(event: Event, status: CompletionStatus) {
    await api.patch(`/events/${event.id}/status`, { status });
    setEvents((prev) =>
      prev ? prev.map((e) => (e.id === event.id ? { ...e, my_status: status } : e)) : prev
    );
  }

  async function updateEventTime(
    event: Event,
    start_time: string,
    end_time: string
  ) {
    const { event: updated } = await api.patch<{ event: Event }>(
      `/events/${event.id}`,
      { start_time, end_time }
    );
    updateEventInList(updated);
  }

  if (error) return <div className="p-4 text-red-700">{error}</div>;
  if (!events)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const q = query.trim().toLowerCase();
  const filteredEvents = events.filter((e) =>
    `${e.title} ${TYPE_LABELS[e.event_type] ?? e.event_type}`
      .toLowerCase()
      .includes(q)
  );

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-3 bg-stone-100 px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <AddButton onClick={openCreate} />
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search schedule..."
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />

        <div className="flex gap-1 rounded-full bg-stone-200 p-1">
          {(["list", "day", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`min-h-[40px] flex-1 rounded-full px-2 text-sm font-medium capitalize transition-colors ${
                viewMode === mode
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-stone-600"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "list" && (
        <div className="flex flex-col gap-4">
          {groupEventsByDate(filteredEvents).map(({ date, events: dayEvents }) => (
            <div
              key={date}
              ref={(el) => {
                sectionRefs.current[date] = el;
              }}
              className="flex scroll-mt-[190px] flex-col gap-2"
            >
              <h2 className="text-sm font-semibold text-stone-500">
                {dateLabel(date)}
              </h2>
              {dayEvents.map((e) => (
                <SwipeableRow
                  key={e.id}
                  disabled={e.my_status == null}
                  onSwipeComplete={() => swipeEventStatus(e, "completed")}
                  onSwipeFailed={() => swipeEventStatus(e, "failed")}
                >
                  <button
                    onClick={() => setDrawer(e)}
                    className="flex min-h-[44px] w-full flex-col items-start gap-1 rounded-2xl bg-white px-4 py-3 text-left shadow-card"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span
                        className={`font-medium ${
                          e.my_status === "completed"
                            ? "line-through text-stone-400"
                            : e.my_status === "failed"
                            ? "text-red-700"
                            : ""
                        }`}
                      >
                        {TYPE_ICONS[e.event_type] ?? ""} {e.title}
                      </span>
                      {e.my_status === "completed" && (
                        <span className="shrink-0 text-green-600">✓</span>
                      )}
                      {e.my_status === "failed" && (
                        <span className="shrink-0 text-red-600">✗</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{TYPE_LABELS[e.event_type] ?? e.event_type}</Badge>
                      <span className="text-xs text-stone-500">
                        {toDateInput(e.start_date)}
                        {e.end_date !== e.start_date
                          ? ` – ${toDateInput(e.end_date)}`
                          : ""}
                        {e.start_time ? ` ${toTimeInput(e.start_time)}` : ""}
                        {e.end_time ? `–${toTimeInput(e.end_time)}` : ""}
                      </span>
                    </div>
                  </button>
                </SwipeableRow>
              ))}
            </div>
          ))}
          {filteredEvents.length === 0 && (
            <p className="px-1 py-2 text-sm text-stone-500">
              Nothing scheduled yet.
            </p>
          )}
        </div>
      )}

      {viewMode === "month" && (
        <MonthView
          focusedDate={focusedDate}
          setFocusedDate={setFocusedDate}
          events={filteredEvents}
          onGoToDay={(date) => {
            setFocusedDate(date);
            setViewMode("day");
          }}
        />
      )}

      {viewMode === "week" && (
        <WeekView
          focusedDate={focusedDate}
          setFocusedDate={setFocusedDate}
          events={filteredEvents}
          onOpenEvent={setDrawer}
        />
      )}

      {viewMode === "day" && (
        <DayView
          focusedDate={focusedDate}
          setFocusedDate={setFocusedDate}
          events={filteredEvents}
          onOpenEvent={setDrawer}
          onReschedule={(event, start_time, end_time) =>
            updateEventTime(event, start_time, end_time)
          }
        />
      )}

      {viewMode === "list" && (
        <button
          onClick={() => scrollToToday("smooth")}
          aria-label="Jump to today"
          className="fixed bottom-24 right-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-red-600 text-lg text-white shadow-lg"
        >
          ↑
        </button>
      )}

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New event"
      >
        <form onSubmit={createEvent} className="flex flex-col gap-4">
          <Field label="Title">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Type">
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                required
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={form.start_time}
                onChange={(e) =>
                  setForm({ ...form, start_time: e.target.value })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="End date">
              <input
                required
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
          </div>
          <Field label="Location">
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2"
            />
          </Field>

          {form.event_type === "training" && (
            <SingleSelectPicker
              label="Training module"
              placeholder="Search training modules..."
              options={modules.map((m) => ({ id: m.id, label: m.title }))}
              selectedId={form.training_module_id}
              onSelect={(id) => setForm({ ...form, training_module_id: id })}
            />
          )}

          {canPickAthletes && (
            <AthletePicker
              ids={formAthleteIds}
              options={athletes}
              onAdd={(id) => setFormAthleteIds((prev) => [...prev, id])}
              onRemove={(id) =>
                setFormAthleteIds((prev) => prev.filter((i) => i !== id))
              }
            />
          )}

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
        title={editing?.title ?? ""}
      >
        {editing && (
          <EventDetail
            key={editing.id}
            eventId={editing.id}
            canPickAthletes={canPickAthletes}
            allAthletes={athletes}
            modules={modules}
            katas={katas}
            onUpdated={updateEventInList}
            onDeleted={() => deleteEvent(editing.id)}
          />
        )}
      </Drawer>
    </div>
  );
}

function EventDetail({
  eventId,
  canPickAthletes,
  allAthletes,
  modules,
  katas,
  onUpdated,
  onDeleted,
}: {
  eventId: number;
  canPickAthletes: boolean;
  allAthletes: Person[];
  modules: TrainingModule[];
  katas: Kata[];
  onUpdated: (event: Event) => void;
  onDeleted: () => void;
}) {
  const api = useApi();
  const [event, setEvent] = useState<Event | null>(null);
  const [athleteIds, setAthleteIds] = useState<number[]>([]);
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    api
      .get<{ event: Event; athletes: Person[]; items: EventItem[] }>(
        `/events/${eventId}`
      )
      .then((res) => {
        setEvent(res.event);
        setAthleteIds(res.athletes.map((a) => a.id));
        setItems(res.items);
      })
      .catch(() => setError("Failed to load event"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function updateEvent(patch: Record<string, unknown>) {
    const { event: updated } = await api.patch<{ event: Event }>(
      `/events/${eventId}`,
      patch
    );
    setEvent(updated);
    onUpdated(updated);
  }

  async function setAthletes(ids: number[]) {
    await api.put(`/events/${eventId}/athletes`, { athlete_ids: ids });
    setAthleteIds(ids);
  }

  async function updateEventAthleteStatus(
    athleteId: number,
    patch: Record<string, unknown>
  ) {
    const { status } = await api.patch<{ status: AthleteStatus }>(
      `/events/${eventId}/athletes/${athleteId}`,
      patch
    );
    setEvent((prev) =>
      prev
        ? {
            ...prev,
            athlete_status: prev.athlete_status.map((s) =>
              s.athlete_id === athleteId ? status : s
            ),
          }
        : prev
    );
  }

  if (error) return <div className="text-red-700">{error}</div>;
  if (!event || !items)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );

  const linkedModule =
    event.event_type === "training" && event.training_module_id
      ? modules.find((m) => m.id === event.training_module_id)
      : undefined;
  const athleteNames = allAthletes.filter((a) => athleteIds.includes(a.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsEditing((v) => !v)}
          className="min-h-[44px] rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700"
        >
          {isEditing ? "Done" : "✏️ Edit"}
        </button>
      </div>

      {isEditing ? (
        <>
          <Field label="Title">
            <input
              defaultValue={event.title}
              onBlur={(e) => {
                if (e.target.value !== event.title) {
                  updateEvent({ title: e.target.value });
                }
              }}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Type">
            <select
              value={event.event_type}
              onChange={(e) => updateEvent({ event_type: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                defaultValue={toDateInput(event.start_date)}
                onChange={(e) => updateEvent({ start_date: e.target.value })}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                defaultValue={toTimeInput(event.start_time)}
                onChange={(e) =>
                  updateEvent({ start_time: e.target.value || null })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="End date">
              <input
                type="date"
                defaultValue={toDateInput(event.end_date)}
                onChange={(e) => updateEvent({ end_date: e.target.value })}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                defaultValue={toTimeInput(event.end_time)}
                onChange={(e) =>
                  updateEvent({ end_time: e.target.value || null })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
          </div>
          <Field label="Location">
            <input
              defaultValue={event.location ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (event.location ?? "")) {
                  updateEvent({ location: e.target.value });
                }
              }}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Notes">
            <textarea
              defaultValue={event.notes ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (event.notes ?? "")) {
                  updateEvent({ notes: e.target.value });
                }
              }}
              className="rounded-xl border border-stone-300 px-3 py-2"
            />
          </Field>

          {event.event_type === "training" && (
            <SingleSelectPicker
              label="Training module"
              placeholder="Search training modules..."
              options={modules.map((m) => ({ id: m.id, label: m.title }))}
              selectedId={event.training_module_id}
              onSelect={(id) => updateEvent({ training_module_id: id })}
            />
          )}

          {canPickAthletes && (
            <AthletePicker
              ids={athleteIds}
              options={allAthletes}
              onAdd={(id) => setAthletes([...athleteIds, id])}
              onRemove={(id) => setAthletes(athleteIds.filter((i) => i !== id))}
            />
          )}

          <DeleteButton onClick={onDeleted} itemLabel={event.title} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Badge>{TYPE_LABELS[event.event_type] ?? event.event_type}</Badge>
            <span className="text-sm text-stone-500">
              {toDateInput(event.start_date)}
              {event.end_date !== event.start_date
                ? ` – ${toDateInput(event.end_date)}`
                : ""}
              {event.start_time ? ` ${toTimeInput(event.start_time)}` : ""}
              {event.end_time ? `–${toTimeInput(event.end_time)}` : ""}
            </span>
          </div>
          {event.location && (
            <p className="text-sm text-stone-600">📍 {event.location}</p>
          )}
          {event.notes && <p className="text-stone-700">{event.notes}</p>}

          {linkedModule && <TrainingModuleView module={linkedModule} />}

          {athleteNames.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-600">
                Athletes ({athleteNames.length})
              </span>
              <div className="flex flex-wrap gap-1">
                {athleteNames.map((a) => (
                  <Badge key={a.id}>
                    {a.first_name} {a.last_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <AthleteStatusList
        statuses={event.athlete_status}
        athletes={athleteNames}
        onUpdate={updateEventAthleteStatus}
      />

      <ItemsSection
        eventId={eventId}
        items={items}
        setItems={setItems}
        modules={modules}
        katas={katas}
        editable={isEditing}
        eventAthletes={athleteNames}
      />
    </div>
  );
}

function AthletePicker({
  ids,
  options,
  onAdd,
  onRemove,
}: {
  ids: number[];
  options: Person[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) =>
    `${o.first_name} ${o.last_name}`.toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Athletes ({ids.length})
      </span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search athletes..."
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
              <span>
                {o.first_name} {o.last_name}
              </span>
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

function SingleSelectPicker({
  label,
  placeholder,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  placeholder: string;
  options: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = options.filter((o) => o.label.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">{label}</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
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
              <span>{o.label}</span>
              <span className="text-sm">
                {selected ? "✓ Selected" : "+ Select"}
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

function CalendarNav({
  label,
  onPrev,
  onNext,
  onToday,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onPrev}
        aria-label="Previous"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stone-300 text-lg"
      >
        ‹
      </button>
      <div className="flex flex-col items-center">
        <span className="font-semibold">{label}</span>
        <button
          onClick={onToday}
          className="text-xs font-medium text-red-700"
        >
          Today
        </button>
      </div>
      <button
        onClick={onNext}
        aria-label="Next"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stone-300 text-lg"
      >
        ›
      </button>
    </div>
  );
}

function MonthView({
  focusedDate,
  setFocusedDate,
  events,
  onGoToDay,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  onGoToDay: (date: string) => void;
}) {
  const monthStart = startOfMonth(focusedDate);
  const gridStart = startOfWeek(monthStart);
  const totalDays = daysInMonthOf(focusedDate);
  const monthEnd = addDaysStr(monthStart, totalDays - 1);
  const gridEnd = startOfWeek(monthEnd) === startOfWeek(monthEnd) ? addDaysStr(startOfWeek(monthEnd), 6) : monthEnd;
  const cells: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDaysStr(d, 1)) {
    cells.push(d);
  }

  const today = todayStr();

  return (
    <div className="flex flex-col gap-3">
      <CalendarNav
        label={monthLabel(focusedDate)}
        onPrev={() => setFocusedDate(addDaysStr(startOfMonth(focusedDate), -1))}
        onNext={() => setFocusedDate(addDaysStr(monthEnd, 1))}
        onToday={() => setFocusedDate(todayStr())}
      />
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date) => {
          const inMonth = date >= monthStart && date <= monthEnd;
          const dayEvents = events.filter((e) => eventOverlapsDate(e, date));
          const isToday = date === today;
          return (
            <button
              key={date}
              onClick={() => onGoToDay(date)}
              className={`flex min-h-[56px] flex-col items-center gap-0.5 rounded-xl p-1 text-xs ${
                inMonth ? "bg-white shadow-card" : "bg-transparent text-stone-300"
              } ${isToday ? "ring-2 ring-red-600" : ""}`}
            >
              <span className={inMonth ? "font-medium" : ""}>
                {Number(date.slice(8, 10))}
              </span>
              <div className="flex flex-wrap justify-center gap-0.5 leading-none">
                {dayEvents.slice(0, 3).map((e) => (
                  <span key={e.id} title={e.title}>
                    {TYPE_ICONS[e.event_type] ?? "•"}
                  </span>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-stone-500">
                    +{dayEvents.length - 3}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  focusedDate,
  setFocusedDate,
  events,
  onOpenEvent,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  onOpenEvent: (event: Event) => void;
}) {
  const weekStart = startOfWeek(focusedDate);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));

  function timedEventsFor(date: string) {
    return events.filter(
      (e) =>
        toDateInput(e.start_date) === date &&
        toDateInput(e.end_date) === date &&
        e.start_time &&
        e.end_time
    );
  }

  function allDayEventsFor(date: string) {
    return events.filter(
      (e) =>
        eventOverlapsDate(e, date) &&
        !(toDateInput(e.start_date) === date && toDateInput(e.end_date) === date && e.start_time && e.end_time)
    );
  }

  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT;

  return (
    <div className="flex flex-col gap-3">
      <CalendarNav
        label={weekRangeLabel(weekStart)}
        onPrev={() => setFocusedDate(addDaysStr(weekStart, -7))}
        onNext={() => setFocusedDate(addDaysStr(weekStart, 7))}
        onToday={() => setFocusedDate(todayStr())}
      />

      <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1 text-center text-xs font-medium text-stone-500">
        <span />
        {days.map((d) => (
          <span key={d} className={d === todayStr() ? "text-red-600" : ""}>
            {shortDateLabel(d)}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1">
        <span />
        {days.map((date) => {
          const allDay = allDayEventsFor(date);
          if (allDay.length === 0) return <span key={date} />;
          return (
            <div key={date} className="flex flex-col gap-0.5">
              {allDay.slice(0, 2).map((e) => (
                <button
                  key={e.id}
                  onClick={() => onOpenEvent(e)}
                  className="truncate rounded bg-stone-100 px-1 py-0.5 text-left text-[10px]"
                  title={e.title}
                >
                  {TYPE_ICONS[e.event_type] ?? ""} {e.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex max-h-[60vh] overflow-auto rounded-lg">
        <div className="sticky left-0 flex flex-col bg-stone-100 text-right text-[10px] text-stone-500" style={{ width: 36 }}>
          {GRID_HOURS.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_HEIGHT }}
              className="shrink-0 pr-1 -translate-y-2"
            >
              {formatHour(h)}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((date) => (
            <div
              key={date}
              className="relative rounded-lg bg-white shadow-card"
              style={{ height: gridHeight }}
            >
              {GRID_HOURS.map((h, i) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-stone-100"
                  style={{ top: i * HOUR_HEIGHT }}
                />
              ))}
              {timedEventsFor(date).map((e) => {
                const start = timeToMinutes(e.start_time) ?? DAY_START_HOUR * 60;
                const end = timeToMinutes(e.end_time) ?? start + 30;
                const top = ((start - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 20);
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenEvent(e)}
                    className="absolute inset-x-0.5 overflow-hidden rounded bg-red-50 px-1 text-left text-[10px] text-red-800"
                    style={{ top, height }}
                  >
                    {TYPE_ICONS[e.event_type] ?? ""} {e.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayView({
  focusedDate,
  setFocusedDate,
  events,
  onOpenEvent,
  onReschedule,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  onOpenEvent: (event: Event) => void;
  onReschedule: (event: Event, start_time: string, end_time: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{
    id: number;
    pointerId: number;
    startY: number;
    origStartMin: number;
    origEndMin: number;
    offsetMin: number;
  } | null>(null);

  const timedEvents = events.filter(
    (e) =>
      toDateInput(e.start_date) === focusedDate &&
      toDateInput(e.end_date) === focusedDate &&
      e.start_time &&
      e.end_time
  );
  const allDayEvents = events.filter(
    (e) =>
      eventOverlapsDate(e, focusedDate) &&
      !(
        toDateInput(e.start_date) === focusedDate &&
        toDateInput(e.end_date) === focusedDate &&
        e.start_time &&
        e.end_time
      )
  );

  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT;
  const minutesPerPixel = 60 / HOUR_HEIGHT;

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // Dragging only arms after a long press, so a short press-and-swipe (e.g.
  // scrolling past a card) never moves it — matches the mobile "long-press
  // to reorder" pattern instead of activating drag on any touch.
  function handlePointerDown(e: ReactPointerEvent, event: Event) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    const pointerId = e.pointerId;
    const clientY = e.clientY;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      const startMin = timeToMinutes(event.start_time)!;
      const endMin = timeToMinutes(event.end_time)!;
      setDrag({
        id: event.id,
        pointerId,
        startY: clientY,
        origStartMin: startMin,
        origEndMin: endMin,
        offsetMin: 0,
      });
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (!drag) {
      // Not armed yet: moving too far before the long-press fires means
      // this is a scroll/flick, not a drag intent - cancel the pending arm.
      if (pressStartRef.current) {
        const dx = e.clientX - pressStartRef.current.x;
        const dy = e.clientY - pressStartRef.current.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          clearLongPressTimer();
          pressStartRef.current = null;
        }
      }
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    const deltaY = e.clientY - drag.startY;
    const rawOffset = Math.round((deltaY * minutesPerPixel) / 15) * 15;
    setDrag({ ...drag, offsetMin: rawOffset });
  }

  function handlePointerUp(e: ReactPointerEvent, event: Event) {
    clearLongPressTimer();
    pressStartRef.current = null;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const duration = drag.origEndMin - drag.origStartMin;
    let newStart = drag.origStartMin + drag.offsetMin;
    newStart = Math.max(0, Math.min(24 * 60 - duration, newStart));
    const newEnd = newStart + duration;
    if (drag.offsetMin !== 0) {
      justDraggedRef.current = true;
      onReschedule(event, minutesToTime(newStart), minutesToTime(newEnd));
    }
    setDrag(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <CalendarNav
        label={dateLabel(focusedDate)}
        onPrev={() => setFocusedDate(addDaysStr(focusedDate, -1))}
        onNext={() => setFocusedDate(addDaysStr(focusedDate, 1))}
        onToday={() => setFocusedDate(todayStr())}
      />

      {allDayEvents.length > 0 && (
        <div className="flex flex-col gap-1">
          {allDayEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => onOpenEvent(e)}
              className="flex min-h-[36px] items-center gap-2 rounded-xl bg-stone-100 px-3 text-left text-sm"
            >
              <Badge>{TYPE_ICONS[e.event_type] ?? ""} {TYPE_LABELS[e.event_type] ?? e.event_type}</Badge>
              <span className="truncate">{e.title}</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-500">
        Press and hold a timed event, then drag it up or down to reschedule.
      </p>

      <div className="flex max-h-[60vh] overflow-auto rounded-lg">
        <div
          className="sticky left-0 flex flex-col bg-stone-100 text-right text-[10px] text-stone-500"
          style={{ width: 44 }}
        >
          {GRID_HOURS.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_HEIGHT }}
              className="shrink-0 pr-1 -translate-y-2"
            >
              {formatHour(h)}
            </div>
          ))}
        </div>
        <div
          ref={gridRef}
          className="relative flex-1 rounded-lg bg-white shadow-card"
          style={{ height: gridHeight }}
        >
          {GRID_HOURS.map((h, i) => (
            <div
              key={h}
              className="absolute inset-x-0 border-t border-stone-100"
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}
          {timedEvents.map((e) => {
            const isDragging = drag?.id === e.id;
            const start = timeToMinutes(e.start_time)!;
            const end = timeToMinutes(e.end_time)!;
            const top =
              ((start - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT +
              (isDragging ? (drag.offsetMin / 60) * HOUR_HEIGHT : 0);
            const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 32);
            return (
              <div
                key={e.id}
                onPointerDown={(ev) => handlePointerDown(ev, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={(ev) => handlePointerUp(ev, e)}
                onPointerCancel={(ev) => handlePointerUp(ev, e)}
                onClick={() => {
                  if (justDraggedRef.current) {
                    justDraggedRef.current = false;
                    return;
                  }
                  onOpenEvent(e);
                }}
                className={`absolute inset-x-1 flex cursor-grab flex-col overflow-hidden rounded-xl px-2 py-1 text-left shadow-card active:cursor-grabbing ${
                  isDragging ? "z-10 bg-red-100" : "bg-red-50"
                }`}
                style={{ top, height, touchAction: "none" }}
              >
                <span className="truncate text-xs font-medium text-red-900">
                  {TYPE_ICONS[e.event_type] ?? ""} {e.title}
                </span>
                <span className="text-[10px] text-red-700">
                  {toTimeInput(
                    minutesToTime(
                      isDragging ? drag.origStartMin + drag.offsetMin : start
                    )
                  )}
                  –
                  {toTimeInput(
                    minutesToTime(
                      isDragging
                        ? drag.origStartMin + drag.offsetMin + (end - start)
                        : end
                    )
                  )}
                </span>
              </div>
            );
          })}
          {timedEvents.length === 0 && allDayEvents.length === 0 && (
            <p className="absolute inset-x-0 top-4 text-center text-sm text-stone-500">
              Nothing scheduled.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function weekdayOf(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function kataLabel(k: Kata) {
  const label = k.wkf_number != null ? `${k.wkf_number}. ${k.name}` : k.name;
  return k.style ? `${label} (${k.style})` : label;
}

const SWIPE_THRESHOLD = 64;

// Wraps a row with horizontal swipe-to-flag: swipe left calls onSwipeComplete,
// swipe right calls onSwipeFailed. Pointer events (not HTML5 drag-and-drop)
// so it works on touch, same approach as the Day view's drag-to-move.
function SwipeableRow({
  children,
  onSwipeComplete,
  onSwipeFailed,
  disabled,
  className,
}: {
  children: ReactNode;
  onSwipeComplete: () => void;
  onSwipeFailed: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const draggedRef = useRef(false);

  function onPointerDown(e: ReactPointerEvent) {
    if (disabled) return;
    startXRef.current = e.clientX;
    draggedRef.current = false;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (startXRef.current == null) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > 8) draggedRef.current = true;
    setDragX(delta);
  }

  function onPointerUp() {
    if (startXRef.current == null) return;
    if (dragX <= -SWIPE_THRESHOLD) onSwipeComplete();
    else if (dragX >= SWIPE_THRESHOLD) onSwipeFailed();
    setDragX(0);
    startXRef.current = null;
  }

  const hintOpacity = Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className ?? ""}`}>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 flex w-16 items-center justify-center bg-green-100 text-green-700"
        style={{ opacity: dragX < 0 ? hintOpacity : 0 }}
      >
        ✓
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-center bg-red-100 text-red-700"
        style={{ opacity: dragX > 0 ? hintOpacity : 0 }}
      >
        ✗
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (draggedRef.current) {
            e.stopPropagation();
            e.preventDefault();
            draggedRef.current = false;
          }
        }}
        style={{
          transform: `translateX(${dragX}px)`,
          touchAction: "pan-y",
          transition: dragX === 0 ? "transform 150ms ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AthleteStatusList({
  statuses,
  athletes,
  onUpdate,
}: {
  statuses: AthleteStatus[];
  athletes: Person[];
  onUpdate: (athleteId: number, patch: Record<string, unknown>) => void;
}) {
  if (statuses.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-stone-200 p-3">
      <span className="text-xs font-medium text-stone-600">Completion</span>
      {statuses.map((s) => {
        const athlete = athletes.find((a) => a.id === s.athlete_id);
        return (
          <div
            key={s.athlete_id}
            className="flex flex-col gap-2 rounded-lg bg-stone-50 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={
                  s.status === "completed"
                    ? "line-through text-stone-400"
                    : s.status === "failed"
                    ? "text-red-700"
                    : ""
                }
              >
                {athlete ? `${athlete.first_name} ${athlete.last_name}` : "Athlete"}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={!s.can_edit}
                  onClick={() =>
                    onUpdate(s.athlete_id, {
                      status: s.status === "completed" ? "pending" : "completed",
                    })
                  }
                  aria-label="Mark complete"
                  className={`min-h-[36px] min-w-[36px] rounded-full text-sm font-medium disabled:opacity-50 ${
                    s.status === "completed"
                      ? "bg-green-600 text-white"
                      : "border border-stone-300 text-stone-600"
                  }`}
                >
                  ✓
                </button>
                <button
                  type="button"
                  disabled={!s.can_edit}
                  onClick={() =>
                    onUpdate(s.athlete_id, {
                      status: s.status === "failed" ? "pending" : "failed",
                    })
                  }
                  aria-label="Mark failed"
                  className={`min-h-[36px] min-w-[36px] rounded-full text-sm font-medium disabled:opacity-50 ${
                    s.status === "failed"
                      ? "bg-red-600 text-white"
                      : "border border-stone-300 text-stone-600"
                  }`}
                >
                  ✗
                </button>
              </div>
            </div>
            <textarea
              defaultValue={s.notes ?? ""}
              placeholder="Notes..."
              disabled={!s.can_edit}
              onBlur={(e) => {
                if (e.target.value !== (s.notes ?? "")) {
                  onUpdate(s.athlete_id, { notes: e.target.value });
                }
              }}
              className="rounded-lg border border-stone-300 px-2 py-1 text-sm disabled:bg-stone-100 disabled:text-stone-400"
            />
          </div>
        );
      })}
    </div>
  );
}

function ItemsSection({
  eventId,
  items,
  setItems,
  modules,
  katas,
  editable,
  eventAthletes,
}: {
  eventId: number;
  items: EventItem[];
  setItems: (items: EventItem[]) => void;
  modules: TrainingModule[];
  katas: Kata[];
  editable: boolean;
  eventAthletes: Person[];
}) {
  const api = useApi();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ITEM_FORM);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = [...items].sort((a, b) =>
    `${a.item_date}${a.start_time ?? ""}`.localeCompare(
      `${b.item_date}${b.start_time ?? ""}`
    )
  );

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (
      !addForm.title.trim() ||
      !addForm.item_date ||
      !addForm.start_time ||
      !addForm.end_time
    )
      return;

    const payload: Record<string, unknown> = {
      item_type: addForm.item_type,
      title: addForm.title,
      item_date: addForm.item_date,
      start_time: addForm.start_time,
      end_time: addForm.end_time,
      notes: addForm.notes,
      training_module_id:
        addForm.item_type === "training" ? addForm.training_module_id : null,
      kata_id:
        addForm.item_type === "kata_performance" ? addForm.kata_id : null,
    };
    if (addForm.repeat_freq !== "none") {
      payload.repeat = {
        freq: addForm.repeat_freq,
        until: addForm.repeat_until,
        weekdays:
          addForm.repeat_freq === "weekly"
            ? addForm.repeat_weekdays.length > 0
              ? addForm.repeat_weekdays
              : [weekdayOf(addForm.item_date)]
            : undefined,
      };
    }

    const res = await api.post<{ item?: EventItem; items?: EventItem[] }>(
      `/events/${eventId}/items`,
      payload
    );
    setItems([...items, ...(res.items ?? (res.item ? [res.item] : []))]);
    setAddForm(EMPTY_ITEM_FORM);
    setAdding(false);
  }

  async function updateItem(id: number, patch: Record<string, unknown>) {
    const { item } = await api.patch<{ item: EventItem }>(
      `/events/${eventId}/items/${id}`,
      patch
    );
    setItems(items.map((i) => (i.id === id ? item : i)));
  }

  async function updateAthleteStatus(
    itemId: number,
    athleteId: number,
    patch: Record<string, unknown>
  ) {
    const { status } = await api.patch<{ status: AthleteStatus }>(
      `/events/${eventId}/items/${itemId}/athletes/${athleteId}`,
      patch
    );
    setItems(
      items.map((i) =>
        i.id === itemId
          ? {
              ...i,
              athlete_status: i.athlete_status.map((s) =>
                s.athlete_id === athleteId ? status : s
              ),
            }
          : i
      )
    );
  }

  async function deleteItem(id: number) {
    await api.del(`/events/${eventId}/items/${id}`);
    setItems(items.filter((i) => i.id !== id));
    setExpandedId(null);
  }

  function duplicateItem(item: EventItem) {
    setAddForm({
      item_type: item.item_type,
      title: item.title,
      item_date: toDateInput(item.item_date),
      start_time: toTimeInput(item.start_time),
      end_time: toTimeInput(item.end_time),
      notes: item.notes ?? "",
      training_module_id: item.training_module_id,
      kata_id: item.kata_id,
      repeat_freq: "none",
      repeat_until: "",
      repeat_weekdays: [],
    });
    setExpandedId(null);
    setAdding(true);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Itinerary ({items.length})
      </span>

      <div className="flex flex-col gap-1">
        {sorted.map((item) => {
          const expanded = expandedId === item.id;
          const myStatus =
            user?.role === "athlete" && user.athlete_id
              ? item.athlete_status.find((s) => s.athlete_id === user.athlete_id)
              : undefined;
          const completedCount = item.athlete_status.filter(
            (s) => s.status === "completed"
          ).length;
          const failedCount = item.athlete_status.filter(
            (s) => s.status === "failed"
          ).length;
          const totalCount = item.athlete_status.length;
          const myEffectiveStatus: CompletionStatus =
            myStatus?.status ??
            (failedCount > 0
              ? "failed"
              : totalCount > 0 && completedCount === totalCount
              ? "completed"
              : "pending");

          return (
            <SwipeableRow
              key={item.id}
              disabled={!myStatus}
              onSwipeComplete={() =>
                myStatus &&
                updateAthleteStatus(item.id, myStatus.athlete_id, {
                  status: "completed",
                })
              }
              onSwipeFailed={() =>
                myStatus &&
                updateAthleteStatus(item.id, myStatus.athlete_id, {
                  status: "failed",
                })
              }
            >
              <div className="rounded-xl border border-stone-200 bg-white">
                <div className="flex w-full items-start gap-2 px-3 py-2">
                  {myStatus ? (
                    <button
                      type="button"
                      aria-label={`Mark "${item.title}" complete or failed`}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAthleteStatus(item.id, myStatus.athlete_id, {
                          status: myStatus.status === "completed" ? "pending" : "completed",
                        });
                      }}
                      className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
                        myStatus.status === "completed"
                          ? "bg-green-600 text-white"
                          : myStatus.status === "failed"
                          ? "bg-red-600 text-white"
                          : "border border-stone-300"
                      }`}
                    >
                      {myStatus.status === "completed"
                        ? "✓"
                        : myStatus.status === "failed"
                        ? "✗"
                        : ""}
                    </button>
                  ) : totalCount > 0 ? (
                    <span
                      className={`mt-1.5 shrink-0 text-xs font-medium ${
                        failedCount > 0 ? "text-red-600" : "text-stone-500"
                      }`}
                    >
                      {completedCount}/{totalCount}
                    </span>
                  ) : (
                    <span className="mt-1.5 w-5 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="flex min-h-[44px] flex-1 flex-col items-start gap-1 text-left"
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={
                          myEffectiveStatus === "completed"
                            ? "line-through text-stone-400"
                            : myEffectiveStatus === "failed"
                            ? "text-red-700"
                            : ""
                        }
                      >
                        {item.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge>{TYPE_LABELS[item.item_type] ?? item.item_type}</Badge>
                        <span className="text-xs text-stone-500">
                          {toDateInput(item.item_date)}
                        </span>
                      </div>
                    </div>
                    {(item.training_module_id || item.kata_id) && (
                      <span className="text-xs text-stone-500">
                        {item.training_module_id &&
                          modules.find((m) => m.id === item.training_module_id)
                            ?.title}
                        {item.kata_id &&
                          katas.find((k) => k.id === item.kata_id)?.name}
                      </span>
                    )}
                  </button>
                </div>
              {expanded && !editable && (
                <div className="flex flex-col gap-3 border-t border-stone-200 p-3">
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <span>
                      {toTimeInput(item.start_time)}–{toTimeInput(item.end_time)}
                    </span>
                  </div>
                  {item.notes && (
                    <p className="text-sm text-stone-700">{item.notes}</p>
                  )}
                  {item.item_type === "training" &&
                    item.training_module_id &&
                    (() => {
                      const module = modules.find(
                        (m) => m.id === item.training_module_id
                      );
                      return module ? <TrainingModuleView module={module} /> : null;
                    })()}
                  {item.item_type === "kata_performance" && item.kata_id && (
                    <p className="text-sm text-stone-600">
                      {katas.find((k) => k.id === item.kata_id) &&
                        kataLabel(katas.find((k) => k.id === item.kata_id)!)}
                    </p>
                  )}
                </div>
              )}
              {expanded && editable && (
                <div className="flex flex-col gap-3 border-t border-stone-200 p-3">
                  <Field label="Title">
                    <input
                      defaultValue={item.title}
                      onBlur={(e) => {
                        if (e.target.value !== item.title) {
                          updateItem(item.id, { title: e.target.value });
                        }
                      }}
                      className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={item.item_type}
                      onChange={(e) =>
                        updateItem(item.id, { item_type: e.target.value })
                      }
                      className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date">
                      <input
                        type="date"
                        defaultValue={toDateInput(item.item_date)}
                        onChange={(e) =>
                          updateItem(item.id, { item_date: e.target.value })
                        }
                        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                      />
                    </Field>
                    <Field label="Start time">
                      <input
                        required
                        type="time"
                        defaultValue={toTimeInput(item.start_time)}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateItem(item.id, { start_time: e.target.value });
                          }
                        }}
                        className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                      />
                    </Field>
                  </div>
                  <Field label="End time">
                    <input
                      required
                      type="time"
                      defaultValue={toTimeInput(item.end_time)}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateItem(item.id, { end_time: e.target.value });
                        }
                      }}
                      className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      defaultValue={item.notes ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (item.notes ?? "")) {
                          updateItem(item.id, { notes: e.target.value });
                        }
                      }}
                      className="rounded-xl border border-stone-300 px-3 py-2"
                    />
                  </Field>
                  {item.item_type === "training" && (
                    <SingleSelectPicker
                      label="Training module"
                      placeholder="Search training modules..."
                      options={modules.map((m) => ({ id: m.id, label: m.title }))}
                      selectedId={item.training_module_id}
                      onSelect={(id) =>
                        updateItem(item.id, { training_module_id: id })
                      }
                    />
                  )}
                  {item.item_type === "kata_performance" && (
                    <SingleSelectPicker
                      label="Kata"
                      placeholder="Search katas..."
                      options={katas.map((k) => ({ id: k.id, label: kataLabel(k) }))}
                      selectedId={item.kata_id}
                      onSelect={(id) =>
                        updateItem(item.id, {
                          kata_id: id,
                          ...(id
                            ? { title: katas.find((k) => k.id === id)?.name }
                            : {}),
                        })
                      }
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => duplicateItem(item)}
                      className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700"
                    >
                      Duplicate / repeat
                    </button>
                  </div>
                  <DeleteButton
                    onClick={() => deleteItem(item.id)}
                    itemLabel={item.title}
                  />
                </div>
              )}
              {expanded && (
                <AthleteStatusList
                  statuses={item.athlete_status}
                  athletes={eventAthletes}
                  onUpdate={(athleteId, patch) =>
                    updateAthleteStatus(item.id, athleteId, patch)
                  }
                />
              )}
              </div>
            </SwipeableRow>
          );
        })}
        {sorted.length === 0 && !adding && (
          <p className="px-1 py-2 text-sm text-stone-500">
            No itinerary items yet.
          </p>
        )}
      </div>

      {editable && (adding ? (
        <form
          onSubmit={addItem}
          className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3"
        >
          <Field label="Title">
            <input
              required
              value={addForm.title}
              onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Type">
            <select
              value={addForm.item_type}
              onChange={(e) =>
                setAddForm({ ...addForm, item_type: e.target.value })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                required
                type="date"
                value={addForm.item_date}
                onChange={(e) =>
                  setAddForm({ ...addForm, item_date: e.target.value })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
            <Field label="Start time">
              <input
                required
                type="time"
                value={addForm.start_time}
                onChange={(e) =>
                  setAddForm({ ...addForm, start_time: e.target.value })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
          </div>
          <Field label="End time">
            <input
              required
              type="time"
              value={addForm.end_time}
              onChange={(e) =>
                setAddForm({ ...addForm, end_time: e.target.value })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2"
            />
          </Field>

          {addForm.item_type === "training" && (
            <SingleSelectPicker
              label="Training module"
              placeholder="Search training modules..."
              options={modules.map((m) => ({ id: m.id, label: m.title }))}
              selectedId={addForm.training_module_id}
              onSelect={(id) =>
                setAddForm({ ...addForm, training_module_id: id })
              }
            />
          )}
          {addForm.item_type === "kata_performance" && (
            <SingleSelectPicker
              label="Kata"
              placeholder="Search katas..."
              options={katas.map((k) => ({ id: k.id, label: kataLabel(k) }))}
              selectedId={addForm.kata_id}
              onSelect={(id) =>
                setAddForm({
                  ...addForm,
                  kata_id: id,
                  title: id ? katas.find((k) => k.id === id)?.name ?? addForm.title : addForm.title,
                })
              }
            />
          )}

          <Field label="Repeats">
            <select
              value={addForm.repeat_freq}
              onChange={(e) =>
                setAddForm({
                  ...addForm,
                  repeat_freq: e.target.value,
                  repeat_weekdays: [],
                })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          {addForm.repeat_freq !== "none" && (
            <Field label="Repeat until">
              <input
                required
                type="date"
                value={addForm.repeat_until}
                onChange={(e) =>
                  setAddForm({ ...addForm, repeat_until: e.target.value })
                }
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
            </Field>
          )}
          {addForm.repeat_freq === "weekly" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-600">
                Repeat on
              </span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_LABELS.map((label, day) => {
                  const active =
                    addForm.repeat_weekdays.length > 0
                      ? addForm.repeat_weekdays.includes(day)
                      : addForm.item_date && weekdayOf(addForm.item_date) === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const base =
                          addForm.repeat_weekdays.length > 0
                            ? addForm.repeat_weekdays
                            : addForm.item_date
                              ? [weekdayOf(addForm.item_date)]
                              : [];
                        const next = base.includes(day)
                          ? base.filter((d) => d !== day)
                          : [...base, day];
                        setAddForm({ ...addForm, repeat_weekdays: next });
                      }}
                      className={`min-h-[36px] min-w-[44px] rounded-xl border px-2 text-sm ${
                        active
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-stone-300"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white"
            >
              Add
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
        >
          + Add itinerary item
        </button>
      ))}
    </div>
  );
}
