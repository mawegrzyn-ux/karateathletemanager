const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { isEventEditor } = require("../utils/permissions");

const router = Router();

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
const REPEAT_FREQS = ["daily", "weekly"];
const MAX_REPEAT_OCCURRENCES = 60;

const EVENT_FIELDS = `id, title, event_type, start_date, end_date, start_time, end_time, location, notes, training_module_id, created_at`;
const ITEM_FIELDS = `id, event_id, item_type, title, item_date, start_time, end_time, notes, training_module_id, kata_id`;

router.use(authorize());

// Expands a `repeat` request ({freq, until, weekdays?}) starting from
// item_date into the list of occurrence dates ('YYYY-MM-DD' strings),
// or throws a {status, message} error. Caps at MAX_REPEAT_OCCURRENCES.
function resolveOccurrenceDates(itemDate, repeat) {
  const { freq, until, weekdays } = repeat ?? {};

  if (!REPEAT_FREQS.includes(freq)) {
    throw { status: 400, message: "Invalid repeat.freq" };
  }
  if (!until) {
    throw { status: 400, message: "repeat.until is required" };
  }

  const start = new Date(`${itemDate}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw { status: 400, message: "Invalid repeat.until" };
  }

  let allowedWeekdays = null;
  if (freq === "weekly") {
    allowedWeekdays =
      Array.isArray(weekdays) && weekdays.length > 0
        ? new Set(weekdays)
        : new Set([start.getUTCDay()]);
  }

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (!allowedWeekdays || allowedWeekdays.has(cursor.getUTCDay())) {
      dates.push(cursor.toISOString().slice(0, 10));
      if (dates.length > MAX_REPEAT_OCCURRENCES) {
        throw {
          status: 400,
          message: `Too many occurrences (max ${MAX_REPEAT_OCCURRENCES})`,
        };
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
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

// Attaches each item's per-athlete completed/notes to it, scoped to what
// `user` is allowed to see (see `athleteVisibility`).
async function attachAthleteStatus(user, items, eventAthletes) {
  const itemIds = items.map((i) => i.id);
  const statusByItem = new Map();
  if (itemIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT item_id, athlete_id, completed, notes
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
          completed: row?.completed ?? false,
          notes: row?.notes ?? null,
          can_edit: editableIds.has(a.id),
        };
      }),
    };
  });
}

// Same idea as `attachAthleteStatus` but for the event itself, since a
// simple single-block event (no itemized itinerary) still needs a
// per-athlete completed/notes record of its own.
async function attachEventAthleteStatus(user, event, eventAthletes) {
  const { rows } = await pool.query(
    `SELECT athlete_id, completed, notes
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
        completed: row?.completed ?? false,
        notes: row?.notes ?? null,
        can_edit: editableIds.has(a.id),
      };
    }),
  };
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

router.get(
  "/",
  asyncHandler(async (req, res) => {
    let query;
    let params;

    if (req.user.is_admin) {
      query = `SELECT ${EVENT_FIELDS} FROM nk_events ORDER BY start_date`;
      params = [];
    } else if (req.user.role === "athlete" && req.user.athlete_id) {
      query = `SELECT ${EVENT_FIELDS} FROM nk_events e
               WHERE EXISTS (
                 SELECT 1 FROM nk_event_athletes ea
                 WHERE ea.event_id = e.id AND ea.athlete_id = $1
               )
               ORDER BY start_date`;
      params = [req.user.athlete_id];
    } else if (req.user.role === "coach" && req.user.coach_id) {
      query = `SELECT DISTINCT ${EVENT_FIELDS} FROM nk_events e
               WHERE EXISTS (
                 SELECT 1 FROM nk_event_athletes ea
                 JOIN nk_athlete_clubs ac ON ac.athlete_id = ea.athlete_id
                 JOIN nk_coach_clubs cc ON cc.club_id = ac.club_id
                 WHERE ea.event_id = e.id AND cc.coach_id = $1
               )
               ORDER BY start_date`;
      params = [req.user.coach_id];
    } else {
      return res.json({ events: [] });
    }

    const { rows } = await pool.query(query, params);
    res.json({ events: rows });
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
      notes,
      training_module_id,
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
      const { rows } = await client.query(
        `INSERT INTO nk_events
           (title, event_type, start_date, end_date, start_time, end_time, location, notes, training_module_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${EVENT_FIELDS}`,
        [
          title,
          event_type,
          start_date,
          end_date,
          start_time ?? null,
          end_time ?? null,
          location,
          notes,
          event_type === "training" ? training_module_id ?? null : null,
        ]
      );
      const event = rows[0];

      for (const athleteId of athleteIds) {
        await client.query(
          `INSERT INTO nk_event_athletes (event_id, athlete_id) VALUES ($1, $2)`,
          [event.id, athleteId]
        );
      }

      await client.query("COMMIT");
      res.status(201).json({ event, athleteIds });
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
      notes,
      training_module_id,
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
      notes,
      training_module_id,
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
    res.json({ event: rows[0] });
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
    const { completed, notes } = body;
    if (completed !== undefined && typeof completed !== "boolean") {
      return res
        .status(400)
        .json({ error: { message: "completed must be a boolean" } });
    }

    const fields = { completed, notes };
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
       RETURNING event_id, athlete_id, completed, notes`,
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
    if (repeat) {
      try {
        dates = resolveOccurrenceDates(item_date, repeat);
      } catch (err) {
        if (err.status) {
          return res.status(err.status).json({ error: { message: err.message } });
        }
        throw err;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const items = [];
      for (const date of dates) {
        const { rows } = await client.query(
          `INSERT INTO nk_event_items
             (event_id, item_type, title, item_date, start_time, end_time, notes,
              training_module_id, kata_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    const { completed, notes } = body;
    if (completed !== undefined && typeof completed !== "boolean") {
      return res
        .status(400)
        .json({ error: { message: "completed must be a boolean" } });
    }

    const fields = { completed, notes };
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
       RETURNING item_id, athlete_id, completed, notes`,
      values
    );

    res.json({ status: { ...rows[0], can_edit: true } });
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
