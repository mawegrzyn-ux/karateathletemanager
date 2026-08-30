import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Link } from "react-router-dom";
import { ApiError, useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import {
  Spinner,
  Drawer,
  AddButton,
  DeleteButton,
  Field,
  Badge,
  DateTimeField,
  DateTimeRangeField,
  DurationDial,
  MediaField,
  Modal,
  Toast,
  TypeIcon,
  uploadFile,
  SwipeableRow,
  SWIPE_THRESHOLD,
  DEEP_SWIPE_THRESHOLD,
} from "../components/ui";
import {
  TrainingModuleView,
  TrainingModuleItemDetail,
  moduleIcon,
  itemSummary,
  type TrainingModule,
} from "../components/TrainingModuleView";
import { EventCompetitionResults } from "../components/CompetitionResults";
import type { Post } from "../components/AthleteSocialProfile";
import { todayStr, addDaysStr, dateLabel, groupByDate } from "../utils/dates";
import { feedbackTick, feedbackConfirm } from "../utils/feedback";
import { loadCachedSchedule, mergeIntoCachedSchedule } from "../utils/offlineSchedule";

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
  icon: string | null;
  athlete_status: AthleteStatus[];
  my_status: CompletionStatus | null;
  my_result_place: string | null;
  has_media: boolean;
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
  training_module_item_id: number | null;
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
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
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
  icon_url: string | null;
  bg_color: string;
  is_standard: boolean;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Shared stroke-icon wrapper for the header's nav icons (view-mode
// switcher, search, filter) - no matching Unicode emoji exists for
// "list view"/"day view"/etc., so these are hand-rolled inline SVGs
// rather than an icon library, kept to this one small, single-use set.
function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const VIEW_MODE_ICONS: Record<"list" | "day" | "week" | "month", ReactNode> = {
  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  day: <rect x="4" y="4" width="16" height="16" rx="2" />,
  week: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </>
  ),
  month: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
};

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
    icon_url: match?.icon_url ?? null,
    bg_color: match?.bg_color ?? "#78716c",
  };
}

// The icon a schedule entry would show if it had no icon override of its
// own: a training event linked to a training module inherits that
// module's icon (which itself falls back to its training module type's
// icon, see moduleIcon()), otherwise it's the shared event type icon.
function inheritedIcon(
  eventTypes: EventTypeRow[],
  modules: TrainingModule[],
  clubId: number | null,
  eventType: string,
  trainingModuleId: number | null
) {
  if (trainingModuleId) {
    const inherited = moduleIcon(
      modules.find((m) => m.id === trainingModuleId) ?? { icon: null, type_icon: null }
    );
    if (inherited) return inherited;
  }
  return typeInfo(eventTypes, clubId, eventType).icon;
}

// Same as typeInfo, but resolves the icon through the full inheritance
// chain: a per-event custom icon override (event.icon) always wins, then
// the linked training module's own icon, otherwise the plain event type.
// icon_url only ever comes from that last, type-level fallback - an
// event-level override and a training module's own icon are always a
// plain emoji string, with no image concept of their own.
function eventTypeInfo(eventTypes: EventTypeRow[], event: Event, modules: TrainingModule[]) {
  const info = typeInfo(eventTypes, event.club_id, event.event_type);
  if (event.icon) {
    return { ...info, icon: event.icon, icon_url: null };
  }
  if (event.training_module_id) {
    const module = modules.find((m) => m.id === event.training_module_id);
    const inherited = module ? moduleIcon(module) : null;
    if (inherited) return { ...info, icon: inherited, icon_url: null };
  }
  return info;
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
  icon: "",
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
  training_module_item_id: null as number | null,
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

// The event detail view's own "when" line - "from X to Y" reads more
// naturally than the compact "date1 – date2 time1–time2" the List view's
// tile squeezes into a badge row, since this one has a full line to itself
// and is meant to be the most prominent thing under the title.
function eventWhenLabel(event: Pick<Event, "start_date" | "end_date" | "start_time" | "end_time">) {
  const sameDay = event.end_date === event.start_date;
  const datePart = sameDay
    ? toDateInput(event.start_date)
    : `${toDateInput(event.start_date)} – ${toDateInput(event.end_date)}`;
  const start = event.start_time ? toTimeInput(event.start_time) : null;
  // A same-instant start/end (e.g. a kata performance logged as one
  // point in time rather than a span) isn't a real range - "from 09:00
  // to 09:00" - so it's dropped here and falls through to "from start"
  // below, same as if no end_time were set at all.
  const end =
    event.end_time && event.end_time !== event.start_time
      ? toTimeInput(event.end_time)
      : null;
  if (start && end) return `${datePart}, from ${start} to ${end}`;
  if (start) return `${datePart}, from ${start}`;
  if (end) return `${datePart}, until ${end}`;
  return datePart;
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

// Untimed occurrences (an all-day event, or a later day of a continuous
// multi-day span with no daily_times - matching isTimedOnDate's own
// definition of "has a real time to show") sort before every timed one,
// using -1 as a sentinel below any real minute-of-day value; timed
// occurrences on the same day then sort by their actual start_time.
function occurrenceSortKey(o: EventOccurrence): number {
  if (!isTimedOnDate(o.event, o.date)) return -1;
  return timeToMinutes(o.event.start_time) ?? -1;
}

function groupOccurrencesByDate(occurrences: EventOccurrence[]) {
  return groupByDate(occurrences, (o) => o.date).map(({ date, items }) => ({
    date,
    occurrences: [...items].sort((a, b) => occurrenceSortKey(a) - occurrenceSortKey(b)),
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

// Drives the "jump to today" scroll ourselves (repeatedly assigning
// scrollTop across a rAF loop) instead of Element.scrollIntoView({behavior:
// "smooth"}) - that native API has long-standing WebKit/iOS Safari bugs
// where it silently no-ops or gets fought by in-progress momentum
// scrolling, which is exactly the "arrow does nothing" failure mode this
// replaces. Resolves once the animation completes so the caller knows
// precisely when it's safe to resume lazy-loading, rather than having to
// guess from scroll-idle heuristics.
function animateScrollTop(
  container: HTMLElement,
  targetTop: number,
  duration = 450
): Promise<void> {
  const startTop = container.scrollTop;
  const delta = targetTop - startTop;
  if (Math.abs(delta) < 1) {
    container.scrollTop = targetTop;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const startTime = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      container.scrollTop = startTop + delta * eased;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
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

// The duration-dial pair for CreateEventWizard's End field: how many
// minutes apart two date+time pairs are, and the reverse - a date+time
// this many minutes after another - so dragging the dial can round-trip
// through form.end_date/end_time without the caller doing its own day-
// rollover math.
function minutesBetweenDateTime(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string
) {
  const startMin = timeToMinutes(startTime) ?? 0;
  const endMin = timeToMinutes(endTime) ?? startMin;
  const dayDelta = Math.round(
    (new Date(`${endDate}T00:00:00Z`).getTime() -
      new Date(`${startDate}T00:00:00Z`).getTime()) /
      86400000
  );
  return dayDelta * 24 * 60 + (endMin - startMin);
}

function addMinutesToDateTime(dateStr: string, timeStr: string, minutesToAdd: number) {
  const base = (timeToMinutes(timeStr) ?? 0) + minutesToAdd;
  const dayDelta = Math.floor(base / (24 * 60));
  const clockMinutes = ((base % (24 * 60)) + 24 * 60) % (24 * 60);
  return { date: addDaysStr(dateStr, dayDelta), time: minutesToTime(clockMinutes) };
}

function formatDuration(minutes: number) {
  const mins = Math.max(0, Math.round(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const HOUR_HEIGHT = 56;
// Week view lays days out as rows and hours as columns (transposed from Day
// view's vertical timeline), so it needs its own per-hour width and
// per-day row height rather than reusing HOUR_HEIGHT.
const WEEK_HOUR_WIDTH = 72;
const WEEK_DAY_ROW_HEIGHT = 64;
const WEEK_LABEL_COL_WIDTH = 96;
const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 10;
const GRID_HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i
);

// The list view initially loads a week either side of today (rather than
// the whole schedule), then lazy-loads another 2 weeks in whichever
// direction the user scrolls toward, capped a year out either way so an
// empty schedule can't make the observer fetch forever. Since today now
// has real content above it, the initial scroll position is explicitly
// jumped to today right after this first load (see the initialScrollRef
// effect below) rather than just relying on today being the first item.
const INITIAL_WINDOW_PAST_DAYS = 7;
const INITIAL_WINDOW_FUTURE_DAYS = 7;
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
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [offline, setOffline] = useState(false);
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
  const [hideCompleted, setHideCompleted] = useState(false);
  const [typeFilterDrawerOpen, setTypeFilterDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawer, setDrawer] = useState<"closed" | "create" | Event>("closed");
  const [programEnrollOpen, setProgramEnrollOpen] = useState(false);
  const [resultDrawerEvent, setResultDrawerEvent] = useState<Event | null>(
    null
  );
  const [quickPost, setQuickPost] = useState<
    { event: Event; typeLabel: string } | null
  >(null);
  const [captureEvent, setCaptureEvent] = useState<Event | null>(null);
  const [galleryEvent, setGalleryEvent] = useState<Event | null>(null);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formAthleteIds, setFormAthleteIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "day" | "week" | "month">(
    "list"
  );
  const [focusedDate, setFocusedDate] = useState(todayStr());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadedFromRef = useRef(addDaysStr(todayStr(), -INITIAL_WINDOW_PAST_DAYS));
  const loadedToRef = useRef(addDaysStr(todayStr(), INITIAL_WINDOW_FUTURE_DAYS));
  const initialScrollRef = useRef(false);
  const loadingPastRef = useRef(false);
  const loadingFutureRef = useRef(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const suppressLazyLoadRef = useRef(false);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (events ?? []).filter((e) => {
      const matchesQuery = `${e.title} ${
        typeInfo(eventTypes, e.club_id, e.event_type).label
      }`
        .toLowerCase()
        .includes(q);
      const matchesType = typeFilters.size === 0 || typeFilters.has(e.event_type);
      const matchesCompletion = !hideCompleted || e.my_status !== "completed";
      return matchesQuery && matchesType && matchesCompletion;
    });
  }, [events, query, typeFilters, hideCompleted, eventTypes]);

  const typeFilterOptions = useMemo(() => {
    const seen = new Map<
      string,
      { label: string; icon: string; icon_url: string | null; bg_color: string }
    >();
    for (const e of events ?? []) {
      if (!seen.has(e.event_type)) {
        const info = typeInfo(eventTypes, e.club_id, e.event_type);
        seen.set(e.event_type, {
          label: info.label,
          icon: info.icon,
          icon_url: info.icon_url,
          bg_color: info.bg_color,
        });
      }
    }
    return [...seen.entries()]
      .map(([key, info]) => ({ key, ...info }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events, eventTypes]);

  // Drives the filter icon's badge count - every active filter (types
  // selected, plus the hide-completed toggle) counts as one, matching how
  // many taps it'd take to clear everything back to the default view.
  const activeFilterCount = typeFilters.size + (hideCompleted ? 1 : 0);

  function toggleTypeFilter(key: string) {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const scrollAnimationIdRef = useRef(0);

  // The section's scroll-mt-[190px] (below) keeps the sticky search/filter
  // header from covering the target when the browser itself drives the
  // scroll (e.g. focus scrolling); doing it manually here needs the same
  // offset applied by hand since a raw scrollTop assignment doesn't consult
  // CSS scroll-margin.
  const STICKY_HEADER_OFFSET = 190;

  function scrollToToday(behavior: ScrollBehavior = "smooth") {
    const today = todayStr();
    const groups = groupOccurrencesByDate(expandEventsForList(filteredEvents));
    const target =
      groups.find((g) => g.date >= today) ?? groups[groups.length - 1];
    const el = target && sectionRefs.current[target.date];
    const container = document.querySelector("main");
    if (!el || !container) return;

    const targetTop = Math.max(
      0,
      Math.min(
        container.scrollTop +
          (el.getBoundingClientRect().top - container.getBoundingClientRect().top) -
          STICKY_HEADER_OFFSET,
        container.scrollHeight - container.clientHeight
      )
    );

    if (behavior === "auto") {
      container.scrollTop = targetTop;
      return;
    }

    // Jumping back to today from far in the future has to scroll back past
    // the near-top lazy-load threshold on the way there; without this guard
    // that fires loadMorePast() mid-animation, prepending more days above
    // and throwing off where the in-progress scroll actually lands. Cleared
    // as soon as our own animation (below) reports it's finished, rather
    // than guessing from scroll-idle heuristics.
    const animationId = ++scrollAnimationIdRef.current;
    suppressLazyLoadRef.current = true;
    animateScrollTop(container, targetTop).then(() => {
      if (scrollAnimationIdRef.current === animationId) {
        suppressLazyLoadRef.current = false;
      }
    });
  }

  useEffect(() => {
    load();
    // Retries automatically once connectivity returns, so the offline
    // banner below clears itself instead of needing a manual reload.
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Now that the initial load window spans a week either side of today
  // instead of starting exactly at today, the first render would
  // otherwise land scrolled to the top of that window (a week in the
  // past) rather than on today. Jumps to today once, right after the
  // first successful load, without the scroll animation (behavior
  // "auto") since this is establishing the starting position, not
  // responding to a user action. Landing on today after only a week of
  // past content is often within the near-top lazy-load threshold, so
  // this suppresses loadMorePast the same way an animated jump does -
  // otherwise the resulting scroll event would immediately fetch
  // another 2 weeks into the past right on load, silently blowing past
  // the intended -7/+7 starting window.
  useEffect(() => {
    if (viewMode !== "list" || initialScrollRef.current || !events) return;
    initialScrollRef.current = true;
    suppressLazyLoadRef.current = true;
    scrollToToday("auto");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressLazyLoadRef.current = false;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, viewMode]);

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

    function onScroll() {
      if (!container) return;
      // Still mid-jump from scrollToToday's own animation - it clears this
      // flag itself the instant that animation finishes, so there's no
      // timing to guess here.
      if (suppressLazyLoadRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop < 150) loadMorePast();
      if (scrollHeight - scrollTop - clientHeight < 150) loadMoreFuture();
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
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
      mergeIntoCachedSchedule(res.events);
      loadedFromRef.current = from;
      feedbackTick(500);
    } catch {
      // leave the window as-is; the next scroll near the edge retries -
      // but if there's anything already cached for this range, show it in
      // the meantime rather than leaving the list stuck at its old edge.
      const cached = loadCachedSchedule<Event>().filter(
        (e) => e.end_date >= from && e.start_date <= to
      );
      if (cached.length > 0) {
        setEvents((prev) => mergeEvents(prev, cached));
        setOffline(true);
      }
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
      mergeIntoCachedSchedule(res.events);
      loadedToRef.current = to;
      feedbackTick(500);
    } catch {
      // leave the window as-is; the next scroll near the edge retries -
      // but if there's anything already cached for this range, show it in
      // the meantime rather than leaving the list stuck at its old edge.
      const cached = loadCachedSchedule<Event>().filter(
        (e) => e.end_date >= from && e.start_date <= to
      );
      if (cached.length > 0) {
        setEvents((prev) => mergeEvents(prev, cached));
        setOffline(true);
      }
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
      .then((res) => {
        setEvents(res.events);
        setError(null);
        setOffline(false);
        mergeIntoCachedSchedule(res.events);
      })
      .catch(() => {
        // No network (or the request otherwise failed) - fall back to
        // whatever's already been seen and cached locally for this same
        // window, rather than blanking the whole page. Only a genuine
        // first-ever load with nothing cached yet shows the error page.
        const cached = loadCachedSchedule<Event>().filter(
          (e) =>
            e.end_date >= loadedFromRef.current && e.start_date <= loadedToRef.current
        );
        if (cached.length > 0) {
          setEvents(cached);
          setOffline(true);
        } else {
          setError("Failed to load schedule");
        }
      });

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
    setForm({
      ...EMPTY_FORM,
      club_id: clubs[0]?.id ?? null,
      start_date: start.date,
      start_time: start.time,
      // Ends default to exactly the start (a point-in-time event) rather
      // than an arbitrary +2h span - CreateEventWizard's datetime stage
      // keeps them mirrored to start_date/start_time as the user edits
      // those, until the user diverges the end fields themselves.
      end_date: start.date,
      end_time: start.time,
    });
    setFormAthleteIds([]);
    setDrawer("create");
  }

  async function createEvent() {
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
      icon: event.icon ?? "",
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
      {offline && (
        <div className="-mx-4 -mt-4 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
          Offline — showing saved schedule
        </div>
      )}
      <div
        className={`sticky top-0 z-10 -mx-4 flex flex-col bg-white/95 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_20px_-6px_rgba(28,25,23,0.10)] backdrop-blur ${
          offline ? "" : "-mt-4"
        }`}
      >
        {/* Same bg-white/95 + backdrop-blur treatment as the bottom tab nav
            in App.tsx (rather than the page's plain bg-stone-100), with a
            matching shadow - the nav's is signed negative (0_-1px.../
            0_-8px...) since its shadow falls upward above a bottom bar;
            this one flips both to positive since it falls downward below a
            top bar. Edge-to-edge and flush with the very top of the scroll
            area (no pt-4 above it) and no bottom padding on this container
            either, so the red wedge's own row IS the header's full height -
            a trailing pb-2 here used to leave a sliver of white beneath the
            wedge that broke up the red into two visually disconnected
            blocks. The SCHEDULE wedge is a permanent brand label (not a
            selectable tab, unlike List/Day/Week/Month next to it), styled
            the same slanted-parallelogram way the tab strip used to style
            whichever tab was active - now an emoji instead of text, matching
            the icon-only treatment applied to every other label in this bar
            (see VIEW_MODE_ICONS above: no Unicode emoji distinguishes "day"
            from "week" from "month" cleanly, so those are hand-rolled SVGs
            instead). Search reverted back out of the filter drawer to its
            own slide-down row (see below) after a "one U-turn" - the search
            icon toggles it rather than search living inline in the bar
            itself, keeping the bar's tab row from getting cramped. */}
        <div className="flex items-stretch">
          <div
            className="flex shrink-0 items-center bg-red-600 pl-4 pr-5 text-lg text-white"
            style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
          >
            <span aria-hidden>📅</span>
            <span className="sr-only">Schedule</span>
          </div>
          <div className="flex flex-1 items-center gap-1 overflow-x-auto px-2">
            {(["list", "day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-label={`${mode} view`}
                className={`flex min-h-[44px] shrink-0 items-center justify-center rounded-lg px-2.5 transition-colors ${
                  viewMode === mode ? "bg-stone-100 text-stone-900" : "text-stone-400"
                }`}
              >
                <NavIcon>{VIEW_MODE_ICONS[mode]}</NavIcon>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search"
            className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center ${
              searchOpen ? "text-red-600" : "text-stone-600"
            }`}
          >
            <NavIcon>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </NavIcon>
          </button>
          <button
            type="button"
            onClick={() => setTypeFilterDrawerOpen(true)}
            aria-label="Filter"
            className="relative flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center pr-3 text-stone-600"
          >
            <NavIcon>
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </NavIcon>
            {activeFilterCount > 0 && (
              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Slides down/up via a CSS grid-template-rows transition (0fr <->
            1fr) rather than animating height directly, which can't animate
            to/from "auto" - the classic grid-accordion trick, so no JS
            height measurement needed. */}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            searchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-2 pt-1">
              <input
                autoFocus={searchOpen}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search schedule..."
                className="min-h-[44px] w-full rounded-xl border border-stone-300 px-3"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Floating "+" replaces the old header-row AddButton now that the
          top bar's right edge is taken by the filter icon - bottom-left
          (opposite the list view's "Jump to today" FAB on the right) so
          they never overlap. The bottom offset adds env(safe-area-inset-
          bottom) on top of the base 6rem clearance - the bottom nav's own
          tabs reserve that same inset for the iPhone home indicator, so
          without matching it here the FAB would sit too low and collide
          with the (taller, on iPhone) nav. */}
      <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-20">
        <AddButton onClick={openCreate} />
      </div>

      <EnrollInProgramDrawer
        open={programEnrollOpen}
        onClose={() => setProgramEnrollOpen(false)}
        canPickAthletes={canPickAthletes}
        athletes={athletes}
      />

      <Drawer
        open={typeFilterDrawerOpen}
        onClose={() => setTypeFilterDrawerOpen(false)}
        title="Filter schedule"
      >
        <div className="flex flex-col gap-4">
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-stone-50 px-3 text-sm font-medium text-stone-700">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
            />
            Hide completed
          </label>
          {typeFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilters(new Set())}
              className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700"
            >
              Clear type filters
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
                    <TypeIcon icon={t.icon} iconUrl={t.icon_url} size={20} />
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
        <button
          type="button"
          onClick={() => setTypeFilterDrawerOpen(false)}
          aria-label="Close filters"
          className="fixed bottom-6 left-6 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-red-600 text-lg text-white shadow-lg"
        >
          ↩
        </button>
      </Drawer>

      {viewMode === "list" && (
        <div className="flex flex-col gap-4">
          {loadingPast && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
          {groupOccurrencesByDate(expandEventsForList(filteredEvents)).map(
            ({ date, occurrences }) => {
              const isToday = date === todayStr();
              return (
              <div
                key={date}
                ref={(el) => {
                  sectionRefs.current[date] = el;
                }}
                className="flex scroll-mt-[190px] flex-col gap-2"
              >
                <h2
                  className={
                    isToday
                      ? "inline-flex w-fit items-center rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-semibold text-white shadow-sm"
                      : "text-sm font-semibold text-stone-500"
                  }
                >
                  {dateLabel(date)}
                </h2>
                {occurrences.map((occ) => {
                  const e = occ.event;
                  const info = eventTypeInfo(eventTypes, e, modules);
                  const showTrophy =
                    e.event_type === "competition" && e.my_result_place;
                  // filter: drop-shadow (not box-shadow) since these
                  // segments are clip-path'd into chevrons - box-shadow
                  // draws outside the box and gets clipped away with it,
                  // while drop-shadow follows the actual painted
                  // (post-clip) shape.
                  const sideShadow = "drop-shadow(0 2px 2px rgba(28,25,23,0.35))";
                  // A stronger, deeper shadow than the left icon segment's -
                  // the result segment needs to read as the more prominent
                  // of the two end caps, since it's the one carrying the
                  // pass/fail/trophy signal.
                  const resultShadow = "drop-shadow(0 3px 3px rgba(20,20,18,0.45))";
                  const isCompetition = e.event_type === "competition";
                  const leftOptions = [
                    {
                      label: "✓ Completed",
                      onTrigger: () => swipeEventStatus(e, "completed"),
                    },
                    {
                      label: "✗ Failed",
                      onTrigger: () => swipeEventStatus(e, "failed"),
                    },
                  ];
                  const addPostAction = {
                    label: "📝 Add post",
                    onTrigger: () =>
                      setQuickPost({ event: e, typeLabel: info.label }),
                  };
                  const deepLeftOptions = isCompetition
                    ? [
                        {
                          label: "🏆 Record result",
                          onTrigger: () => setResultDrawerEvent(e),
                        },
                        addPostAction,
                      ]
                    : [addPostAction];
                  const captureAction = {
                    label: "📷 Capture",
                    onTrigger: () => setCaptureEvent(e),
                  };
                  const galleryAction = {
                    label: "🖼 Gallery",
                    onTrigger: () => setGalleryEvent(e),
                  };
                  return (
                    <SwipeableRow
                      key={`${e.id}-${occ.date}`}
                      disabled={e.my_status == null}
                      leftOptions={leftOptions}
                      deepLeftOptions={deepLeftOptions}
                      rightAction={captureAction}
                      deepRightAction={galleryAction}
                    >
                      {(dragX) => {
                        // The two end caps don't slide as one rigid block
                        // with the center card - each stays put on the side
                        // matching the swipe direction, so a left swipe
                        // pins the icon (only the card+result peel left,
                        // uncovering the ✓ hint) and a right swipe pins the
                        // result segment (only the icon+card peel right,
                        // uncovering the ✗ hint) - vice versa. The center
                        // card always tracks the drag fully, so its overlap
                        // with whichever end is momentarily static only
                        // grows (hidden under that segment's z-10), never
                        // opening a gap.
                        const segTransition =
                          dragX === 0 ? "transform 150ms ease-out" : "none";
                        const iconTranslate = Math.max(0, dragX);
                        const resultTranslate = Math.min(0, dragX);
                        // The ◀/▶ "keep swiping" cue lives on these
                        // sliding segments (not in SwipeableRow's static
                        // hint box) specifically so it tracks the live
                        // drag instead of a fixed snap width: it only
                        // shows once the shallow swipe threshold is
                        // cleared and disappears again past the deep
                        // one (nothing "further" to hint at once
                        // there), and never at all when this row's
                        // swipe is disabled (coach/admin viewing
                        // someone else's row).
                        const swipeable = e.my_status != null;
                        const showRightChevron =
                          swipeable &&
                          dragX >= SWIPE_THRESHOLD &&
                          dragX < DEEP_SWIPE_THRESHOLD;
                        const showLeftChevron =
                          swipeable &&
                          dragX <= -SWIPE_THRESHOLD &&
                          dragX > -DEEP_SWIPE_THRESHOLD;
                        const hasResultSegment =
                          showTrophy ||
                          e.my_status === "completed" ||
                          e.my_status === "failed";
                        return (
                          <div className="isolate flex overflow-hidden rounded-md shadow-card">
                            {isOverdue(e) ? (
                              <div
                                aria-hidden
                                className="relative z-10 flex w-12 shrink-0 items-center justify-center bg-red-600 text-5xl font-black leading-none text-red-50"
                                style={{
                                  clipPath: "polygon(0 0, 100% 0, 78% 100%, 0 100%)",
                                  filter: sideShadow,
                                  transform: `translateX(${iconTranslate}px)`,
                                  transition: segTransition,
                                }}
                              >
                                !
                                {showRightChevron && (
                                  <span className="absolute left-0.5 text-2xl font-black leading-none text-white/80">
                                    ▶
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div
                                aria-hidden
                                className="relative z-10 flex w-12 shrink-0 items-center justify-center text-xl"
                                style={{
                                  backgroundColor: info.bg_color,
                                  clipPath: "polygon(0 0, 100% 0, 78% 100%, 0 100%)",
                                  filter: sideShadow,
                                  transform: `translateX(${iconTranslate}px)`,
                                  transition: segTransition,
                                }}
                              >
                                <TypeIcon icon={info.icon} iconUrl={info.icon_url} size={20} />
                                {showRightChevron && (
                                  <span className="absolute left-0.5 text-2xl font-black leading-none text-white/80">
                                    ▶
                                  </span>
                                )}
                              </div>
                            )}
                            <button
                              onClick={() => setDrawer(e)}
                              className={`relative my-1 -ml-3 flex min-h-[44px] w-full flex-1 flex-col items-start gap-1 rounded-sm py-3 pl-5 pr-4 text-left shadow-sm ${
                                e.my_status === "failed"
                                  ? "bg-red-50"
                                  : e.my_status === "completed"
                                  ? "bg-green-50"
                                  : "bg-white"
                              }`}
                              style={{
                                transform: `translateX(${dragX}px)`,
                                transition: segTransition,
                              }}
                            >
                              <span
                                className={`font-medium ${
                                  e.my_status === "completed"
                                    ? "text-green-300"
                                    : e.my_status === "failed"
                                    ? "text-red-700"
                                    : ""
                                }`}
                              >
                                {e.title}
                              </span>
                              <div className="flex items-center gap-2">
                                <Badge>{info.label}</Badge>
                                {e.has_media && (
                                  <span
                                    aria-label="Has photos or videos"
                                    title="Has photos or videos"
                                    className="text-xs"
                                  >
                                    📷
                                  </span>
                                )}
                                <span className="text-xs text-stone-500">
                                  {occ.totalDays === 1 || e.daily_times ? (
                                    <>
                                      {e.start_time ? toTimeInput(e.start_time) : ""}
                                      {e.end_time && e.end_time !== e.start_time
                                        ? `–${toTimeInput(e.end_time)}`
                                        : ""}
                                    </>
                                  ) : (
                                    <>
                                      {occ.dayIndex === 1 && e.start_time
                                        ? `from ${toTimeInput(e.start_time)}`
                                        : ""}
                                      {occ.dayIndex === occ.totalDays && e.end_time
                                        ? `until ${toTimeInput(e.end_time)}`
                                        : ""}
                                    </>
                                  )}
                                  {occ.totalDays > 1
                                    ? ` · Day ${occ.dayIndex} of ${occ.totalDays}`
                                    : ""}
                                </span>
                              </div>
                              {showLeftChevron && !hasResultSegment && (
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-2xl font-black leading-none text-stone-400"
                                >
                                  ◀
                                </span>
                              )}
                            </button>
                            {hasResultSegment && (
                              <div
                                aria-hidden
                                className={`relative z-10 -ml-3 flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 text-center ${
                                  showTrophy
                                    ? "bg-amber-100 text-amber-800"
                                    : e.my_status === "completed"
                                    ? "bg-green-200 text-green-800"
                                    : "bg-red-100 text-red-700"
                                }`}
                                style={{
                                  clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)",
                                  filter: resultShadow,
                                  transform: `translateX(${resultTranslate}px)`,
                                  transition: segTransition,
                                }}
                              >
                                {showTrophy ? (
                                  <>
                                    <span className="text-xl leading-none">🏆</span>
                                    <span className="text-xs font-semibold leading-none">
                                      {e.my_result_place}
                                    </span>
                                  </>
                                ) : e.my_status === "completed" ? (
                                  <span className="text-3xl leading-none">✓</span>
                                ) : (
                                  <span className="text-3xl leading-none">✗</span>
                                )}
                                {showLeftChevron && (
                                  <span className="absolute right-0.5 text-2xl font-black leading-none opacity-80">
                                    ◀
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    </SwipeableRow>
                  );
                })}
              </div>
              );
            }
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
          modules={modules}
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
          modules={modules}
          onOpenEvent={setDrawer}
        />
      )}

      {viewMode === "day" && (
        <DayView
          focusedDate={focusedDate}
          setFocusedDate={setFocusedDate}
          events={filteredEvents}
          eventTypes={eventTypes}
          modules={modules}
          onOpenEvent={setDrawer}
          onReschedule={(event, start_time, end_time) =>
            updateEventTime(event, start_time, end_time)
          }
        />
      )}

      {viewMode === "list" && (
        <button
          onClick={() => {
            feedbackConfirm(500);
            scrollToToday("smooth");
          }}
          aria-label="Jump to today"
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-red-600 text-lg text-white shadow-lg"
        >
          ↑
        </button>
      )}

      <Drawer
        open={drawer === "create"}
        onClose={() => setDrawer("closed")}
        title="New event"
      >
        {drawer === "create" && (
          <CreateEventWizard
            form={form}
            setForm={setForm}
            formAthleteIds={formAthleteIds}
            setFormAthleteIds={setFormAthleteIds}
            onSubmit={createEvent}
            onSwitchToProgramEnroll={() => {
              setDrawer("closed");
              setProgramEnrollOpen(true);
            }}
            clubs={clubs}
            eventTypes={eventTypes}
            modules={modules}
            katas={katas}
            venues={venues}
            squads={squads}
            groups={groups}
            athletes={athletes}
            canPickAthletes={canPickAthletes}
          />
        )}
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

      <RecordResultDrawer
        event={resultDrawerEvent}
        athleteId={user?.athlete_id ?? null}
        onClose={() => setResultDrawerEvent(null)}
        onSaved={(place) => {
          if (resultDrawerEvent) {
            const savedId = resultDrawerEvent.id;
            setEvents((prev) =>
              prev
                ? prev.map((e) =>
                    e.id === savedId ? { ...e, my_result_place: place } : e
                  )
                : prev
            );
          }
          setResultDrawerEvent(null);
        }}
      />

      <QuickPostDrawer
        event={quickPost?.event ?? null}
        typeLabel={quickPost?.typeLabel ?? ""}
        athleteId={user?.athlete_id ?? null}
        onClose={() => setQuickPost(null)}
      />

      <CaptureSheet
        event={captureEvent}
        onClose={() => setCaptureEvent(null)}
        onCaptured={() => {
          setGalleryRefreshKey((k) => k + 1);
          if (captureEvent) {
            const capturedId = captureEvent.id;
            setEvents((prev) =>
              prev
                ? prev.map((e) => (e.id === capturedId ? { ...e, has_media: true } : e))
                : prev
            );
          }
        }}
      />

      <GalleryDrawer
        event={galleryEvent}
        athleteId={user?.athlete_id ?? null}
        refreshKey={galleryRefreshKey}
        onClose={() => setGalleryEvent(null)}
        onCountChange={(eventId, count) =>
          setEvents((prev) =>
            prev
              ? prev.map((e) => (e.id === eventId ? { ...e, has_media: count > 0 } : e))
              : prev
          )
        }
      />
    </div>
  );
}

type CreateStage =
  | "type"
  | "details"
  | "datetime"
  | "repeat"
  | "location"
  | "athletes";

const CREATE_STAGE_LABELS: Record<CreateStage, string> = {
  type: "Type",
  details: "Details",
  datetime: "Date & time",
  repeat: "Repeat",
  location: "Location",
  athletes: "Athletes",
};

// canPickAthletes is false for a plain athlete creating their own event -
// the backend already self-assigns them regardless of what athlete_ids
// carries (resolveAthleteIds in events.js always resolves an athlete
// caller to just [user.athlete_id]), so asking them to pick athletes
// would be pointless; the wizard skips that stage entirely rather than
// showing a picker whose answer is ignored.
function createStagesFor(canPickAthletes: boolean): CreateStage[] {
  const stages: CreateStage[] = ["type", "details", "datetime", "repeat", "location"];
  if (canPickAthletes) stages.push("athletes");
  return stages;
}

// Creating a new event walks through a step-by-step wizard rather than one
// long scrolling form (editing an existing event stays EventDetail's flat
// form below, unchanged - a wizard's one-screen-at-a-time flow fits "start
// from nothing" much better than "look at everything already filled in and
// tweak one field"). Type comes first as a full-page tile grid (mirrors the
// header's own type-filter tiles, just single-select and auto-advancing on
// tap instead of toggling a filter set) since it decides what the rest of
// the wizard even asks: a training event's Details stage gets a training-
// module picker, a kata_performance event's gets a kata picker (auto-
// filling the title), everything else's Details stage is just the title.
// Both pickers are skippable by design - SingleSelectPicker already allows
// leaving nothing selected, and Next doesn't require a choice there.
function CreateEventWizard({
  form,
  setForm,
  formAthleteIds,
  setFormAthleteIds,
  onSubmit,
  onSwitchToProgramEnroll,
  clubs,
  eventTypes,
  modules,
  katas,
  venues,
  squads,
  groups,
  athletes,
  canPickAthletes,
}: {
  form: typeof EMPTY_FORM;
  setForm: Dispatch<SetStateAction<typeof EMPTY_FORM>>;
  formAthleteIds: number[];
  setFormAthleteIds: Dispatch<SetStateAction<number[]>>;
  onSubmit: () => Promise<void>;
  onSwitchToProgramEnroll: () => void;
  clubs: Club[];
  eventTypes: EventTypeRow[];
  modules: TrainingModule[];
  katas: Kata[];
  venues: Venue[];
  squads: AthleteGroup[];
  groups: AthleteGroup[];
  athletes: Person[];
  canPickAthletes: boolean;
}) {
  const stages = createStagesFor(canPickAthletes);
  const [stageIndex, setStageIndex] = useState(0);
  const stage = stages[stageIndex];
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The duration dial only makes sense for a same-day, has-a-start-time
  // event - a duplicated multi-day event (or one with no start time set
  // yet) opens straight into the exact End date/time fields instead.
  const [customEndOpen, setCustomEndOpen] = useState(
    form.start_date !== form.end_date || !form.start_time
  );

  async function handleCreate() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Something went wrong"
      );
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    setStageIndex((s) => Math.max(0, s - 1));
  }
  function goNext() {
    setStageIndex((s) => Math.min(stages.length - 1, s + 1));
  }

  const canProceed =
    stage === "details"
      ? form.title.trim() !== ""
      : stage === "datetime"
        ? !!form.start_date && !!form.end_date
        : stage === "repeat"
          ? form.repeat_freq === "none" ||
            form.repeat_end_type !== "until" ||
            !!form.repeat_until
          : true;

  const typesForClub = eventTypes.filter((t) => t.club_id === form.club_id);
  // Training-flavored types (standard "Training"/"Training camp" plus any
  // custom type a club named similarly) are pulled out of the otherwise
  // alphabetical order and grouped as a contiguous block at the end of
  // the grid, immediately followed by the "Enroll in a training
  // programme" tile below - so everything training-related reads as one
  // cluster instead of being scattered by alphabetical label order.
  const isTrainingType = (t: EventTypeRow) =>
    /training/i.test(t.key) || /training/i.test(t.label);
  const typesForClubOrdered = [
    ...typesForClub.filter((t) => !isTrainingType(t)),
    ...typesForClub.filter(isTrainingType),
  ];

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium text-stone-500">
        {CREATE_STAGE_LABELS[stage]} · {stageIndex + 1} of {stages.length}
      </span>

      {stage === "type" && (
        <>
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
          <div className="grid grid-cols-3 gap-3">
            {typesForClubOrdered.map((t) => {
              const selected = form.event_type === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, event_type: t.key });
                    goNext();
                  }}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center shadow-card ${
                    selected ? "ring-2 ring-red-600" : ""
                  }`}
                  style={{ backgroundColor: t.bg_color }}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                    style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
                  >
                    <TypeIcon icon={t.icon} iconUrl={t.icon_url} size={20} />
                  </span>
                  <span className="text-xs font-medium text-white">{t.label}</span>
                </button>
              );
            })}
            {/* Not a real event type (no key/row in nk_event_types) - a
                shortcut into the separate bulk-enroll flow, styled and
                sized identically to the type tiles above and placed right
                after the training-cluster group so it reads as part of
                that same "training" cluster rather than a stray action. */}
            <button
              type="button"
              onClick={onSwitchToProgramEnroll}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center shadow-card"
              style={{ backgroundColor: "#0d9488" }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
              >
                <TypeIcon icon="📋" size={20} />
              </span>
              <span className="text-xs font-medium text-white">
                Enroll in programme
              </span>
            </button>
          </div>
          {typesForClub.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="px-1 py-2 text-sm text-stone-500">
                No event types to choose from yet.
              </p>
              <button
                type="button"
                onClick={goNext}
                className="min-h-[44px] rounded-full bg-red-600 font-medium text-white"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {stage === "details" && (
        <>
          <Field label="Title">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <Field label="Icon (optional)">
            <input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder={inheritedIcon(
                eventTypes,
                modules,
                form.club_id,
                form.event_type,
                form.training_module_id
              )}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          {form.event_type === "training" && (
            <SingleSelectPicker
              label="Training session"
              placeholder="Search training sessions..."
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
        </>
      )}

      {stage === "datetime" && (
        <>
          <DateTimeField
            label="Start"
            date={form.start_date}
            time={form.start_time}
            onDateChange={(v) => {
              // End stays mirrored to Start as long as it hasn't been
              // deliberately diverged - lets most events (which start and
              // end the same day) skip touching the End field entirely.
              const endLinked = form.end_date === form.start_date;
              setForm({
                ...form,
                start_date: v,
                end_date: endLinked ? v : form.end_date,
              });
            }}
            onTimeChange={(v) => {
              const endLinked = form.end_time === form.start_time;
              setForm({
                ...form,
                start_time: v,
                end_time: endLinked ? v : form.end_time,
              });
            }}
          />

          {!customEndOpen ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-stone-50 p-4">
              <span className="text-3xl font-bold text-stone-900">
                {formatDuration(
                  minutesBetweenDateTime(
                    form.start_date,
                    form.start_time,
                    form.end_date,
                    form.end_time
                  )
                )}
              </span>
              <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm">
                🕐 Ends {form.end_time || "—"}
              </span>
              <DurationDial
                minutes={Math.max(
                  0,
                  minutesBetweenDateTime(
                    form.start_date,
                    form.start_time,
                    form.end_date,
                    form.end_time
                  )
                )}
                onChange={(mins) => {
                  const next = addMinutesToDateTime(form.start_date, form.start_time, mins);
                  setForm({ ...form, end_date: next.date, end_time: next.time });
                }}
              />
              <button
                type="button"
                onClick={() => setCustomEndOpen(true)}
                className="text-sm font-medium text-red-700"
              >
                Set an exact end date & time instead
              </button>
            </div>
          ) : (
            <>
              <DateTimeField
                label="End"
                date={form.end_date}
                time={form.end_time}
                onDateChange={(v) => setForm({ ...form, end_date: v })}
                onTimeChange={(v) => setForm({ ...form, end_time: v })}
              />
              {form.start_time && (
                <button
                  type="button"
                  onClick={() => setCustomEndOpen(false)}
                  className="text-sm font-medium text-red-700"
                >
                  Use the duration dial instead
                </button>
              )}
            </>
          )}

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
        </>
      )}

      {stage === "repeat" && (
        <>
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
        </>
      )}

      {stage === "location" && (
        <>
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
        </>
      )}

      {stage === "athletes" && (
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

      {stage !== "type" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 font-medium text-stone-700 disabled:opacity-50"
            >
              ← Back
            </button>
            {stageIndex < stages.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed}
                className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canProceed || submitting}
                className="min-h-[44px] flex-1 rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create"}
              </button>
            )}
          </div>
          {submitError && (
            <p className="text-sm text-red-700">{submitError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Fields it makes sense to apply to every occurrence in a series at once
// when the "whole series" edit scope is chosen (EventDetail's updateEvent
// below) - start_date/end_date are deliberately excluded since each
// occurrence keeps its own place in the series regardless of scope, same
// as the backend's PATCH /events/:id/series only ever touches these.
const SERIES_EDITABLE_KEYS = new Set([
  "title",
  "event_type",
  "start_time",
  "end_time",
  "daily_times",
  "location",
  "venue_id",
  "notes",
  "training_module_id",
  "kata_id",
  "icon",
]);

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
  const [editScope, setEditScope] = useState<"one" | "series">("one");
  const [scopePromptOpen, setScopePromptOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [myPost, setMyPost] = useState<Post | null>(null);

  // hasSeries gates whether entering edit mode asks "this event or the
  // whole series" first - a one-off event has nothing to ask about, so it
  // goes straight into edit mode same as before this scope prompt existed.
  function handleEditToggle() {
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    if (hasSeries) {
      setScopePromptOpen(true);
      return;
    }
    setEditScope("one");
    setIsEditing(true);
  }

  function chooseEditScope(scope: "one" | "series") {
    setEditScope(scope);
    setScopePromptOpen(false);
    setIsEditing(true);
  }

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

  // Surfaces a link to the athlete's own post about this event, if they
  // made one (posting is self-only, so this only ever applies when the
  // signed-in athlete is themselves on the event's roster - a coach/admin
  // viewing someone else's event has no "my post" to show).
  useEffect(() => {
    if (user?.role !== "athlete" || !user.athlete_id || !athleteIds.includes(user.athlete_id)) {
      setMyPost(null);
      return;
    }
    api
      .get<{ posts: Post[] }>(`/athletes/${user.athlete_id}/posts`)
      .then((res) =>
        setMyPost(
          res.posts.find((p) => p.share_kind === "event" && p.share_event_id === eventId) ??
            null
        )
      )
      .catch(() => setMyPost(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user?.athlete_id, athleteIds.join(",")]);

  async function updateEvent(patch: Record<string, unknown>) {
    // A date field always applies to just this occurrence, even under
    // "whole series" scope - only when every key in this particular patch
    // is series-safe (see SERIES_EDITABLE_KEYS) does it fan out.
    const useSeries =
      editScope === "series" &&
      Object.keys(patch).every((k) => SERIES_EDITABLE_KEYS.has(k));

    if (useSeries) {
      const { events: updatedEvents } = await api.patch<{ events: Event[] }>(
        `/events/${eventId}/series`,
        patch
      );
      const self = updatedEvents.find((e) => e.id === eventId);
      if (self) setEvent(self);
      updatedEvents.forEach((e) => onUpdated(e));
      return;
    }

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
      {/* Floating rather than a top-of-flow pill so the type/date row below
          (not this) is the first thing read under the drawer's own title -
          bottom-left, round and red like the List view's AddButton, with
          `sm:absolute` so it floats relative to the drawer panel itself
          (its nearest positioned ancestor) rather than the whole viewport
          once the drawer becomes a docked side panel instead of a
          full-screen overlay. */}
      <button
        type="button"
        onClick={handleEditToggle}
        aria-label={isEditing ? "Done editing" : "Edit"}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-xl text-white shadow-lg sm:absolute"
      >
        {isEditing ? "✓" : "✏️"}
      </button>

      <Modal open={scopePromptOpen} onClose={() => setScopePromptOpen(false)}>
        <div className="flex flex-col gap-3 p-2">
          <p className="text-sm font-medium text-stone-700">
            This event is part of a recurring series. What would you like to
            edit?
          </p>
          <button
            type="button"
            onClick={() => chooseEditScope("one")}
            className="flex min-h-[44px] items-center gap-3 rounded-xl border border-stone-200 px-4 text-left font-medium"
          >
            This event only
          </button>
          <button
            type="button"
            onClick={() => chooseEditScope("series")}
            className="flex min-h-[44px] items-center gap-3 rounded-xl border border-stone-200 px-4 text-left font-medium"
          >
            The whole series
          </button>
        </div>
      </Modal>

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
          <Field label="Icon (optional)">
            <input
              key={event.icon ?? ""}
              defaultValue={event.icon ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (event.icon ?? "")) {
                  updateEvent({ icon: e.target.value });
                }
              }}
              placeholder={inheritedIcon(
                eventTypes,
                modules,
                event.club_id,
                event.event_type,
                event.training_module_id
              )}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>
          <DateTimeRangeField
            startDate={toDateInput(event.start_date)}
            startTime={toTimeInput(event.start_time)}
            endDate={toDateInput(event.end_date)}
            endTime={toTimeInput(event.end_time)}
            onStartDateChange={(v) => updateEvent({ start_date: v })}
            onStartTimeChange={(v) => updateEvent({ start_time: v || null })}
            onEndDateChange={(v) => updateEvent({ end_date: v })}
            onEndTimeChange={(v) => updateEvent({ end_time: v || null })}
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
              label="Training session"
              placeholder="Search training sessions..."
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
          <Badge>
            <TypeIcon
              icon={eventTypeInfo(eventTypes, event, modules).icon}
              iconUrl={eventTypeInfo(eventTypes, event, modules).icon_url}
              size={14}
            />{" "}
            {eventTypeInfo(eventTypes, event, modules).label}
          </Badge>
          <p className="text-base font-semibold text-stone-800">{eventWhenLabel(event)}</p>
          {event.venue_id != null &&
            (() => {
              const venue = venues.find((v) => v.id === event.venue_id);
              if (!venue) return null;
              const contact = [
                venue.contact_name,
                venue.contact_phone,
                venue.contact_email,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <>
                  <p className="text-sm text-stone-600">
                    📍 {venue.name}
                    {venue.address ? ` – ${venue.address}` : ""}
                  </p>
                  {contact && (
                    <p className="text-xs text-stone-500">{contact}</p>
                  )}
                </>
              );
            })()}
          {event.location && (
            <p className="text-sm text-stone-600">
              {event.venue_id != null ? "" : "📍 "}
              {event.location}
            </p>
          )}
          {event.notes && <p className="text-stone-700">{event.notes}</p>}

          {/* The module's own items are copied into this event's own
              Itinerary at creation time (see copyModuleItemsToEventItems,
              events.js) so they're individually checkable-off - showing
              this read-only reflection of the module too would just
              duplicate that list. Still useful as a fallback for an event
              whose itinerary is otherwise empty (an older event from
              before this existed, or one whose copied items were since
              deleted). */}
          {linkedModule && items.length === 0 && (
            <TrainingModuleView module={linkedModule} />
          )}
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

          {event.has_media && (
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700"
            >
              🖼 View photos &amp; videos
            </button>
          )}
          {myPost && (
            <Link
              to={`/athletes/${myPost.athlete_id}/profile`}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-red-700"
            >
              📝 View your post about this
            </Link>
          )}
        </>
      )}

      <AthleteStatusList
        statuses={event.athlete_status}
        athletes={athleteNames}
        onUpdate={updateEventAthleteStatus}
      />

      <GalleryDrawer
        event={galleryOpen ? event : null}
        athleteId={user?.athlete_id ?? null}
        refreshKey={0}
        onClose={() => setGalleryOpen(false)}
        onCountChange={(_, count) => {
          setEvent((prev) => (prev ? { ...prev, has_media: count > 0 } : prev));
          onUpdated({ ...event, has_media: count > 0 });
        }}
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
  modules,
  onGoToDay,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  eventTypes: EventTypeRow[];
  modules: TrainingModule[];
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
                {dayEvents.slice(0, 3).map((e) => {
                  const info = eventTypeInfo(eventTypes, e, modules);
                  return (
                    <span key={e.id} title={e.title}>
                      <TypeIcon icon={info.icon} iconUrl={info.icon_url} size={10} />
                    </span>
                  );
                })}
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
  modules,
  onOpenEvent,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  eventTypes: EventTypeRow[];
  modules: TrainingModule[];
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

  const gridWidth = GRID_HOURS.length * WEEK_HOUR_WIDTH;
  const gridTemplateColumns = `${WEEK_LABEL_COL_WIDTH}px repeat(${GRID_HOURS.length}, ${WEEK_HOUR_WIDTH}px)`;

  return (
    <div className="flex flex-col gap-3">
      <CalendarNav
        label={weekRangeLabel(weekStart)}
        onPrev={() => setFocusedDate(addDaysStr(weekStart, -7))}
        onNext={() => setFocusedDate(addDaysStr(weekStart, 7))}
        onToday={() => setFocusedDate(todayStr())}
      />

      {/* Days run down the rows, hours run across the columns (transposed
          from Day view's vertical timeline) - the corner cell and header
          row freeze on scroll via `sticky`, so a week's full 6am-10pm span
          can be panned both horizontally (time) and vertically (days)
          without losing your place. */}
      <div className="max-h-[70vh] overflow-auto rounded-lg bg-white shadow-card">
        <div
          className="grid"
          style={{ gridTemplateColumns, width: WEEK_LABEL_COL_WIDTH + gridWidth }}
        >
          <div
            className="sticky left-0 top-0 z-20 border-b border-r border-stone-100 bg-stone-100"
            style={{ gridColumn: 1, gridRow: 1 }}
          />
          {GRID_HOURS.map((h, i) => (
            <div
              key={h}
              className="sticky top-0 z-10 border-b border-stone-100 bg-stone-100 py-1 text-center text-[10px] text-stone-500"
              style={{ gridColumn: i + 2, gridRow: 1 }}
            >
              {formatHour(h)}
            </div>
          ))}

          {days.flatMap((date, rowIdx) => {
            const allDay = allDayEventsFor(date);
            const isToday = date === todayStr();
            return [
              <div
                key={`label-${date}`}
                className={`sticky left-0 z-10 flex flex-col justify-center gap-0.5 border-r border-stone-100 px-2 text-xs font-medium ${
                  isToday ? "bg-red-50" : "bg-stone-100"
                }`}
                style={{
                  gridColumn: 1,
                  gridRow: rowIdx + 2,
                  height: WEEK_DAY_ROW_HEIGHT,
                }}
              >
                <span className={isToday ? "text-red-600" : "text-stone-700"}>
                  {shortDateLabel(date)}
                </span>
                {allDay.length > 0 && (
                  <div className="flex gap-0.5">
                    {allDay.slice(0, 3).map((e) => {
                      const info = eventTypeInfo(eventTypes, e, modules);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          title={e.title}
                          onClick={() => onOpenEvent(e)}
                          className="leading-none"
                        >
                          <TypeIcon icon={info.icon} iconUrl={info.icon_url} size={11} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>,
              <div
                key={`row-${date}`}
                className="relative"
                style={{
                  gridColumn: `2 / span ${GRID_HOURS.length}`,
                  gridRow: rowIdx + 2,
                  height: WEEK_DAY_ROW_HEIGHT,
                }}
              >
                {GRID_HOURS.map((h, i) => (
                  <div
                    key={h}
                    className="absolute inset-y-0 border-l border-stone-100"
                    style={{ left: i * WEEK_HOUR_WIDTH }}
                  />
                ))}
                {timedEventsFor(date).map((e) => {
                  const start = timeToMinutes(e.start_time) ?? DAY_START_HOUR * 60;
                  const end = timeToMinutes(e.end_time) ?? start + 30;
                  const left = ((start - DAY_START_HOUR * 60) / 60) * WEEK_HOUR_WIDTH;
                  const width = Math.max(((end - start) / 60) * WEEK_HOUR_WIDTH, 44);
                  const info = eventTypeInfo(eventTypes, e, modules);
                  return (
                    <button
                      key={e.id}
                      onClick={() => onOpenEvent(e)}
                      className={`absolute inset-y-0.5 overflow-hidden rounded border-t-4 px-1 text-left text-[10px] ${
                        e.my_status === "failed"
                          ? "bg-red-50 text-red-800"
                          : "bg-white text-stone-700"
                      }`}
                      style={{ left, width, borderTopColor: info.bg_color }}
                    >
                      <TypeIcon icon={info.icon} iconUrl={info.icon_url} size={9} /> {e.title}
                    </button>
                  );
                })}
              </div>,
            ];
          })}
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
  modules,
  onOpenEvent,
  onReschedule,
}: {
  focusedDate: string;
  setFocusedDate: (date: string) => void;
  events: Event[];
  eventTypes: EventTypeRow[];
  modules: TrainingModule[];
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
            const info = eventTypeInfo(eventTypes, e, modules);
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
                  <TypeIcon icon={info.icon} iconUrl={info.icon_url} size={13} />
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
            const info = eventTypeInfo(eventTypes, e, modules);
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
                    <TypeIcon icon={info.icon} iconUrl={info.icon_url} size={12} />
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

// The "Record result" quick composer for a competition-type event, opened
// automatically right after its List view row is swiped left to "✓
// Completed" (see the List view's leftOptions above). Deliberately
// minimal - just rounds won and place, not the full
// EventCompetitionResults form - since this is meant as a fast one-tap
// capture right after the swipe; a fuller record (location/notes) can
// still be added from the event's own detail drawer. Posting to the
// athlete's profile is a separate explicit opt-in, not the default,
// mirroring how sharing works everywhere else in the app.
function RecordResultDrawer({
  event,
  athleteId,
  onClose,
  onSaved,
}: {
  event: Event | null;
  athleteId: number | null;
  onClose: () => void;
  onSaved: (place: string | null) => void;
}) {
  const api = useApi();
  const [roundsWon, setRoundsWon] = useState("");
  const [place, setPlace] = useState("");
  const [postToProfile, setPostToProfile] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function showMediaError(message: string) {
    setMediaError(message);
    setTimeout(() => setMediaError(null), 4000);
  }

  useEffect(() => {
    setRoundsWon("");
    setPlace("");
    setPostToProfile(false);
    setTitle("");
    setBody("");
    setPhotoUrl("");
    setUploadingPhoto(false);
  }, [event?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!event || !athleteId || submitting || uploadingPhoto) return;
    setSubmitting(true);
    try {
      const { result } = await api.post<{ result: { id: number } }>(
        `/athletes/${athleteId}/competition-results`,
        {
          competition_name: event.title,
          competition_date: event.start_date,
          rounds_completed: roundsWon ? Number(roundsWon) : null,
          final_position: place.trim() || null,
          event_id: event.id,
        }
      );
      if (postToProfile) {
        await api.post(`/athletes/${athleteId}/posts`, {
          title: title.trim() || undefined,
          body: body.trim() || undefined,
          share_kind: "competition_result",
          share_id: result.id,
          image_url: photoUrl || undefined,
        });
      }
      onSaved(place.trim() || null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={event !== null} onClose={onClose} title="Record result">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Rounds won">
          <input
            type="number"
            min={0}
            value={roundsWon}
            onChange={(e) => setRoundsWon(e.target.value)}
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        <Field label="Place">
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. 1st, Gold, Semifinal"
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
        </Field>
        <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-stone-50 px-3 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={postToProfile}
            onChange={(e) => setPostToProfile(e.target.checked)}
          />
          Post this result to my profile
        </label>
        {postToProfile && (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's on your mind?"
              rows={3}
              className="rounded-xl border border-stone-300 px-3 py-2"
            />
            <MediaField
              label="Photo (optional)"
              kind="image"
              value={photoUrl}
              onChange={setPhotoUrl}
              onError={showMediaError}
              onUploadingChange={setUploadingPhoto}
            />
          </>
        )}
        <button
          type="submit"
          disabled={submitting || uploadingPhoto}
          className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
        >
          {uploadingPhoto
            ? "Uploading photo..."
            : submitting
            ? "Saving..."
            : "Save result"}
        </button>
      </form>
      {mediaError && <Toast message={mediaError} />}
    </Drawer>
  );
}

interface ProgramSummary {
  id: number;
  title: string;
  icon: string | null;
  duration_weeks: number;
}

// Browse existing training programmes and enroll straight from Schedule's
// own "+" (reached via the Type stage's "Enroll in a training programme
// instead" link in CreateEventWizard above), instead of needing to go to
// the separate Training page first. Deliberately just the enroll step
// (browse -> pick a start date -> optionally pick athletes) - creating or
// editing a programme's own weekly pattern still only happens on the
// Training page's Programmes tab (admin/TrainingProgrammes.tsx), which
// this reuses the same /training-programs endpoints against.
function EnrollInProgramDrawer({
  open,
  onClose,
  canPickAthletes,
  athletes,
}: {
  open: boolean;
  onClose: () => void;
  canPickAthletes: boolean;
  athletes: Person[];
}) {
  const api = useApi();
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProgramSummary | null>(null);
  const [startDate, setStartDate] = useState("");
  const [athleteQuery, setAthleteQuery] = useState("");
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setStartDate("");
    setSelectedAthleteIds([]);
    setError(null);
    api
      .get<{ programs: ProgramSummary[] }>("/training-programs")
      .then((res) => setPrograms(res.programs))
      .catch(() => setPrograms([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function enroll() {
    if (!selected || !startDate) {
      setError("Pick a start date");
      return;
    }
    if (canPickAthletes && selectedAthleteIds.length === 0) {
      setError("Pick at least one athlete");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/training-programs/${selected.id}/enroll`, {
        start_date: startDate,
        ...(canPickAthletes ? { athlete_ids: selectedAthleteIds } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filteredPrograms = (programs ?? []).filter((p) =>
    p.title.toLowerCase().includes(q)
  );

  const aq = athleteQuery.trim().toLowerCase();
  const filteredAthletes = athletes.filter((a) =>
    `${a.first_name} ${a.last_name}`.toLowerCase().includes(aq)
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={selected ? selected.title : "Enroll in a programme"}
    >
      {!selected ? (
        <div className="flex flex-col gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search training programmes..."
            className="min-h-[44px] rounded-xl border border-stone-300 px-3"
          />
          <div className="flex flex-col gap-2">
            {programs === null ? (
              <Spinner />
            ) : (
              filteredPrograms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className="flex min-h-[44px] items-center justify-between rounded-2xl bg-white p-4 text-left shadow-card"
                >
                  <span className="font-medium">
                    {p.icon ? `${p.icon} ` : ""}
                    {p.title}
                  </span>
                  <Badge>{p.duration_weeks} weeks</Badge>
                </button>
              ))
            )}
            {programs !== null && filteredPrograms.length === 0 && (
              <p className="px-1 py-2 text-sm text-stone-500">
                No training programmes yet.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="self-start text-sm text-stone-500"
          >
            ← Back to programmes
          </button>

          {canPickAthletes && (
            <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
              <span className="text-xs font-medium text-stone-600">
                Athletes ({selectedAthleteIds.length})
              </span>
              <input
                value={athleteQuery}
                onChange={(e) => setAthleteQuery(e.target.value)}
                placeholder="Search athletes..."
                className="min-h-[44px] rounded-xl border border-stone-300 px-3"
              />
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {filteredAthletes.map((a) => {
                  const added = selectedAthleteIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        setSelectedAthleteIds((prev) =>
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
              </div>
            </div>
          )}

          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-[44px] rounded-xl border border-stone-300 px-3"
            />
          </Field>

          <button
            type="button"
            onClick={enroll}
            disabled={submitting}
            className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add to schedule"}
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </Drawer>
  );
}

// The "Add post" quick composer, opened by swiping any event's List view
// row right (see the List view's rightAction above). Deliberately just a
// body + optional photo/video, prefilled with the calendar entry's
// type/date/name so posting about "today's session" is a one-tap
// edit-and-send rather than a blank composer - and shares the event
// (`share_kind: "event"`) so it also carries the same "🗓️ {title}"
// ShareBadge a manually-shared event gets from the main post composer.
function QuickPostDrawer({
  event,
  typeLabel,
  athleteId,
  onClose,
}: {
  event: Event | null;
  typeLabel: string;
  athleteId: number | null;
  onClose: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function showMediaError(message: string) {
    setMediaError(message);
    setTimeout(() => setMediaError(null), 4000);
  }

  // Minimal formatting toolbar: wraps the current textarea selection in
  // **/* markers (rendered back into <strong>/<em> in the feed) rather
  // than pulling in a rich-text editor dependency - same approach as the
  // main post composer's Bold/Italic buttons.
  function wrapSelection(marker: string) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const selected = body.slice(start, end);
    const next = `${body.slice(0, start)}${marker}${selected}${marker}${body.slice(end)}`;
    setBody(next);
    const cursor = selected ? end + marker.length * 2 : start + marker.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  useEffect(() => {
    setTitle("");
    setBody(event ? `${typeLabel} · ${dateLabel(event.start_date)} · ${event.title}` : "");
    setPhotoUrl("");
    setUploadingPhoto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!event || !athleteId || submitting || uploadingPhoto) return;
    setSubmitting(true);
    try {
      await api.post(`/athletes/${athleteId}/posts`, {
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        image_url: photoUrl || undefined,
        share_kind: "event",
        share_id: event.id,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={event !== null} onClose={onClose} title="Add post">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="min-h-[44px] rounded-xl border border-stone-300 px-3"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => wrapSelection("**")}
            aria-label="Bold"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 font-bold"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => wrapSelection("*")}
            aria-label="Italic"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 italic"
          >
            I
          </button>
        </div>
        <Field label="What's on your mind?">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[120px] rounded-xl border border-stone-300 px-3 py-2"
          />
        </Field>
        <MediaField
          label="Photo or video (optional)"
          kind="image"
          allowVideo
          value={photoUrl}
          onChange={setPhotoUrl}
          onError={showMediaError}
          onUploadingChange={setUploadingPhoto}
        />
        <button
          type="submit"
          disabled={submitting || uploadingPhoto}
          className="min-h-[44px] rounded-full bg-red-600 font-medium text-white disabled:opacity-50"
        >
          {uploadingPhoto ? "Uploading..." : submitting ? "Posting..." : "Post"}
        </button>
      </form>
      {mediaError && <Toast message={mediaError} />}
    </Drawer>
  );
}

// The shallow-right swipe action: a plain camera/library action sheet
// (deliberately not a Drawer/form - there's nothing to fill in) that
// uploads whatever's picked and attaches it straight to the event's
// gallery (`POST /events/:id/media`), no title/body/post involved. Deep-
// right instead opens GalleryDrawer to browse what's been captured so
// far. Doesn't close itself on a picker-button tap - only once the
// upload+attach actually finishes - since closing would null out
// `event` in the parent before the (async) file-select/upload completes,
// stranding the handler with nothing to attach to; the OS camera/picker
// UI overlays on top of it regardless, so leaving it mounted underneath
// is invisible to the user until they return to the app.
function CaptureSheet({
  event,
  onClose,
  onCaptured,
}: {
  event: Event | null;
  onClose: () => void;
  onCaptured: () => void;
}) {
  const api = useApi();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !event) return;
    setUploading(true);
    try {
      const media_url = await uploadFile(file);
      const kind = file.type.startsWith("video/") ? "video" : "image";
      await api.post(`/events/${event.id}/media`, { media_url, kind });
      onCaptured();
      onClose();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Modal open={event !== null} onClose={onClose}>
        <div className="flex flex-col gap-2 p-2">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploading}
            className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700 disabled:opacity-50"
          >
            📷 Take photo
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={uploading}
            className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700 disabled:opacity-50"
          >
            🎥 Record video
          </button>
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            disabled={uploading}
            className="min-h-[44px] rounded-xl border border-stone-300 font-medium text-stone-700 disabled:opacity-50"
          >
            🖼 Choose from library
          </button>
          {uploading && (
            <p className="py-1 text-center text-sm text-stone-500">Uploading…</p>
          )}
        </div>
      </Modal>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFile}
        className="hidden"
      />
      {error && <Toast message={error} />}
    </>
  );
}

interface EventMedia {
  id: number;
  event_id: number;
  athlete_id: number | null;
  media_url: string;
  kind: "image" | "video";
  created_at: string;
}

// The deep-right swipe destination: a grid of everything captured
// against this event via CaptureSheet above. Read-only for coaches/
// admins (isEventEditor's broader visibility - same as the event detail
// drawer itself); only the athlete who captured a given item can remove
// it (backend-enforced, mirrored here by only showing the delete icon to
// the signed-in athlete).
function GalleryDrawer({
  event,
  athleteId,
  refreshKey,
  onClose,
  onCountChange,
}: {
  event: Event | null;
  athleteId: number | null;
  refreshKey: number;
  onClose: () => void;
  onCountChange: (eventId: number, count: number) => void;
}) {
  const api = useApi();
  const [media, setMedia] = useState<EventMedia[] | null>(null);

  useEffect(() => {
    if (!event) {
      setMedia(null);
      return;
    }
    setMedia(null);
    api
      .get<{ media: EventMedia[] }>(`/events/${event.id}/media`)
      .then((res) => {
        setMedia(res.media);
        onCountChange(event.id, res.media.length);
      })
      .catch(() => setMedia([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, refreshKey]);

  async function deleteMedia(item: EventMedia) {
    if (!event) return;
    await api.del(`/events/${event.id}/media/${item.id}`);
    setMedia((prev) => {
      const next = prev ? prev.filter((m) => m.id !== item.id) : prev;
      if (next) onCountChange(event.id, next.length);
      return next;
    });
  }

  return (
    <Drawer open={event !== null} onClose={onClose} title="Gallery">
      {!media ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : media.length === 0 ? (
        <p className="px-1 py-2 text-sm text-stone-500">
          Nothing captured for this event yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {media.map((item) => (
            <div key={item.id} className="relative overflow-hidden rounded-xl bg-stone-100">
              {item.kind === "video" ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={item.media_url} controls className="aspect-square w-full object-cover" />
              ) : (
                <img
                  src={item.media_url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              )}
              {athleteId != null && item.athlete_id === athleteId && (
                <button
                  type="button"
                  onClick={() => deleteMedia(item)}
                  aria-label="Delete"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-stone-900/60 text-sm text-white"
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Drawer>
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
                    ? "text-green-300"
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

  // Every exercise across every module, flattened - lets an itinerary
  // item link to one specific exercise (training_module_item_id) instead
  // of a whole session (training_module_id), e.g. for a training event
  // whose itinerary was auto-generated one item per exercise.
  const exerciseOptions = modules.flatMap((m) =>
    m.items
      .filter((mi) => mi.item_type === "exercise")
      .map((mi) => ({ id: mi.id, label: `${itemSummary(mi)} (${m.title})` }))
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
      training_module_item_id:
        addForm.item_type === "training"
          ? addForm.training_module_item_id
          : null,
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
      training_module_item_id: item.training_module_item_id,
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
                            ? "text-green-300"
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
                      {toTimeInput(item.start_time)}
                      {item.end_time !== item.start_time &&
                        `–${toTimeInput(item.end_time)}`}
                    </span>
                  </div>
                  {item.notes && !item.training_module_item_id && (
                    <p className="text-sm text-stone-700">{item.notes}</p>
                  )}
                  {item.item_type === "training" &&
                    item.training_module_item_id &&
                    (() => {
                      const exercise = modules
                        .flatMap((m) => m.items)
                        .find((mi) => mi.id === item.training_module_item_id);
                      return exercise ? (
                        <TrainingModuleItemDetail item={exercise} showTitle />
                      ) : null;
                    })()}
                  {item.item_type === "training" &&
                    !item.training_module_item_id &&
                    item.training_module_id &&
                    (() => {
                      const module = modules.find(
                        (m) => m.id === item.training_module_id
                      );
                      return module ? (
                        <TrainingModuleView module={module} showTitle />
                      ) : null;
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
                      label="Training session"
                      placeholder="Search training sessions..."
                      options={modules.map((m) => ({ id: m.id, label: m.title }))}
                      selectedId={item.training_module_id}
                      onSelect={(id) =>
                        updateItem(item.id, {
                          training_module_id: id,
                          training_module_item_id: id
                            ? null
                            : item.training_module_item_id,
                        })
                      }
                    />
                  )}
                  {item.item_type === "training" && (
                    <SingleSelectPicker
                      label="Exercise"
                      placeholder="Search exercises..."
                      options={exerciseOptions}
                      selectedId={item.training_module_item_id}
                      onSelect={(id) => {
                        const picked = id
                          ? modules
                              .flatMap((m) => m.items)
                              .find((mi) => mi.id === id)
                          : null;
                        updateItem(item.id, {
                          training_module_item_id: id,
                          training_module_id: id ? null : item.training_module_id,
                          ...(picked ? { title: itemSummary(picked) } : {}),
                        });
                      }}
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
              label="Training session"
              placeholder="Search training sessions..."
              options={modules.map((m) => ({ id: m.id, label: m.title }))}
              selectedId={addForm.training_module_id}
              onSelect={(id) =>
                setAddForm({
                  ...addForm,
                  training_module_id: id,
                  training_module_item_id: id
                    ? null
                    : addForm.training_module_item_id,
                })
              }
            />
          )}
          {addForm.item_type === "training" && (
            <SingleSelectPicker
              label="Exercise"
              placeholder="Search exercises..."
              options={exerciseOptions}
              selectedId={addForm.training_module_item_id}
              onSelect={(id) => {
                const picked = id
                  ? modules.flatMap((m) => m.items).find((mi) => mi.id === id)
                  : null;
                setAddForm({
                  ...addForm,
                  training_module_item_id: id,
                  training_module_id: id ? null : addForm.training_module_id,
                  title: picked ? itemSummary(picked) : addForm.title,
                });
              }}
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
