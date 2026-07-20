import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  Badge,
  DateTimeField,
} from "../components/ui";
import { TrainingModuleView, type TrainingModule } from "../components/TrainingModuleView";
import { EventCompetitionResults } from "../components/CompetitionResults";
import { todayStr, addDaysStr, dateLabel, groupByDate } from "../utils/dates";

type CompletionStatus = "pending" | "completed" | "failed";

interface Event {
  id: number;
  title: string;
  event_type: string;
  club_id: number | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  daily_times: boolean;
  location: string | null;
  venue_id: number | null;
  kata_id: number | null;
  notes: string | null;
  training_module_id: number | null;
  recurrence_id: string | null;
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
  recurrence_id: string | null;
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

interface Venue {
  id: number;
  name: string;
  address: string | null;
  club_id: number | null;
  club_name: string | null;
}

interface AthleteGroup {
  id: number;
  name: string;
  club_id: number;
  club_name: string;
  athlete_ids: number[];
}

interface Club {
  id: number;
  name: string;
}

interface EventTypeRow {
  id: number;
  club_id: number;
  key: string;
  label: string;
  icon: string;
  bg_color: string;
  is_standard: boolean;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// event_type/item_type used to be a fixed global enum (this exact list);
// now each club has its own nk_event_types library (standard + custom,
// with its own icon/bg_color), fetched into `eventTypes` and looked up via
// `typeInfo` below. This list survives only as the final fallback if a
// key doesn't resolve against any fetched row at all (fetch failure, or a
// legacy event whose club couldn't be determined and whose key somehow
// isn't seeded as standard anywhere).
const FALLBACK_TYPE_LABELS: Record<string, string> = {
  competition: "Competition",
  squad_session: "Squad session",
  training: "Training",
  travel: "Travel",
  time_off: "Time off",
  seminar: "Seminar",
  training_camp: "Training camp",
  grading: "Grading",
  rest: "Rest",
  other: "Other",
  kata_performance: "Kata performance",
};
const FALLBACK_TYPE_ICONS: Record<string, string> = {
  competition: "🏆",
  squad_session: "👥",
  training: "💪",
  travel: "✈️",
  time_off: "🌴",
  seminar: "🎓",
  training_camp: "⛺",
  grading: "🎖️",
  rest: "😴",
  other: "📌",
  kata_performance: "🥋",
};

// Resolves a (club_id, key) pair to display info: prefer that exact
// club's row, fall back to any is_standard row sharing the key (covers a
// legacy event with no determinable club_id), then the hardcoded
// fallback maps above (covers a fetch failure) so the UI never shows a
// blank icon/label.
function typeInfo(eventTypes: EventTypeRow[], clubId: number | null, key: string) {
  const match =
    eventTypes.find((t) => t.club_id === clubId && t.key === key) ??
    eventTypes.find((t) => t.key === key && t.is_standard) ??
    eventTypes.find((t) => t.key === key);
  return {
    label: match?.label ?? FALLBACK_TYPE_LABELS[key] ?? key,
    icon: match?.icon ?? FALLBACK_TYPE_ICONS[key] ?? "📌",
    bg_color: match?.bg_color ?? "#78716c",
  };
}

const EMPTY_FORM = {
  title: "",
  event_type: "training",
  club_id: null as number | null,
  start_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  daily_times: false,
  location: "",
  venue_id: null as number | null,
  notes: "",
  training_module_id: null as number | null,
  kata_id: null as number | null,
  repeat_freq: "none",
  repeat_interval: 1,
  repeat_weekdays: [] as number[],
  repeat_day_of_month: null as number | null,
  repeat_end_type: "until",
  repeat_until: "",
  repeat_count: 4,
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
  repeat_interval: 1,
  repeat_weekdays: [] as number[],
  repeat_day_of_month: null as number | null,
  repeat_end_type: "until",
  repeat_until: "",
  repeat_count: 4,
};

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : "";
}

function toTimeInput(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

// Splits a JS Date into the same local date/time string shapes the
// date/time inputs use, so a "now" (or "now + N hours") default can be
// dropped straight into form state - used to pre-fill new event/item
// start+end fields instead of leaving them blank.
function splitLocalDateTime(d: Date) {
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
  return { date, time };
}

function nowPlusHours(hours: number) {
  return splitLocalDateTime(new Date(Date.now() + hours * 60 * 60 * 1000));
}

interface EventOccurrence {
  event: Event;
  date: string;
  dayIndex: number;
  totalDays: number;
}

// List view shows a multi-day event on every date it spans (not just its
// start date), each tagged with its position in the span ("Day 2 of 4") -
// this expands each event into one occurrence per date first, so grouping
// by date naturally places it under every day it covers.
function expandEventsForList(events: Event[]): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const event of events) {
    const start = toDateInput(event.start_date);
    const end = toDateInput(event.end_date);
    const totalDays =
      Math.round(
        (new Date(`${end}T00:00:00Z`).getTime() -
          new Date(`${start}T00:00:00Z`).getTime()) /
          86400000
      ) + 1;
    let date = start;
    for (let dayIndex = 1; dayIndex <= totalDays; dayIndex++) {
      out.push({ event, date, dayIndex, totalDays });
      date = addDaysStr(date, 1);
    }
  }
  return out;
}

function groupOccurrencesByDate(occurrences: EventOccurrence[]) {
  return groupByDate(occurrences, (o) => o.date).map(({ date, items }) => ({
    date,
    occurrences: items,
  }));
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

// Whether `event` should render as a timed block on `dateStr` (vs. an
// all-day bar): always true for a same-day event with both times set;
// for a multi-day event only when daily_times is on, since otherwise
// start_time/end_time mark the boundaries of one continuous span rather
// than a time slot repeated on every day it covers.
function isTimedOnDate(event: Event, dateStr: string) {
  if (!event.start_time || !event.end_time) return false;
  if (toDateInput(event.start_date) === dateStr && toDateInput(event.end_date) === dateStr) {
    return true;
  }
  return event.daily_times && eventOverlapsDate(event, dateStr);
}

// An event is overdue when the athlete never marked it complete/failed and
// its whole date range has already passed - only meaningful for the
// signed-in athlete's own events (my_status is null for a coach/admin
// viewing someone else's, since there's nothing "incomplete" from their
// point of view).
function isOverdue(event: Event) {
  return event.my_status === "pending" && toDateInput(event.end_date) < todayStr();
}

// Merges a newly-fetched slice into the already-loaded events, replacing
// any duplicate by id rather than assuming the windows never overlap -
// keeps lazy-loaded pages idempotent to re-fetch.
function mergeEvents(prev: Event[] | null, incoming: Event[]) {
  const map = new Map((prev ?? []).map((e) => [e.id, e]));
  for (const e of incoming) map.set(e.id, e);
  return [...map.values()];
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

// The list view initially loads a 4-week window centered on today (2 back,
// 2 forward) rather than the whole schedule, then lazy-loads another 2
// weeks in whichever direction the user scrolls toward, capped a year out
// either way so an empty schedule can't make the observer fetch forever.
const INITIAL_WINDOW_DAYS = 14;
const LAZY_LOAD_STEP_DAYS = 14;
const MAX_WINDOW_DAYS = 365;

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
  const [venues, setVenues] = useState<Venue[]>([]);
  const [squads, setSquads] = useState<AthleteGroup[]>([]);
  const [groups, setGroups] = useState<AthleteGroup[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [typeFilterDrawerOpen, setTypeFilterDrawerOpen] = useState(false);
  const [drawer, setDrawer] = useState<"closed" | "create" | Event>("closed");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formAthleteIds, setFormAthleteIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "day" | "week" | "month">(
    "list"
  );
  const [focusedDate, setFocusedDate] = useState(todayStr());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasAutoScrolledRef = useRef(false);
  const loadedFromRef = useRef(addDaysStr(todayStr(), -INITIAL_WINDOW_DAYS));
  const loadedToRef = useRef(addDaysStr(todayStr(), INITIAL_WINDOW_DAYS));
  const loadingPastRef = useRef(false);
  const loadingFutureRef = useRef(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const suppressLazyLoadRef = useRef(false);
  const suppressLazyLoadTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (events ?? []).filter((e) => {
      const matchesQuery = `${e.title} ${
        typeInfo(eventTypes, e.club_id, e.event_type).label
      }`
        .toLowerCase()
        .includes(q);
      const matchesType = typeFilters.size === 0 || typeFilters.has(e.event_type);
      return matchesQuery && matchesType;
    });
  }, [events, query, typeFilters, eventTypes]);

  const typeFilterOptions = useMemo(() => {
    const seen = new Map<string, { label: string; icon: string; bg_color: string }>();
    for (const e of events ?? []) {
      if (!seen.has(e.event_type)) {
        const info = typeInfo(eventTypes, e.club_id, e.event_type);
        seen.set(e.event_type, {
          label: info.label,
          icon: info.icon,
          bg_color: info.bg_color,
        });
      }
    }
    return [...seen.entries()]
      .map(([key, info]) => ({ key, ...info }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events, eventTypes]);

  function toggleTypeFilter(key: string) {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function scrollToToday(behavior: ScrollBehavior = "smooth") {
    const today = todayStr();
    const groups = groupOccurrencesByDate(expandEventsForList(filteredEvents));
    const target =
      groups.find((g) => g.date >= today) ?? groups[groups.length - 1];
    const el = target && sectionRefs.current[target.date];
    if (!el) return;
    if (behavior === "smooth") {
      // Jumping back to today from far in the future has to scroll back
      // past the near-top lazy-load threshold on the way there; without
      // this guard that fires loadMorePast() mid-animation, prepending
      // more days above and throwing off where the in-progress smooth
      // scroll actually lands. Lifted by the scroll-idle detector in the
      // effect below once the animation actually settles (a native
      // smooth scroll's duration isn't fixed - it scales with distance -
      // so a flat timeout here would either cut in too early on a long
      // jump or hold the lazy-load thresholds off for no reason on a
      // short one); the timeout is just a safety net in case scroll
      // events stop arriving for some other reason.
      suppressLazyLoadRef.current = true;
      window.clearTimeout(suppressLazyLoadTimeoutRef.current);
      suppressLazyLoadTimeoutRef.current = window.setTimeout(() => {
        suppressLazyLoadRef.current = false;
      }, 4000);
    }
    el.scrollIntoView({ behavior, block: "start" });
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

  // List view lazy-loads further past/future weeks only in response to an
  // actual scroll gesture on the page's scroll container (App.tsx's
  // <main>, which Schedule.tsx doesn't otherwise hold a ref to) - not an
  // IntersectionObserver, which would fire immediately (before the user
  // scrolls at all) any time the loaded window is sparse enough not to
  // fill the viewport on its own, cascading through months of empty
  // fetches. Near-top/near-bottom thresholds trigger the next 2-week page;
  // loadMorePast/loadMoreFuture's own re-entrancy guards and MAX_WINDOW_DAYS
  // bound keep repeated scroll events from piling up requests.
  useEffect(() => {
    if (viewMode !== "list") return;
    const container = document.querySelector("main");
    if (!container) return;

    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    function onScroll() {
      if (!container) return;
      if (suppressLazyLoadRef.current) {
        // Still mid-jump from scrollToToday's programmatic scroll; a
        // native smooth scroll's duration scales with distance, so
        // rather than guessing when it's done, treat "no more scroll
        // events for a beat" as done and resume the thresholds then.
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          suppressLazyLoadRef.current = false;
        }, 150);
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop < 150) loadMorePast();
      if (scrollHeight - scrollTop - clientHeight < 150) loadMoreFuture();
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      window.clearTimeout(idleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  async function loadMorePast() {
    const oldestAllowed = addDaysStr(todayStr(), -MAX_WINDOW_DAYS);
    if (loadingPastRef.current || loadedFromRef.current <= oldestAllowed) return;
    loadingPastRef.current = true;
    setLoadingPast(true);
    const to = addDaysStr(loadedFromRef.current, -1);
    let from = addDaysStr(loadedFromRef.current, -LAZY_LOAD_STEP_DAYS);
    if (from < oldestAllowed) from = oldestAllowed;
    try {
      const res = await api.get<{ events: Event[] }>(
        `/events?from=${from}&to=${to}`
      );
      setEvents((prev) => mergeEvents(prev, res.events));
      loadedFromRef.current = from;
    } catch {
      // leave the window as-is; the next scroll near the edge retries
    } finally {
      loadingPastRef.current = false;
      setLoadingPast(false);
    }
  }

  async function loadMoreFuture() {
    const newestAllowed = addDaysStr(todayStr(), MAX_WINDOW_DAYS);
    if (loadingFutureRef.current || loadedToRef.current >= newestAllowed) return;
    loadingFutureRef.current = true;
    setLoadingFuture(true);
    const from = addDaysStr(loadedToRef.current, 1);
    let to = addDaysStr(loadedToRef.current, LAZY_LOAD_STEP_DAYS);
    if (to > newestAllowed) to = newestAllowed;
    try {
      const res = await api.get<{ events: Event[] }>(
        `/events?from=${from}&to=${to}`
      );
      setEvents((prev) => mergeEvents(prev, res.events));
      loadedToRef.current = to;
    } catch {
      // leave the window as-is; the next scroll near the edge retries
    } finally {
      loadingFutureRef.current = false;
      setLoadingFuture(false);
    }
  }

  function load() {
    api
      .get<{ events: Event[] }>(
        `/events?from=${loadedFromRef.current}&to=${loadedToRef.current}`
      )
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

    api
      .get<{ venues: Venue[] }>("/venues")
      .then((res) => setVenues(res.venues))
      .catch(() => setVenues([]));

    if (canPickAthletes) {
      api
        .get<{ squads: AthleteGroup[] }>("/squads")
        .then((res) => setSquads(res.squads))
        .catch(() => setSquads([]));
      api
        .get<{ groups: AthleteGroup[] }>("/groups")
        .then((res) => setGroups(res.groups))
        .catch(() => setGroups([]));
      api
        .get<{ clubs: Club[] }>("/admin/clubs")
        .then((res) => setClubs(res.clubs))
        .catch(() => setClubs([]));
    }

    api
      .get<{ types: EventTypeRow[] }>("/event-types")
      .then((res) => setEventTypes(res.types))
      .catch(() => setEventTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  function openCreate() {
    const start = splitLocalDateTime(new Date());
    const end = nowPlusHours(2);
    setForm({
      ...EMPTY_FORM,
      club_id: clubs[0]?.id ?? null,
      start_date: start.date,
      start_time: start.time,
      end_date: end.date,
      end_time: end.time,
    });
    setFormAthleteIds([]);
    setDrawer("create");
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.start_date || !form.end_date) return;

    const payload: Record<string, unknown> = {
      ...form,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      training_module_id:
        form.event_type === "training" ? form.training_module_id : null,
      kata_id: form.event_type === "kata_performance" ? form.kata_id : null,
      athlete_ids: canPickAthletes ? formAthleteIds : undefined,
    };
    if (form.repeat_freq !== "none") {
      payload.repeat = {
        freq: form.repeat_freq,
        interval: form.repeat_interval || 1,
        weekdays:
          form.repeat_freq === "weekly"
            ? form.repeat_weekdays.length > 0
              ? form.repeat_weekdays
              : [weekdayOf(form.start_date)]
            : undefined,
        day_of_month:
          form.repeat_freq === "monthly"
            ? form.repeat_day_of_month || dayOfMonthOf(form.start_date)
            : undefined,
        end:
          form.repeat_end_type === "count"
            ? { type: "count", count: form.repeat_count || 1 }
            : { type: "until", date: form.repeat_until },
      };
    }

    const res = await api.post<{ event?: Event; events?: Event[] }>(
      "/events",
      payload
    );
    const created = res.events ?? (res.event ? [res.event] : []);
    setEvents((prev) => (prev ? [...prev, ...created] : created));
    setDrawer("closed");
  }

  function duplicateEvent(event: Event, athleteIds: number[]) {
    setForm({
      title: event.title,
      event_type: event.event_type,
      club_id: event.club_id,
      start_date: toDateInput(event.start_date),
      end_date: toDateInput(event.end_date),
      start_time: toTimeInput(event.start_time),
      end_time: toTimeInput(event.end_time),
      daily_times: event.daily_times,
      location: event.location ?? "",
      venue_id: event.venue_id,
      notes: event.notes ?? "",
      training_module_id: event.training_module_id,
      kata_id: event.kata_id,
      repeat_freq: "none",
      repeat_interval: 1,
      repeat_weekdays: [],
      repeat_day_of_month: null,
      repeat_end_type: "until",
      repeat_until: "",
      repeat_count: 4,
    });
    setFormAthleteIds(athleteIds);
    setDrawer("create");
  }

  async function deleteEvent(id: number) {
    await api.del(`/events/${id}`);
    setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    setDrawer("closed");
  }

  async function deleteEventSeries(event: Event) {
    const { deleted_ids } = await api.del<{ deleted_ids: number[] }>(
      `/events/${event.id}/series`
    );
    const deletedSet = new Set(deleted_ids);
    setEvents((prev) => (prev ? prev.filter((e) => !deletedSet.has(e.id)) : prev));
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

  const editing = drawer !== "closed" && drawer !== "create" ? drawer : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-3 bg-stone-100 px-4 pb-2 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <AddButton onClick={openCreate} />
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search schedule..."
            className="min-h-[44px] flex-1 rounded-xl border border-stone-300 px-3"
          />
          <button
            type="button"
            onClick={() => setTypeFilterDrawerOpen(true)}
            aria-label="Filter by type"
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-stone-300 bg-white text-lg"
          >
            🏷️
            {typeFilters.size > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white">
                {typeFilters.size}
              </span>
            )}
          </button>
        </div>

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

      <Drawer
        open={typeFilterDrawerOpen}
        onClose={() => setTypeFilterDrawerOpen(false)}
        title="Filter by type"
      >
        <div className="flex flex-col gap-4">
          {typeFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilters(new Set())}
              className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
            >
              Clear filters
            </button>
          )}
          <div className="grid grid-cols-3 gap-3">
            {typeFilterOptions.map((t) => {
              const selected = typeFilters.has(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleTypeFilter(t.key)}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center shadow-card ${
                    selected ? "ring-2 ring-red-600" : ""
                  }`}
                  style={{ backgroundColor: selected ? t.bg_color : "white" }}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                    style={{ backgroundColor: selected ? "rgba(255,255,255,0.5)" : t.bg_color }}
                  >
                    {t.icon}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      selected ? "text-white" : "text-stone-700"
                    }`}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
          {typeFilterOptions.length === 0 && (
            <p className="px-1 py-2 text-sm text-stone-500">No types yet.</p>
          )}
        </div>
      </Drawer>

      {viewMode === "list" && (
        <div className="flex flex-col gap-4">
          {loadingPast && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
          {groupOccurrencesByDate(expandEventsForList(filteredEvents)).map(
            ({ date, occurrences }) => (
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
                {occurrences.map((occ) => {
                  const e = occ.event;
                  return (
                    <SwipeableRow
                      key={`${e.id}-${occ.date}`}
                      disabled={e.my_status == null}
                      onSwipeComplete={() => swipeEventStatus(e, "completed")}
                      onSwipeFailed={() => swipeEventStatus(e, "failed")}
                    >
                      {(() => {
                        const info = typeInfo(eventTypes, e.club_id, e.event_type);
                        return (
                          <div className="flex overflow-hidden rounded-2xl shadow-card">
                            {isOverdue(e) ? (
                              <div
                                aria-hidden
                                className="flex w-12 shrink-0 items-center justify-center bg-red-600 text-5xl font-black leading-none text-red-50"
                              >
                                !
                              </div>
                            ) : (
                              <div
                                aria-hidden
                                className="flex w-12 shrink-0 items-center justify-center text-xl"
                                style={{ backgroundColor: info.bg_color }}
                              >
                                {info.icon}
                              </div>
                            )}
                            <button
                              onClick={() => setDrawer(e)}
                              className={`flex min-h-[44px] w-full flex-1 flex-col items-start gap-1 px-4 py-3 text-left ${
                                e.my_status === "failed" ? "bg-red-50" : "bg-white"
                              }`}
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
                                  {e.title}
                                </span>
                                {e.my_status === "completed" && (
                                  <span className="shrink-0 text-green-600">✓</span>
                                )}
                                {e.my_status === "failed" && (
                                  <span className="shrink-0 text-red-600">✗</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge>{info.label}</Badge>
                                <span className="text-xs text-stone-500">
                                  {toDateInput(e.start_date)}
                                  {e.end_date !== e.start_date
                                    ? ` – ${toDateInput(e.end_date)}`
                                    : ""}
                                  {occ.totalDays === 1 || e.daily_times ? (
                                    <>
                                      {e.start_time
                                        ? ` ${toTimeInput(e.start_time)}`
                                        : ""}
                                      {e.end_time ? `–${toTimeInput(e.end_time)}` : ""}
                                    </>
                                  ) : (
                                    <>
                                      {occ.dayIndex === 1 && e.start_time
                                        ? ` from ${toTimeInput(e.start_time)}`
                                        : ""}
                                      {occ.dayIndex === occ.totalDays && e.end_time
                                        ? ` until ${toTimeInput(e.end_time)}`
                                        : ""}
                                    </>
                                  )}
                                  {occ.totalDays > 1
                                    ? ` · Day ${occ.dayIndex} of ${occ.totalDays}`
                                    : ""}
                                </span>
                              </div>
                            </button>
                          </div>
                        );
                      })()}
                    </SwipeableRow>
                  );
                })}
              </div>
            )
          )}
          {filteredEvents.length === 0 && (
            <p className="px-1 py-2 text-sm text-stone-500">
              Nothing scheduled yet.
            </p>
          )}
          {loadingFuture && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
        </div>
      )}

      {viewMode === "month" && (
        <MonthView
          focusedDate={focusedDate}
          setFocusedDate={setFocusedDate}
          events={filteredEvents}
          eventTypes={eventTypes}
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
          eventTypes={eventTypes}
          onOpenEvent={setDrawer}
        />
      )}

      {viewMode === "day" && (
        <DayView
          focusedDate={focusedDate}
          setFocusedDate={setFocusedDate}
          events={filteredEvents}
          eventTypes={eventTypes}
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
          {clubs.length > 1 && (
            <Field label="Club">
              <select
                value={form.club_id ?? ""}
                onChange={(e) => {
                  const newClubId = e.target.value ? Number(e.target.value) : null;
                  const firstType = eventTypes.find((t) => t.club_id === newClubId);
                  setForm({
                    ...form,
                    club_id: newClubId,
                    event_type: firstType?.key ?? form.event_type,
                  });
                }}
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              >
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Type">
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              {eventTypes
                .filter((t) => t.club_id === form.club_id)
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.icon} {t.label}
                  </option>
                ))}
            </select>
          </Field>
          <DateTimeField
            label="Start"
            required
            date={form.start_date}
            time={form.start_time}
            onDateChange={(v) => setForm({ ...form, start_date: v })}
            onTimeChange={(v) => setForm({ ...form, start_time: v })}
          />
          <DateTimeField
            label="End"
            required
            date={form.end_date}
            time={form.end_time}
            onDateChange={(v) => setForm({ ...form, end_date: v })}
            onTimeChange={(v) => setForm({ ...form, end_time: v })}
          />
          {form.start_date && form.end_date && form.start_date !== form.end_date && (
            <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-stone-50 px-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={form.daily_times}
                onChange={(e) =>
                  setForm({ ...form, daily_times: e.target.checked })
                }
              />
              Same start/end time every day (instead of one continuous span)
            </label>
          )}
          <Field label="Location">
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <SingleSelectPicker
            label="Venue"
            placeholder="Search venues..."
            options={venues.map((v) => ({ id: v.id, label: venueLabel(v) }))}
            selectedId={form.venue_id}
            onSelect={(id) => setForm({ ...form, venue_id: id })}
          />
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
          {form.event_type === "kata_performance" && (
            <SingleSelectPicker
              label="Kata"
              placeholder="Search katas..."
              options={katas.map((k) => ({ id: k.id, label: kataLabel(k) }))}
              selectedId={form.kata_id}
              onSelect={(id) =>
                setForm({
                  ...form,
                  kata_id: id,
                  title: id ? katas.find((k) => k.id === id)?.name ?? form.title : form.title,
                })
              }
            />
          )}

          <Field label="Repeats">
            <select
              value={form.repeat_freq}
              onChange={(e) =>
                setForm({
                  ...form,
                  repeat_freq: e.target.value,
                  repeat_weekdays: [],
                  repeat_day_of_month: null,
                })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>

          {form.repeat_freq === "weekly" && (
            <>
              <Field label="Every">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={form.repeat_interval}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        repeat_interval: Number(e.target.value) || 1,
                      })
                    }
                    className="min-h-[44px] w-20 rounded-xl border border-stone-300 px-3"
                  />
                  <span className="text-sm text-stone-600">week(s)</span>
                </div>
              </Field>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-stone-600">
                  Repeat on
                </span>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAY_LABELS.map((label, day) => {
                    const active =
                      form.repeat_weekdays.length > 0
                        ? form.repeat_weekdays.includes(day)
                        : form.start_date && weekdayOf(form.start_date) === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const base =
                            form.repeat_weekdays.length > 0
                              ? form.repeat_weekdays
                              : form.start_date
                                ? [weekdayOf(form.start_date)]
                                : [];
                          const next = base.includes(day)
                            ? base.filter((d) => d !== day)
                            : [...base, day];
                          setForm({ ...form, repeat_weekdays: next });
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
            </>
          )}

          {form.repeat_freq === "monthly" && (
            <Field label="On day of month">
              <input
                type="number"
                min={1}
                max={31}
                placeholder={
                  form.start_date ? String(dayOfMonthOf(form.start_date)) : "1"
                }
                value={form.repeat_day_of_month ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    repeat_day_of_month: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="min-h-[44px] w-20 rounded-xl border border-stone-300 px-3"
              />
            </Field>
          )}

          {form.repeat_freq !== "none" && (
            <>
              <Field label="Ends">
                <select
                  value={form.repeat_end_type}
                  onChange={(e) =>
                    setForm({ ...form, repeat_end_type: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                >
                  <option value="until">On a date</option>
                  <option value="count">After a number of times</option>
                </select>
              </Field>
              {form.repeat_end_type === "until" ? (
                <Field label="Repeat until">
                  <input
                    required
                    type="date"
                    value={form.repeat_until}
                    onChange={(e) =>
                      setForm({ ...form, repeat_until: e.target.value })
                    }
                    className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                  />
                </Field>
              ) : (
                <Field label="Number of occurrences">
                  <input
                    required
                    type="number"
                    min={1}
                    max={60}
                    value={form.repeat_count}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        repeat_count: Number(e.target.value) || 1,
                      })
                    }
                    className="min-h-[44px] w-20 rounded-xl border border-stone-300 px-3"
                  />
                </Field>
              )}
            </>
          )}

          {canPickAthletes && (
            <>
              <GroupQuickAdd
                squads={squads}
                groups={groups}
                onAddAthletes={(ids) =>
                  setFormAthleteIds((prev) => [
                    ...prev,
                    ...ids.filter((id) => !prev.includes(id)),
                  ])
                }
              />
              <AthletePicker
                ids={formAthleteIds}
                options={athletes}
                onAdd={(id) => setFormAthleteIds((prev) => [...prev, id])}
                onRemove={(id) =>
                  setFormAthleteIds((prev) => prev.filter((i) => i !== id))
                }
              />
            </>
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
            venues={venues}
            squads={squads}
            groups={groups}
            eventTypes={eventTypes}
            hasSeries={
              editing.recurrence_id != null &&
              events.filter((e) => e.recurrence_id === editing.recurrence_id)
                .length > 1
            }
            onUpdated={updateEventInList}
            onDeleted={() => deleteEvent(editing.id)}
            onDeletedSeries={() => deleteEventSeries(editing)}
            onDuplicate={(event, athleteIds) => duplicateEvent(event, athleteIds)}
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
  venues,
  squads,
  groups,
  eventTypes,
  hasSeries,
  onUpdated,
  onDeleted,
  onDeletedSeries,
  onDuplicate,
}: {
  eventId: number;
  canPickAthletes: boolean;
  allAthletes: Person[];
  modules: TrainingModule[];
  katas: Kata[];
  venues: Venue[];
  squads: AthleteGroup[];
  groups: AthleteGroup[];
  eventTypes: EventTypeRow[];
  hasSeries: boolean;
  onUpdated: (event: Event) => void;
  onDeleted: () => void;
  onDeletedSeries: () => void;
  onDuplicate: (event: Event, athleteIds: number[]) => void;
}) {
  const api = useApi();
  const { user } = useAuth();
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

  // Recomputes the athlete-facing rollup status the same way the server's
  // attachMyEventStatus does (any failed item -> failed; all items
  // completed -> completed; no items -> the event's own direct status) and
  // pushes it up via onUpdated, so the outer Schedule list's checkbox/badge
  // for this event doesn't go stale after an item- or event-level status
  // edit made here in the detail view.
  function syncMyStatus(currentItems: EventItem[], currentEvent: Event) {
    if (!user || user.role !== "athlete" || !user.athlete_id) return;
    let my_status: CompletionStatus = "pending";
    if (currentItems.length > 0) {
      const statuses = currentItems.map(
        (i) =>
          i.athlete_status.find((s) => s.athlete_id === user.athlete_id)
            ?.status ?? "pending"
      );
      if (statuses.some((s) => s === "failed")) my_status = "failed";
      else if (statuses.every((s) => s === "completed")) my_status = "completed";
    } else {
      my_status =
        currentEvent.athlete_status.find((s) => s.athlete_id === user.athlete_id)
          ?.status ?? "pending";
    }
    onUpdated({ ...currentEvent, my_status });
  }

  function setItemsAndSync(nextItems: EventItem[]) {
    setItems(nextItems);
    if (event) syncMyStatus(nextItems, event);
  }

  async function updateEventAthleteStatus(
    athleteId: number,
    patch: Record<string, unknown>
  ) {
    const { status } = await api.patch<{ status: AthleteStatus }>(
      `/events/${eventId}/athletes/${athleteId}`,
      patch
    );
    setEvent((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        athlete_status: prev.athlete_status.map((s) =>
          s.athlete_id === athleteId ? status : s
        ),
      };
      syncMyStatus(items ?? [], next);
      return next;
    });
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
  const linkedKata =
    event.event_type === "kata_performance" && event.kata_id
      ? katas.find((k) => k.id === event.kata_id)
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
              {eventTypes
                .filter((t) => t.club_id === event.club_id)
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.icon} {t.label}
                  </option>
                ))}
            </select>
          </Field>
          <DateTimeField
            label="Start"
            date={toDateInput(event.start_date)}
            time={toTimeInput(event.start_time)}
            onDateChange={(v) => updateEvent({ start_date: v })}
            onTimeChange={(v) => updateEvent({ start_time: v || null })}
          />
          <DateTimeField
            label="End"
            date={toDateInput(event.end_date)}
            time={toTimeInput(event.end_time)}
            onDateChange={(v) => updateEvent({ end_date: v })}
            onTimeChange={(v) => updateEvent({ end_time: v || null })}
          />
          {toDateInput(event.start_date) !== toDateInput(event.end_date) && (
            <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-stone-50 px-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={event.daily_times}
                onChange={(e) => updateEvent({ daily_times: e.target.checked })}
              />
              Same start/end time every day (instead of one continuous span)
            </label>
          )}
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
          <SingleSelectPicker
            label="Venue"
            placeholder="Search venues..."
            options={venues.map((v) => ({ id: v.id, label: venueLabel(v) }))}
            selectedId={event.venue_id}
            onSelect={(id) => updateEvent({ venue_id: id })}
          />
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
          {event.event_type === "kata_performance" && (
            <SingleSelectPicker
              label="Kata"
              placeholder="Search katas..."
              options={katas.map((k) => ({ id: k.id, label: kataLabel(k) }))}
              selectedId={event.kata_id}
              onSelect={(id) =>
                updateEvent({
                  kata_id: id,
                  ...(id ? { title: katas.find((k) => k.id === id)?.name } : {}),
                })
              }
            />
          )}

          {canPickAthletes && (
            <>
              <GroupQuickAdd
                squads={squads}
                groups={groups}
                onAddAthletes={(ids) =>
                  setAthletes([
                    ...athleteIds,
                    ...ids.filter((id) => !athleteIds.includes(id)),
                  ])
                }
              />
              <AthletePicker
                ids={athleteIds}
                options={allAthletes}
                onAdd={(id) => setAthletes([...athleteIds, id])}
                onRemove={(id) => setAthletes(athleteIds.filter((i) => i !== id))}
              />
            </>
          )}

          <button
            type="button"
            onClick={() => onDuplicate(event, athleteIds)}
            className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
          >
            Duplicate / repeat
          </button>

          {hasSeries && (
            <DeleteButton
              onClick={onDeletedSeries}
              label="Delete series"
              itemLabel={`the whole "${event.title}" series`}
            />
          )}
          <DeleteButton
            onClick={onDeleted}
            label={event.recurrence_id ? "Delete this occurrence" : "Delete"}
            itemLabel={
              event.recurrence_id ? `this occurrence of "${event.title}"` : event.title
            }
          />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Badge>
              {typeInfo(eventTypes, event.club_id, event.event_type).icon}{" "}
              {typeInfo(eventTypes, event.club_id, event.event_type).label}
            </Badge>
            <span className="text-sm text-stone-500">
              {toDateInput(event.start_date)}
              {event.end_date !== event.start_date
                ? ` – ${toDateInput(event.end_date)}`
                : ""}
              {event.start_time ? ` ${toTimeInput(event.start_time)}` : ""}
              {event.end_time ? `–${toTimeInput(event.end_time)}` : ""}
            </span>
          </div>
          {event.venue_id != null &&
            (() => {
              const venue = venues.find((v) => v.id === event.venue_id);
              return venue ? (
                <p className="text-sm text-stone-600">
                  📍 {venue.name}
                  {venue.address ? ` – ${venue.address}` : ""}
                </p>
              ) : null;
            })()}
          {event.location && (
            <p className="text-sm text-stone-600">
              {event.venue_id != null ? "" : "📍 "}
              {event.location}
            </p>
          )}
          {event.notes && <p className="text-stone-700">{event.notes}</p>}

          {linkedModule && <TrainingModuleView module={linkedModule} />}
          {linkedKata && (
            <p className="text-sm text-stone-600">{kataLabel(linkedKata)}</p>
          )}

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

      {event.event_type === "competition" && (
        <EventCompetitionResults
          eventId={eventId}
          athletes={athleteNames}
          defaultName={event.title}
          defaultDate={toDateInput(event.start_date)}
          defaultLocation={event.location ?? ""}
        />
      )}

      <ItemsSection
        eventId={eventId}
        items={items}
        setItems={setItemsAndSync}
        modules={modules}
        katas={katas}
        editable={isEditing}
        eventAthletes={athleteNames}
        eventStartDate={toDateInput(event.start_date)}
        eventEndDate={toDateInput(event.end_date)}
        eventTypes={eventTypes}
        clubId={event.club_id}
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

// A quick shortcut above the plain athlete search picker: tapping a squad
// or group chip bulk-adds every athlete in it (never removes - the
// AthletePicker below still handles individual add/remove/undo).
function GroupQuickAdd({
  squads,
  groups,
  onAddAthletes,
}: {
  squads: AthleteGroup[];
  groups: AthleteGroup[];
  onAddAthletes: (athleteIds: number[]) => void;
}) {
  if (squads.length === 0 && groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2">
      <span className="text-xs font-medium text-stone-600">
        Add a whole squad or group
      </span>
      <div className="flex flex-wrap gap-2">
        {[...squads, ...groups].map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onAddAthletes(g.athlete_ids)}
            className="min-h-[36px] rounded-full border border-stone-300 px-3 text-sm font-medium text-stone-700"
          >
            + {g.name} ({g.club_name})
          </button>
        ))}
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
  eventTypes,
  onGoToDay,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  eventTypes: EventTypeRow[];
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
                    {typeInfo(eventTypes, e.club_id, e.event_type).icon}
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
  eventTypes,
  onOpenEvent,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  eventTypes: EventTypeRow[];
  onOpenEvent: (event: Event) => void;
}) {
  const weekStart = startOfWeek(focusedDate);
  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));

  function timedEventsFor(date: string) {
    return events.filter((e) => isTimedOnDate(e, date));
  }

  function allDayEventsFor(date: string) {
    return events.filter((e) => eventOverlapsDate(e, date) && !isTimedOnDate(e, date));
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
              {allDay.slice(0, 2).map((e) => {
                const info = typeInfo(eventTypes, e.club_id, e.event_type);
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenEvent(e)}
                    className={`truncate rounded px-1 py-0.5 text-left text-[10px] ${
                      e.my_status === "failed" ? "bg-red-50" : "bg-stone-100"
                    }`}
                    title={e.title}
                  >
                    {info.icon} {e.title}
                  </button>
                );
              })}
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
                const info = typeInfo(eventTypes, e.club_id, e.event_type);
                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenEvent(e)}
                    className={`absolute inset-x-0.5 overflow-hidden rounded border-l-4 px-1 text-left text-[10px] ${
                      e.my_status === "failed"
                        ? "bg-red-50 text-red-800"
                        : "bg-white text-stone-700"
                    }`}
                    style={{ top, height, borderLeftColor: info.bg_color }}
                  >
                    {info.icon} {e.title}
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
  eventTypes,
  onOpenEvent,
  onReschedule,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  eventTypes: EventTypeRow[];
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

  const timedEvents = events.filter((e) => isTimedOnDate(e, focusedDate));
  const allDayEvents = events.filter(
    (e) => eventOverlapsDate(e, focusedDate) && !isTimedOnDate(e, focusedDate)
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
          {allDayEvents.map((e) => {
            const info = typeInfo(eventTypes, e.club_id, e.event_type);
            return (
              <button
                key={e.id}
                onClick={() => onOpenEvent(e)}
                className={`flex min-h-[36px] items-center gap-2 rounded-xl px-3 text-left text-sm ${
                  e.my_status === "failed" ? "bg-red-50" : "bg-stone-100"
                }`}
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{ backgroundColor: info.bg_color }}
                >
                  {info.icon}
                </span>
                <span className="truncate">{e.title}</span>
              </button>
            );
          })}
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
            const info = typeInfo(eventTypes, e.club_id, e.event_type);
            const overdue = isOverdue(e);
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
                className={`absolute inset-x-1 flex cursor-grab overflow-hidden rounded-xl shadow-card active:cursor-grabbing ${
                  isDragging ? "z-10 ring-2 ring-stone-400" : ""
                } ${e.my_status === "failed" ? "bg-red-50" : "bg-white"}`}
                style={{ top, height, touchAction: "none" }}
              >
                {overdue ? (
                  <div
                    aria-hidden
                    className="flex w-6 shrink-0 items-center justify-center bg-red-600 text-base font-black leading-none text-red-50"
                  >
                    !
                  </div>
                ) : (
                  <div
                    aria-hidden
                    className="flex w-6 shrink-0 items-center justify-center text-xs"
                    style={{ backgroundColor: info.bg_color }}
                  >
                    {info.icon}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-0.5 text-left">
                  <span className="truncate text-xs font-medium text-stone-800">
                    {e.title}
                  </span>
                  <span className="text-[10px] text-stone-500">
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

function dayOfMonthOf(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDate();
}

function kataLabel(k: Kata) {
  const label = k.wkf_number != null ? `${k.wkf_number}. ${k.name}` : k.name;
  return k.style ? `${label} (${k.style})` : label;
}

function venueLabel(v: Venue) {
  return v.club_name ? `${v.name} (${v.club_name})` : v.name;
}

const SWIPE_THRESHOLD = 64;
const DISABLED_SWIPE_MAX = 180;

// Wraps a row with horizontal swipe-to-flag: swipe left calls onSwipeComplete,
// swipe right calls onSwipeFailed. Pointer events (not HTML5 drag-and-drop)
// so it works on touch, same approach as the Day view's drag-to-move. When
// `disabled` (coaches/admins can't swipe someone else's status), dragging
// still tracks and reveals `disabledMessage` behind the row instead of the
// ✓/✗ hint, growing with drag distance so the message can be read - but
// releasing never fires onSwipeComplete/onSwipeFailed.
function SwipeableRow({
  children,
  onSwipeComplete,
  onSwipeFailed,
  disabled,
  disabledMessage = "Only athletes can swipe",
  className,
}: {
  children: ReactNode;
  onSwipeComplete: () => void;
  onSwipeFailed: () => void;
  disabled?: boolean;
  disabledMessage?: string;
  className?: string;
}) {
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const draggedRef = useRef(false);

  function onPointerDown(e: ReactPointerEvent) {
    startXRef.current = e.clientX;
    draggedRef.current = false;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (startXRef.current == null) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > 8) draggedRef.current = true;
    setDragX(
      disabled
        ? Math.max(-DISABLED_SWIPE_MAX, Math.min(DISABLED_SWIPE_MAX, delta))
        : delta
    );
  }

  function onPointerUp() {
    if (startXRef.current == null) return;
    if (!disabled) {
      if (dragX <= -SWIPE_THRESHOLD) onSwipeComplete();
      else if (dragX >= SWIPE_THRESHOLD) onSwipeFailed();
    }
    setDragX(0);
    startXRef.current = null;
  }

  const hintWidth = disabled ? Math.abs(dragX) : SWIPE_THRESHOLD;
  const hintOpacity = disabled
    ? Math.min(1, Math.abs(dragX) / 40)
    : Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className ?? ""}`}>
      {/* Positioned on the side the slide actually exposes: dragging left
          (dragX<0) slides content left, uncovering the row's right edge, so
          the ✓/complete hint - the action that fires for dragX<0 - lives at
          right-0 (and vice versa for ✗/failed at left-0). */}
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center overflow-hidden px-2 text-center text-xs font-medium ${
          disabled ? "bg-stone-200 text-stone-600" : "bg-green-100 text-green-700"
        }`}
        style={{ opacity: dragX < 0 ? hintOpacity : 0, width: hintWidth }}
      >
        {disabled ? disabledMessage : "✓"}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center overflow-hidden px-2 text-center text-xs font-medium ${
          disabled ? "bg-stone-200 text-stone-600" : "bg-red-100 text-red-700"
        }`}
        style={{ opacity: dragX > 0 ? hintOpacity : 0, width: hintWidth }}
      >
        {disabled ? disabledMessage : "✗"}
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
              <Link
                to={`/athletes/${s.athlete_id}/profile`}
                className={
                  s.status === "completed"
                    ? "line-through text-stone-400"
                    : s.status === "failed"
                    ? "text-red-700"
                    : "underline decoration-dotted underline-offset-2"
                }
              >
                {athlete ? `${athlete.first_name} ${athlete.last_name}` : "Athlete"}
              </Link>
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
  eventStartDate,
  eventEndDate,
  eventTypes,
  clubId,
}: {
  eventId: number;
  items: EventItem[];
  setItems: (items: EventItem[]) => void;
  modules: TrainingModule[];
  katas: Kata[];
  editable: boolean;
  eventAthletes: Person[];
  eventStartDate: string;
  eventEndDate: string;
  eventTypes: EventTypeRow[];
  clubId: number | null;
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
        interval: addForm.repeat_interval || 1,
        weekdays:
          addForm.repeat_freq === "weekly"
            ? addForm.repeat_weekdays.length > 0
              ? addForm.repeat_weekdays
              : [weekdayOf(addForm.item_date)]
            : undefined,
        day_of_month:
          addForm.repeat_freq === "monthly"
            ? addForm.repeat_day_of_month || dayOfMonthOf(addForm.item_date)
            : undefined,
        end:
          addForm.repeat_end_type === "count"
            ? { type: "count", count: addForm.repeat_count || 1 }
            : { type: "until", date: addForm.repeat_until },
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

  async function deleteSeries(item: EventItem) {
    const { deleted_ids } = await api.del<{ deleted_ids: number[] }>(
      `/events/${eventId}/items/${item.id}/series`
    );
    const deletedSet = new Set(deleted_ids);
    setItems(items.filter((i) => !deletedSet.has(i.id)));
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
      repeat_interval: 1,
      repeat_weekdays: [],
      repeat_day_of_month: null,
      repeat_end_type: "until",
      repeat_until: "",
      repeat_count: 4,
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
              <div
                className={`rounded-xl border ${
                  myEffectiveStatus === "completed"
                    ? "border-green-200 bg-green-50"
                    : myEffectiveStatus === "failed"
                    ? "border-red-200 bg-red-50"
                    : "border-stone-200 bg-white"
                }`}
              >
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
                        <Badge>{typeInfo(eventTypes, clubId, item.item_type).label}</Badge>
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
                      {eventTypes
                        .filter((t) => t.club_id === clubId)
                        .map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.icon} {t.label}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <DateTimeField
                    label="Start"
                    required
                    date={toDateInput(item.item_date)}
                    time={toTimeInput(item.start_time)}
                    min={eventStartDate}
                    max={eventEndDate}
                    onDateChange={(v) => updateItem(item.id, { item_date: v })}
                    onTimeChange={(v) => {
                      if (v) updateItem(item.id, { start_time: v });
                    }}
                  />
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
                  {item.recurrence_id &&
                    items.filter((i) => i.recurrence_id === item.recurrence_id)
                      .length > 1 && (
                      <DeleteButton
                        onClick={() => deleteSeries(item)}
                        label="Delete series"
                        itemLabel={`the whole "${item.title}" series (${
                          items.filter(
                            (i) => i.recurrence_id === item.recurrence_id
                          ).length
                        } items)`}
                      />
                    )}
                  <DeleteButton
                    onClick={() => deleteItem(item.id)}
                    label={item.recurrence_id ? "Delete this occurrence" : "Delete"}
                    itemLabel={
                      item.recurrence_id
                        ? `this occurrence of "${item.title}"`
                        : item.title
                    }
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
              {expanded && item.item_type === "competition" && (
                <EventCompetitionResults
                  eventId={eventId}
                  eventItemId={item.id}
                  athletes={eventAthletes}
                  defaultName={item.title}
                  defaultDate={toDateInput(item.item_date)}
                  defaultLocation=""
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
              {eventTypes
                .filter((t) => t.club_id === clubId)
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.icon} {t.label}
                  </option>
                ))}
            </select>
          </Field>
          <DateTimeField
            label="Start"
            required
            date={addForm.item_date}
            time={addForm.start_time}
            min={eventStartDate}
            max={eventEndDate}
            onDateChange={(v) => setAddForm({ ...addForm, item_date: v })}
            onTimeChange={(v) => setAddForm({ ...addForm, start_time: v })}
          />
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
                  repeat_day_of_month: null,
                })
              }
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>

          {addForm.repeat_freq === "weekly" && (
            <>
              <Field label="Every">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={addForm.repeat_interval}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        repeat_interval: Number(e.target.value) || 1,
                      })
                    }
                    className="min-h-[44px] w-20 rounded-xl border border-stone-300 px-3"
                  />
                  <span className="text-sm text-stone-600">week(s)</span>
                </div>
              </Field>
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
            </>
          )}

          {addForm.repeat_freq === "monthly" && (
            <Field label="On day of month">
              <input
                type="number"
                min={1}
                max={31}
                placeholder={
                  addForm.item_date
                    ? String(dayOfMonthOf(addForm.item_date))
                    : "1"
                }
                value={addForm.repeat_day_of_month ?? ""}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    repeat_day_of_month: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="min-h-[44px] w-20 rounded-xl border border-stone-300 px-3"
              />
            </Field>
          )}

          {addForm.repeat_freq !== "none" && (
            <>
              <Field label="Ends">
                <select
                  value={addForm.repeat_end_type}
                  onChange={(e) =>
                    setAddForm({ ...addForm, repeat_end_type: e.target.value })
                  }
                  className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                >
                  <option value="until">On a date</option>
                  <option value="count">After a number of times</option>
                </select>
              </Field>
              {addForm.repeat_end_type === "until" ? (
                <Field label="Repeat until">
                  <input
                    required
                    type="date"
                    min={eventStartDate}
                    max={eventEndDate}
                    value={addForm.repeat_until}
                    onChange={(e) =>
                      setAddForm({ ...addForm, repeat_until: e.target.value })
                    }
                    className="min-h-[44px] rounded-xl border border-stone-300 px-3"
                  />
                </Field>
              ) : (
                <Field label="Number of occurrences">
                  <input
                    required
                    type="number"
                    min={1}
                    max={60}
                    value={addForm.repeat_count}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        repeat_count: Number(e.target.value) || 1,
                      })
                    }
                    className="min-h-[44px] w-20 rounded-xl border border-stone-300 px-3"
                  />
                </Field>
              )}
            </>
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
          onClick={() => {
            const start = splitLocalDateTime(new Date());
            const end = nowPlusHours(2);
            const itemDate =
              start.date < eventStartDate
                ? eventStartDate
                : start.date > eventEndDate
                  ? eventEndDate
                  : start.date;
            setAddForm({
              ...EMPTY_ITEM_FORM,
              item_date: itemDate,
              start_time: start.time,
              end_time: end.time,
            });
            setAdding(true);
          }}
          className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
        >
          + Add itinerary item
        </button>
      ))}
    </div>
  );
}
