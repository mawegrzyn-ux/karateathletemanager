// Shared date helpers for anything that groups events/entries by day and
// windows them around "today" (Schedule.tsx's list view, the athlete
// Training tab's log) - kept in one place so the two don't drift apart.

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Buckets any list of dated items into date-headed groups, sorted
// chronologically - the shape every date-grouped list view (Schedule.tsx's
// list view, the athlete Training tab's log) renders sections from.
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string
): { date: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const date = getDate(item);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(item);
  }
  return [...map.entries()]
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function dateLabel(dateStr: string) {
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
