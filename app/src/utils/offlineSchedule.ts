// A small localStorage-backed cache of already-seen schedule entries
// (plain JSON fields only - titles, times, types, notes; never media) so
// Schedule.tsx has something to show if a later GET /api/events request
// fails outright with no network. This is deliberately separate from the
// service worker's own HTTP response cache (vite.config.ts's
// runtimeCaching): that's keyed by the exact request URL, which bakes in
// the sliding from/to date window Schedule.tsx lazy-loads with, so a
// cache hit there isn't reliable day to day. This cache is keyed by event
// id instead, so anything already seen stays available regardless of
// which particular window last fetched it.

const STORAGE_KEY = "nk-schedule-cache-v1";
const MAX_CACHED_EVENTS = 500;

interface CachedEvent {
  id: number;
  start_date: string;
  end_date: string;
}

export function loadCachedSchedule<T extends CachedEvent>(): T[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function saveCachedSchedule<T extends CachedEvent>(events: T[]) {
  try {
    // If the cached set ever grows past the cap, keep the entries most
    // worth having offline: soonest-ending future events first, then
    // most-recently-ended past events - rather than an arbitrary cutoff.
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...events].sort((a, b) => {
      const aFuture = a.end_date >= today;
      const bFuture = b.end_date >= today;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      return aFuture
        ? a.start_date.localeCompare(b.start_date)
        : b.start_date.localeCompare(a.start_date);
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(sorted.slice(0, MAX_CACHED_EVENTS))
    );
  } catch {
    // Storage full or unavailable (e.g. private browsing) - this cache is
    // a nice-to-have, never let it break the actual page.
  }
}

export function mergeIntoCachedSchedule<T extends CachedEvent>(incoming: T[]) {
  if (incoming.length === 0) return;
  const existing = loadCachedSchedule<T>();
  const map = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) map.set(e.id, e);
  saveCachedSchedule([...map.values()]);
}
