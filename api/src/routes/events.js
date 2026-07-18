const crypto = require("crypto");
const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { isEventEditor } = require("../utils/permissions");

const router = Router();

// Events and itinerary items share the exact same type set - a lone event
// can be a rest day, a one-off note, or a kata performance just like an
// itinerary item can, and vice versa. Same array reference for both names
// so there's no risk of the two drifting apart again.
const EVENT_TYPES = [
  "competition",
  "squad_session",
  "training",
  "travel",
  "time_off",
  "seminar",
  "training_camp",
  "grading",
  "rest",
  "other",
  "kata_performance",
];
const ITEM_TYPES = EVENT_TYPES;
const REPEAT_FREQS = ["daily", "weekly", "monthly"];
const MAX_REPEAT_OCCURRENCES = 60;
const STATUS_VALUES = ["pending", "completed", "failed"];

const EVENT_FIELDS = `id, title, event_type, start_date, end_date, start_time, end_time, location, venue_id, kata_id, notes, training_module_id, recurrence_id, created_at`;
const ITEM_FIELDS = `id, event_id, item_type, title, item_date, start_time, end_time, notes, training_module_id, kata_id, recurrence_id`;

router.use(authorize());

function addUTCDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addUTCMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(startDateStr, endDateStr) {
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

// Expands a `repeat` request into the list of occurrence dates
// ('YYYY-MM-DD' strings) starting from item_date, or throws a
// {status, message} error. Caps at MAX_REPEAT_OCCURRENCES.
//
// repeat shape: {
//   freq: 'daily' | 'weekly' | 'monthly',
//   interval?: number (>=1, default 1 - "every N days/weeks/months"),
//   weekdays?: number[] (0-6, weekly only; defaults to item_date's weekday),
//   day_of_month?: number (1-31, monthly only; defaults to item_date's day
//     - months too short for that day are skipped, e.g. day 31 in April),
//   end: { type: 'until', date: 'YYYY-MM-DD' } | { type: 'count', count: number },
// }
function resolveOccurrenceDates(itemDate, repeat) {
  const { freq, interval, weekdays, day_of_month, end } = repeat ?? {};

  if (!REPEAT_FREQS.includes(freq)) {
    throw { status: 400, message: "Invalid repeat.freq" };
  }
  const step = Number.isInteger(interval) && interval > 0 ? interval : 1;
  if (step > 52) {
    throw { status: 400, message: "repeat.interval is too large" };
  }

  const start = new Date(`${itemDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    throw { status: 400, message: "Invalid item_date" };
  }

  let untilDate = null;
  let count = null;
  if (end?.type === "until") {
    untilDate = new Date(`${end.date}T00:00:00Z`);
    if (Number.isNaN(untilDate.getTime()) || untilDate < start) {
      throw { status: 400, message: "Invalid repeat.end.date" };
    }
  } else if (end?.type === "count") {
    count = Number.isInteger(end.count) ? end.count : NaN;
    if (!(count > 0) || count > MAX_REPEAT_OCCURRENCES) {
      throw {
        status: 400,
        message: `repeat.end.count must be between 1 and ${MAX_REPEAT_OCCURRENCES}`,
      };
    }
  } else {
    throw { status: 400, message: "repeat.end is required" };
  }

  if (freq === "weekly" && weekdays !== undefined) {
    if (
      !Array.isArray(weekdays) ||
      weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    ) {
      throw { status: 400, message: "Invalid repeat.weekdays" };
    }
  }
  if (freq === "monthly" && day_of_month !== undefined) {
    if (!Number.isInteger(day_of_month) || day_of_month < 1 || day_of_month > 31) {
      throw { status: 400, message: "Invalid repeat.day_of_month" };
    }
  }

  const dates = [];

  if (freq === "daily") {
    let cursor = start;
    while (untilDate ? cursor <= untilDate : dates.length < count) {
      dates.push(toDateStr(cursor));
      if (dates.length > MAX_REPEAT_OCCURRENCES) {
        throw {
          status: 400,
          message: `Too many occurrences (max ${MAX_REPEAT_OCCURRENCES})`,
        };
      }
      cursor = addUTCDays(cursor, step);
    }
  } else if (freq === "weekly") {
    const allowedWeekdays =
      Array.isArray(weekdays) && weekdays.length > 0
        ? new Set(weekdays)
        : new Set([start.getUTCDay()]);
    // Anchor the every-N-weeks cadence to the Sunday on/before `start`.
    const weekAnchor = addUTCDays(start, -start.getUTCDay());
    const scanLimit = addUTCDays(start, 366 * 5);
    let cursor = start;
    while (untilDate ? cursor <= untilDate : dates.length < count) {
      if (cursor > scanLimit) {
        throw { status: 400, message: "repeat.end is unreachable" };
      }
      const weeksSinceAnchor = Math.floor(
        (cursor.getTime() - weekAnchor.getTime()) / (7 * 86400000)
      );
      if (allowedWeekdays.has(cursor.getUTCDay()) && weeksSinceAnchor % step === 0) {
        dates.push(toDateStr(cursor));
        if (dates.length > MAX_REPEAT_OCCURRENCES) {
          throw {
            status: 400,
            message: `Too many occurrences (max ${MAX_REPEAT_OCCURRENCES})`,
          };
        }
        if (count !== null && dates.length >= count) break;
      }
      cursor = addUTCDays(cursor, 1);
    }
  } else if (freq === "monthly") {
    const dom =
      Number.isInteger(day_of_month) && day_of_month >= 1 && day_of_month <= 31
        ? day_of_month
        : start.getUTCDate();
    let monthCursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
    );
    const scanLimitMonths = 12 * 10;
    let monthsScanned = 0;
    while (true) {
      if (monthsScanned++ > scanLimitMonths) {
        throw { status: 400, message: "repeat.end is unreachable" };
      }
      const daysInMonth = new Date(
        Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 0)
      ).getUTCDate();
      if (dom <= daysInMonth) {
        const candidate = new Date(
          Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth(), dom)
        );
        if (candidate >= start) {
          if (untilDate && candidate > untilDate) break;
          dates.push(toDateStr(candidate));
          if (dates.length > MAX_REPEAT_OCCURRENCES) {
            throw {
              status: 400,
              message: `Too many occurrences (max ${MAX_REPEAT_OCCURRENCES})`,
            };
          }
          if (count !== null && dates.length >= count) break;
        }
      }
      monthCursor = addUTCMonths(monthCursor, step);
    }
  }

  if (dates.length === 0) {
    throw { status: 400, message: "repeat produced no occurrences" };
  }

  return dates;
}

async function getEventDateRange(eventId) {
  const { rows } = await pool.query(
    `SELECT start_date, end_date FROM nk_events WHERE id = $1`,
    [eventId]
  );
  return rows[0] ?? null;
}

// Itinerary items live within their parent event's date span - an item
// dated outside it would show up detached from the event it belongs to
// on every calendar view. `dates` is one or more 'YYYY-MM-DD' strings
// (a single item_date, or every generated occurrence of a repeat).
function datesWithinRange(dates, range) {
  return dates.every((d) => d >= range.start_date && d <= range.end_date);
}

async function coachSharedAthleteIds(coachId, athleteIds) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ac.athlete_id
     FROM nk_athlete_clubs ac
     JOIN nk_coach_clubs cc ON cc.club_id = ac.club_id
     WHERE cc.coach_id = $1 AND ac.athlete_id = ANY($2::int[])`,
    [coachId, athleteIds]
  );
  return new Set(rows.map((r) => r.athlete_id));
}

// Splits `eventAthletes` into what `user` may see and may edit: admins and
// coaches see the whole roster (coaches can only edit athletes they share a
// club with), an athlete sees/edits only their own entry.
async function athleteVisibility(user, eventAthletes) {
  let visible = [];
  let editableIds = new Set();
  if (user.is_admin) {
    visible = eventAthletes;
    editableIds = new Set(eventAthletes.map((a) => a.id));
  } else if (user.role === "coach" && user.coach_id) {
    visible = eventAthletes;
    editableIds = await coachSharedAthleteIds(
      user.coach_id,
      eventAthletes.map((a) => a.id)
    );
  } else if (user.role === "athlete" && user.athlete_id) {
    const self = eventAthletes.find((a) => a.id === user.athlete_id);
    if (self) {
      visible = [self];
      editableIds = new Set([user.athlete_id]);
    }
  }
  return { visible, editableIds };
}

// Attaches each item's per-athlete status/notes to it, scoped to what
// `user` is allowed to see (see `athleteVisibility`).
async function attachAthleteStatus(user, items, eventAthletes) {
  const itemIds = items.map((i) => i.id);
  const statusByItem = new Map();
  if (itemIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT item_id, athlete_id, status, notes
       FROM nk_event_item_athlete_status
       WHERE item_id = ANY($1::int[])`,
      [itemIds]
    );
    for (const row of rows) {
      if (!statusByItem.has(row.item_id)) statusByItem.set(row.item_id, new Map());
      statusByItem.get(row.item_id).set(row.athlete_id, row);
    }
  }

  const { visible, editableIds } = await athleteVisibility(user, eventAthletes);

  return items.map((item) => {
    const byAthlete = statusByItem.get(item.id);
    return {
      ...item,
      athlete_status: visible.map((a) => {
        const row = byAthlete?.get(a.id);
        return {
          athlete_id: a.id,
          status: row?.status ?? "pending",
          notes: row?.notes ?? null,
          can_edit: editableIds.has(a.id),
        };
      }),
    };
  });
}

// Same idea as `attachAthleteStatus` but for the event itself, since a
// simple single-block event (no itemized itinerary) still needs a
// per-athlete status/notes record of its own.
async function attachEventAthleteStatus(user, event, eventAthletes) {
  const { rows } = await pool.query(
    `SELECT athlete_id, status, notes
     FROM nk_event_athlete_status
     WHERE event_id = $1`,
    [event.id]
  );
  const byAthlete = new Map(rows.map((r) => [r.athlete_id, r]));

  const { visible, editableIds } = await athleteVisibility(user, eventAthletes);

  return {
    ...event,
    athlete_status: visible.map((a) => {
      const row = byAthlete.get(a.id);
      return {
        athlete_id: a.id,
        status: row?.status ?? "pending",
        notes: row?.notes ?? null,
        can_edit: editableIds.has(a.id),
      };
    }),
  };
}

// Computes, for an athlete viewer only, a single rolled-up status per event
// in a list: if the event has itemized itinerary items, any failed item
// makes the whole event "failed", all-completed makes it "completed",
// otherwise "pending"; with no items, the event's own status is used
// directly. Used to drive the swipe-to-complete/fail gesture and status
// badge on the Schedule List view's event rows. Returns `my_status: null`
// for non-athlete viewers (coach/admin), since a bulk swipe on someone
// else's behalf isn't a supported gesture.
async function attachMyEventStatus(user, events) {
  if (user.role !== "athlete" || !user.athlete_id || events.length === 0) {
    return events.map((e) => ({ ...e, my_status: null }));
  }

  const eventIds = events.map((e) => e.id);
  const { rows: itemAgg } = await pool.query(
    `SELECT i.event_id,
            COUNT(*)::int AS item_count,
            COUNT(*) FILTER (WHERE COALESCE(s.status, 'pending') = 'completed')::int AS completed_count,
            COUNT(*) FILTER (WHERE COALESCE(s.status, 'pending') = 'failed')::int AS failed_count
     FROM nk_event_items i
     LEFT JOIN nk_event_item_athlete_status s
       ON s.item_id = i.id AND s.athlete_id = $1
     WHERE i.event_id = ANY($2::int[])
     GROUP BY i.event_id`,
    [user.athlete_id, eventIds]
  );
  const itemAggByEvent = new Map(itemAgg.map((r) => [r.event_id, r]));

  const { rows: eventStatusRows } = await pool.query(
    `SELECT event_id, status FROM nk_event_athlete_status
     WHERE athlete_id = $1 AND event_id = ANY($2::int[])`,
    [user.athlete_id, eventIds]
  );
  const eventStatusByEvent = new Map(eventStatusRows.map((r) => [r.event_id, r.status]));

  return events.map((e) => {
    const agg = itemAggByEvent.get(e.id);
    let my_status = "pending";
    if (agg && agg.item_count > 0) {
      if (agg.failed_count > 0) my_status = "failed";
      else if (agg.completed_count === agg.item_count) my_status = "completed";
    } else {
      my_status = eventStatusByEvent.get(e.id) ?? "pending";
    }
    return { ...e, my_status };
  });
}

// Resolves which athlete_ids the caller is allowed to attach, or throws a
// {status, message} shaped error if the request is invalid/forbidden.
async function resolveAthleteIds(user, requested) {
  if (user.is_admin) {
    if (!Array.isArray(requested) || requested.length === 0) {
      throw { status: 400, message: "athlete_ids is required" };
    }
    return requested;
  }

  if (user.role === "athlete") {
    return [user.athlete_id];
  }

  if (user.role === "coach") {
    if (!Array.isArray(requested) || requested.length === 0) {
      throw { status: 400, message: "athlete_ids is required" };
    }
    const shared = await coachSharedAthleteIds(user.coach_id, requested);
    const notShared = requested.filter((id) => !shared.has(id));
    if (notShared.length > 0) {
      throw {
        status: 403,
        message: "You don't share a club with one or more of those athletes",
      };
    }
    return requested;
  }

  throw { status: 403, message: "Forbidden" };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Schedule.tsx's list view only loads a rolling window (2 weeks back/
// forward by default, lazy-loaded further on scroll) rather than the
// entire schedule - `from`/`to` are both optional so any other caller (or
// an older client) still gets everything, unfiltered, as before.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const hasRange = ISO_DATE_RE.test(from) && ISO_DATE_RE.test(to);

    let query;
    let params;

    if (req.user.is_admin) {
      query = `SELECT ${EVENT_FIELDS} FROM nk_events e
               ${hasRange ? "WHERE e.end_date >= $1 AND e.start_date <= $2" : ""}
               ORDER BY start_date`;
      params = hasRange ? [from, to] : [];
    } else if (req.user.role === "athlete" && req.user.athlete_id) {
      query = `SELECT ${EVENT_FIELDS} FROM nk_events e
               WHERE EXISTS (
                 SELECT 1 FROM nk_event_athletes ea
                 WHERE ea.event_id = e.id AND ea.athlete_id = $1
               )
               ${hasRange ? "AND e.end_date >= $2 AND e.start_date <= $3" : ""}
               ORDER BY start_date`;
      params = hasRange
        ? [req.user.athlete_id, from, to]
        : [req.user.athlete_id];
    } else if (req.user.role === "coach" && req.user.coach_id) {
      query = `SELECT DISTINCT ${EVENT_FIELDS} FROM nk_events e
               WHERE EXISTS (
                 SELECT 1 FROM nk_event_athletes ea
                 JOIN nk_athlete_clubs ac ON ac.athlete_id = ea.athlete_id
                 JOIN nk_coach_clubs cc ON cc.club_id = ac.club_id
                 WHERE ea.event_id = e.id AND cc.coach_id = $1
               )
               ${hasRange ? "AND e.end_date >= $2 AND e.start_date <= $3" : ""}
               ORDER BY start_date`;
      params = hasRange ? [req.user.coach_id, from, to] : [req.user.coach_id];
    } else {
      return res.json({ events: [] });
    }

    const { rows } = await pool.query(query, params);
    const events = await attachMyEventStatus(req.user, rows);
    res.json({ events });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      title,
      event_type,
      start_date,
      end_date,
      start_time,
      end_time,
      location,
      venue_id,
      notes,
      training_module_id,
      kata_id,
      repeat,
    } = req.body ?? {};

    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: { message: "Title is required" } });
    }
    if (!EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ error: { message: "Invalid event_type" } });
    }
    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ error: { message: "start_date and end_date are required" } });
    }

    // A recurring event is generated the same way a recurring itinerary
    // item is - one independent, independently editable/deletable row per
    // occurrence - except each occurrence keeps the same day-span as the
    // original (a 2-day event repeating weekly generates a new 2-day
    // event each week, anchored to start_date).
    const spanDays = daysBetween(start_date, end_date);
    if (spanDays < 0) {
      return res
        .status(400)
        .json({ error: { message: "end_date must not be before start_date" } });
    }

    let startDates = [start_date];
    let recurrenceId = null;
    if (repeat) {
      try {
        startDates = resolveOccurrenceDates(start_date, repeat);
      } catch (err) {
        if (err.status) {
          return res.status(err.status).json({ error: { message: err.message } });
        }
        throw err;
      }
      recurrenceId = crypto.randomUUID();
    }

    let athleteIds;
    try {
      athleteIds = await resolveAthleteIds(req.user, req.body?.athlete_ids);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: { message: err.message } });
      }
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const events = [];
      for (const occurrenceStart of startDates) {
        const occurrenceEnd = toDateStr(addUTCDays(occurrenceStart, spanDays));
        const { rows } = await client.query(
          `INSERT INTO nk_events
             (title, event_type, start_date, end_date, start_time, end_time, location,
              venue_id, kata_id, notes, training_module_id, recurrence_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING ${EVENT_FIELDS}`,
          [
            title,
            event_type,
            occurrenceStart,
            occurrenceEnd,
            start_time ?? null,
            end_time ?? null,
            location,
            venue_id ?? null,
            event_type === "kata_performance" ? kata_id ?? null : null,
            notes,
            event_type === "training" ? training_module_id ?? null : null,
            recurrenceId,
          ]
        );
        const event = rows[0];
        for (const athleteId of athleteIds) {
          await client.query(
            `INSERT INTO nk_event_athletes (event_id, athlete_id) VALUES ($1, $2)`,
            [event.id, athleteId]
          );
        }
        events.push(event);
      }

      await client.query("COMMIT");
      if (repeat) {
        res.status(201).json({ events, athleteIds });
      } else {
        res.status(201).json({ event: events[0], athleteIds });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res.status(400).json({
          error: { message: "One or more athlete IDs, the venue, or the kata do not exist" },
        });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

// Flattened personal training history for the current athlete: every
// itinerary item and every simple direct-linked event of type 'training'
// they're assigned to, each with the linked module (if any), their own
// status/notes, and enough of the schedule (date/time) for the UI to show
// "time spent" as the scheduled duration. Registered before "/:id" so it
// isn't swallowed by that wildcard route.
router.get(
  "/training-log",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "athlete" || !req.user.athlete_id) {
      return res.status(403).json({ error: { message: "Athletes only" } });
    }

    const { rows } = await pool.query(
      `SELECT 'item' AS source, i.id, i.event_id, i.title,
              i.item_date AS date, i.start_time, i.end_time,
              tm.title AS module_title,
              COALESCE(s.status, 'pending') AS status, s.notes
       FROM nk_event_items i
       JOIN nk_event_athletes ea ON ea.event_id = i.event_id
       LEFT JOIN nk_training_modules tm ON tm.id = i.training_module_id
       LEFT JOIN nk_event_item_athlete_status s
         ON s.item_id = i.id AND s.athlete_id = ea.athlete_id
       WHERE i.item_type = 'training' AND ea.athlete_id = $1

       UNION ALL

       SELECT 'event' AS source, e.id, e.id AS event_id, e.title,
              e.start_date AS date, e.start_time, e.end_time,
              tm.title AS module_title,
              COALESCE(s.status, 'pending') AS status, s.notes
       FROM nk_events e
       JOIN nk_event_athletes ea ON ea.event_id = e.id
       LEFT JOIN nk_training_modules tm ON tm.id = e.training_module_id
       LEFT JOIN nk_event_athlete_status s
         ON s.event_id = e.id AND s.athlete_id = ea.athlete_id
       WHERE e.event_type = 'training' AND ea.athlete_id = $1

       ORDER BY date DESC, start_time DESC NULLS LAST`,
      [req.user.athlete_id]
    );

    res.json({ entries: rows });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT ${EVENT_FIELDS} FROM nk_events WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }

    const { rows: athletes } = await pool.query(
      `SELECT a.id, a.first_name, a.last_name
       FROM nk_event_athletes ea
       JOIN nk_athletes a ON a.id = ea.athlete_id
       WHERE ea.event_id = $1
       ORDER BY a.last_name, a.first_name`,
      [req.params.id]
    );

    const { rows: items } = await pool.query(
      `SELECT ${ITEM_FIELDS} FROM nk_event_items
       WHERE event_id = $1
       ORDER BY item_date, start_time NULLS LAST`,
      [req.params.id]
    );
    const itemsWithStatus = await attachAthleteStatus(req.user, items, athletes);
    const event = await attachEventAthleteStatus(req.user, rows[0], athletes);

    res.json({ event, athletes, items: itemsWithStatus });
  })
);

// Every competition result tied to this event, whether captured against
// the event itself or against one of its nested itinerary items - same
// visibility gate as the event detail view itself (isEventEditor), so
// anyone who can see this schedule item's athlete list can see what's
// been recorded for it.
router.get(
  "/:id/competition-results",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.athlete_id, a.first_name, a.last_name, r.event_id, r.event_item_id,
              r.competition_name, r.competition_date, r.location, r.rounds_completed,
              r.final_position, r.notes, r.created_at
       FROM nk_competition_results r
       JOIN nk_athletes a ON a.id = r.athlete_id
       WHERE r.event_id = $1
          OR r.event_item_id IN (SELECT id FROM nk_event_items WHERE event_id = $1)
       ORDER BY r.competition_date DESC, r.created_at DESC`,
      [req.params.id]
    );
    res.json({ results: rows });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const {
      title,
      event_type,
      start_date,
      end_date,
      start_time,
      end_time,
      location,
      venue_id,
      notes,
      training_module_id,
      kata_id,
    } = body;

    if (event_type !== undefined && !EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ error: { message: "Invalid event_type" } });
    }

    const fields = {
      title,
      event_type,
      start_date,
      end_date,
      start_time,
      end_time,
      location,
      venue_id,
      notes,
      training_module_id,
      kata_id,
    };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE nk_events SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING ${EVENT_FIELDS}`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }

    const { rows: athletes } = await pool.query(
      `SELECT a.id, a.first_name, a.last_name
       FROM nk_event_athletes ea
       JOIN nk_athletes a ON a.id = ea.athlete_id
       WHERE ea.event_id = $1`,
      [req.params.id]
    );
    const event = await attachEventAthleteStatus(req.user, rows[0], athletes);
    res.json({ event });
  })
);

// Deletes every event sharing this event's recurrence_id (i.e. the whole
// series it was generated as part of), not just this one occurrence - same
// idea as the itinerary item series delete below. An extra path segment
// so it can't be shadowed by the plain single-event delete.
router.delete(
  "/:id/series",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT recurrence_id FROM nk_events WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }
    const recurrenceId = rows[0].recurrence_id;
    if (!recurrenceId) {
      return res
        .status(400)
        .json({ error: { message: "This event is not part of a recurring series" } });
    }

    const { rows: deleted } = await pool.query(
      `DELETE FROM nk_events WHERE recurrence_id = $1 RETURNING id`,
      [recurrenceId]
    );
    res.json({ deleted_ids: deleted.map((r) => r.id) });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(`DELETE FROM nk_events WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }
    res.status(204).end();
  })
);

router.put(
  "/:id/athletes",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    let athleteIds;
    try {
      athleteIds = await resolveAthleteIds(req.user, req.body?.athlete_ids);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: { message: err.message } });
      }
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM nk_event_athletes WHERE event_id = $1`, [
        req.params.id,
      ]);
      for (const athleteId of athleteIds) {
        await client.query(
          `INSERT INTO nk_event_athletes (event_id, athlete_id) VALUES ($1, $2)`,
          [req.params.id, athleteId]
        );
      }
      await client.query("COMMIT");
      res.json({ athleteIds });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "One or more athlete IDs do not exist" } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

router.patch(
  "/:id/athletes/:athleteId",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const athleteId = Number(req.params.athleteId);

    const { rows: rosterRows } = await pool.query(
      `SELECT 1 FROM nk_event_athletes WHERE event_id = $1 AND athlete_id = $2`,
      [req.params.id, athleteId]
    );
    if (rosterRows.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "Athlete is not on this event" } });
    }

    let allowed = req.user.is_admin;
    if (!allowed && req.user.role === "athlete") {
      allowed = req.user.athlete_id === athleteId;
    }
    if (!allowed && req.user.role === "coach" && req.user.coach_id) {
      const shared = await coachSharedAthleteIds(req.user.coach_id, [athleteId]);
      allowed = shared.has(athleteId);
    }
    if (!allowed) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const { status, notes } = body;
    if (status !== undefined && !STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: { message: "Invalid status" } });
    }

    const fields = { status, notes };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    await pool.query(
      `INSERT INTO nk_event_athlete_status (event_id, athlete_id)
       VALUES ($1, $2) ON CONFLICT (event_id, athlete_id) DO NOTHING`,
      [req.params.id, athleteId]
    );

    values.push(req.params.id, athleteId);
    const { rows } = await pool.query(
      `UPDATE nk_event_athlete_status
       SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE event_id = $${values.length - 1} AND athlete_id = $${values.length}
       RETURNING event_id, athlete_id, status, notes`,
      values
    );

    res.json({ status: { ...rows[0], can_edit: true } });
  })
);

router.get(
  "/:id/items",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows: athletes } = await pool.query(
      `SELECT a.id, a.first_name, a.last_name
       FROM nk_event_athletes ea
       JOIN nk_athletes a ON a.id = ea.athlete_id
       WHERE ea.event_id = $1`,
      [req.params.id]
    );

    const { rows } = await pool.query(
      `SELECT ${ITEM_FIELDS} FROM nk_event_items
       WHERE event_id = $1
       ORDER BY item_date, start_time NULLS LAST`,
      [req.params.id]
    );
    const items = await attachAthleteStatus(req.user, rows, athletes);
    res.json({ items });
  })
);

router.post(
  "/:id/items",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      item_type,
      title,
      item_date,
      start_time,
      end_time,
      notes,
      training_module_id,
      kata_id,
      repeat,
    } = req.body ?? {};

    if (!ITEM_TYPES.includes(item_type)) {
      return res.status(400).json({ error: { message: "Invalid item_type" } });
    }
    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: { message: "Title is required" } });
    }
    if (!item_date) {
      return res.status(400).json({ error: { message: "item_date is required" } });
    }
    if (!start_time || !end_time) {
      return res
        .status(400)
        .json({ error: { message: "start_time and end_time are required" } });
    }

    let dates = [item_date];
    let recurrenceId = null;
    if (repeat) {
      try {
        dates = resolveOccurrenceDates(item_date, repeat);
      } catch (err) {
        if (err.status) {
          return res.status(err.status).json({ error: { message: err.message } });
        }
        throw err;
      }
      recurrenceId = crypto.randomUUID();
    }

    const eventRange = await getEventDateRange(req.params.id);
    if (!eventRange) {
      return res.status(404).json({ error: { message: "Event not found" } });
    }
    if (!datesWithinRange(dates, eventRange)) {
      return res.status(400).json({
        error: {
          message: `Itinerary items must fall within the event's date range (${eventRange.start_date} to ${eventRange.end_date})`,
        },
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const items = [];
      for (const date of dates) {
        const { rows } = await client.query(
          `INSERT INTO nk_event_items
             (event_id, item_type, title, item_date, start_time, end_time, notes,
              training_module_id, kata_id, recurrence_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${ITEM_FIELDS}`,
          [
            req.params.id,
            item_type,
            title,
            date,
            start_time,
            end_time,
            notes,
            training_module_id ?? null,
            kata_id ?? null,
            recurrenceId,
          ]
        );
        items.push(rows[0]);
      }
      await client.query("COMMIT");

      const { rows: athletes } = await pool.query(
        `SELECT a.id, a.first_name, a.last_name
         FROM nk_event_athletes ea
         JOIN nk_athletes a ON a.id = ea.athlete_id
         WHERE ea.event_id = $1`,
        [req.params.id]
      );
      const itemsWithStatus = await attachAthleteStatus(req.user, items, athletes);

      if (repeat) {
        res.status(201).json({ items: itemsWithStatus });
      } else {
        res.status(201).json({ item: itemsWithStatus[0] });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.patch(
  "/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const {
      item_type,
      title,
      item_date,
      start_time,
      end_time,
      notes,
      training_module_id,
      kata_id,
    } = body;

    if (item_type !== undefined && !ITEM_TYPES.includes(item_type)) {
      return res.status(400).json({ error: { message: "Invalid item_type" } });
    }
    if ("start_time" in body && !start_time) {
      return res.status(400).json({ error: { message: "start_time is required" } });
    }
    if ("end_time" in body && !end_time) {
      return res.status(400).json({ error: { message: "end_time is required" } });
    }
    if ("item_date" in body && item_date) {
      const eventRange = await getEventDateRange(req.params.id);
      if (!eventRange) {
        return res.status(404).json({ error: { message: "Event not found" } });
      }
      if (!datesWithinRange([item_date], eventRange)) {
        return res.status(400).json({
          error: {
            message: `Itinerary items must fall within the event's date range (${eventRange.start_date} to ${eventRange.end_date})`,
          },
        });
      }
    }

    const fields = {
      item_type,
      title,
      item_date,
      start_time,
      end_time,
      notes,
      training_module_id,
      kata_id,
    };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    values.push(req.params.itemId, req.params.id);
    const { rows } = await pool.query(
      `UPDATE nk_event_items SET ${setClauses.join(", ")}
       WHERE id = $${values.length - 1} AND event_id = $${values.length}
       RETURNING ${ITEM_FIELDS}`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Item not found" } });
    }

    const { rows: athletes } = await pool.query(
      `SELECT a.id, a.first_name, a.last_name
       FROM nk_event_athletes ea
       JOIN nk_athletes a ON a.id = ea.athlete_id
       WHERE ea.event_id = $1`,
      [req.params.id]
    );
    const [item] = await attachAthleteStatus(req.user, rows, athletes);
    res.json({ item });
  })
);

router.patch(
  "/:id/items/:itemId/athletes/:athleteId",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const athleteId = Number(req.params.athleteId);

    const { rows: itemRows } = await pool.query(
      `SELECT 1 FROM nk_event_items WHERE id = $1 AND event_id = $2`,
      [req.params.itemId, req.params.id]
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ error: { message: "Item not found" } });
    }

    const { rows: rosterRows } = await pool.query(
      `SELECT 1 FROM nk_event_athletes WHERE event_id = $1 AND athlete_id = $2`,
      [req.params.id, athleteId]
    );
    if (rosterRows.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "Athlete is not on this event" } });
    }

    let allowed = req.user.is_admin;
    if (!allowed && req.user.role === "athlete") {
      allowed = req.user.athlete_id === athleteId;
    }
    if (!allowed && req.user.role === "coach" && req.user.coach_id) {
      const shared = await coachSharedAthleteIds(req.user.coach_id, [athleteId]);
      allowed = shared.has(athleteId);
    }
    if (!allowed) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const { status, notes } = body;
    if (status !== undefined && !STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: { message: "Invalid status" } });
    }

    const fields = { status, notes };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    await pool.query(
      `INSERT INTO nk_event_item_athlete_status (item_id, athlete_id)
       VALUES ($1, $2) ON CONFLICT (item_id, athlete_id) DO NOTHING`,
      [req.params.itemId, athleteId]
    );

    values.push(req.params.itemId, athleteId);
    const { rows } = await pool.query(
      `UPDATE nk_event_item_athlete_status
       SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE item_id = $${values.length - 1} AND athlete_id = $${values.length}
       RETURNING item_id, athlete_id, status, notes`,
      values
    );

    res.json({ status: { ...rows[0], can_edit: true } });
  })
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
    if (req.user.role !== "athlete" || !req.user.athlete_id) {
      return res.status(403).json({
        error: { message: "Only an assigned athlete can bulk-update their own status" },
      });
    }

    const { status } = req.body ?? {};
    if (!STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: { message: "Invalid status" } });
    }

    const athleteId = req.user.athlete_id;
    const { rows: items } = await pool.query(
      `SELECT id FROM nk_event_items WHERE event_id = $1`,
      [req.params.id]
    );

    if (items.length === 0) {
      await pool.query(
        `INSERT INTO nk_event_athlete_status (event_id, athlete_id)
         VALUES ($1, $2) ON CONFLICT (event_id, athlete_id) DO NOTHING`,
        [req.params.id, athleteId]
      );
      await pool.query(
        `UPDATE nk_event_athlete_status SET status = $1, updated_at = NOW()
         WHERE event_id = $2 AND athlete_id = $3`,
        [status, req.params.id, athleteId]
      );
    } else {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of items) {
          await client.query(
            `INSERT INTO nk_event_item_athlete_status (item_id, athlete_id)
             VALUES ($1, $2) ON CONFLICT (item_id, athlete_id) DO NOTHING`,
            [item.id, athleteId]
          );
          await client.query(
            `UPDATE nk_event_item_athlete_status SET status = $1, updated_at = NOW()
             WHERE item_id = $2 AND athlete_id = $3`,
            [status, item.id, athleteId]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    res.json({ status });
  })
);

// Deletes every item sharing this item's recurrence_id (i.e. the whole
// series it was generated as part of), not just this one occurrence.
// Registered ahead of the plain single-item delete below since it's a
// more specific path (an extra "series" segment) - no route-shadowing risk.
router.delete(
  "/:id/items/:itemId/series",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT recurrence_id FROM nk_event_items WHERE id = $1 AND event_id = $2`,
      [req.params.itemId, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Item not found" } });
    }
    const recurrenceId = rows[0].recurrence_id;
    if (!recurrenceId) {
      return res
        .status(400)
        .json({ error: { message: "This item is not part of a recurring series" } });
    }

    const { rows: deleted } = await pool.query(
      `DELETE FROM nk_event_items WHERE event_id = $1 AND recurrence_id = $2 RETURNING id`,
      [req.params.id, recurrenceId]
    );
    res.json({ deleted_ids: deleted.map((r) => r.id) });
  })
);

router.delete(
  "/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    if (!(await isEventEditor(req.user, req.params.id))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_event_items WHERE id = $1 AND event_id = $2`,
      [req.params.itemId, req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Item not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
