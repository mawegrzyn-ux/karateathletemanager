// Training Programmes: a weekly pattern of training sessions (weekday +
// training module) repeated over duration_weeks. An athlete (or their
// coach, on their behalf) "enrolls" from a chosen start date, which bulk-
// generates the individual nk_events rows the same way events.js's own
// `repeat` feature generates a batch of occurrences - reusing that file's
// copyModuleItemsToEventItems/syncToGoogleCalendar/EVENT_FIELDS (attached
// to its router export) rather than duplicating them.
const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { resolveAthleteIds, isEnrollmentManager } = require("../utils/permissions");
const googleCalendar = require("../utils/googleCalendar");
const eventsRouter = require("./events");

const { copyModuleItemsToEventItems, syncToGoogleCalendar, EVENT_FIELDS } = eventsRouter;

const router = Router();

// A season at 2-3x/week, generously - each unit here is a full multi-item
// event (not a bare occurrence like the unrelated MAX_REPEAT_OCCURRENCES
// in events.js), so this stays deliberately lower.
const MAX_PROGRAM_ENROLLMENT_EVENTS = 40;

const PROGRAM_QUERY = `
  SELECT p.id, p.title, p.explanation, p.type_id, tmt.name AS type_name,
    p.icon, p.duration_weeks, p.archived, p.created_at, p.updated_at,
    COALESCE(
      json_agg(json_build_object(
        'id', s.id, 'weekday', s.weekday, 'position', s.position,
        'training_module_id', s.training_module_id,
        'module_title', tm.title, 'module_icon', tm.icon
      ) ORDER BY s.weekday, s.position) FILTER (WHERE s.id IS NOT NULL),
      '[]'
    ) AS sessions
  FROM nk_training_programs p
  LEFT JOIN nk_training_module_types tmt ON tmt.id = p.type_id
  LEFT JOIN nk_training_program_sessions s ON s.program_id = p.id
  LEFT JOIN nk_training_modules tm ON tm.id = s.training_module_id
  GROUP BY p.id, tmt.name
`;

function validIcon(icon) {
  return icon == null || (typeof icon === "string" && icon.length <= 8);
}

function validDurationWeeks(weeks) {
  return Number.isInteger(weeks) && weeks >= 1 && weeks <= 52;
}

router.use(authorize());

// Replaces a programme's whole weekly template - same delete-then-
// reinsert shape as trainingModules.js's insertItems. Sessions are
// grouped by weekday in request order to assign `position`, so multiple
// sessions on one weekday (an AM/PM double, etc.) stay ordered.
async function insertSessions(client, programId, sessions) {
  if (!Array.isArray(sessions)) return;
  await client.query(`DELETE FROM nk_training_program_sessions WHERE program_id = $1`, [
    programId,
  ]);

  const positionByWeekday = new Map();
  for (const s of sessions) {
    const weekday = Number(s?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw { status: 400, message: "Each session needs a weekday between 0 and 6" };
    }
    if (!s?.training_module_id) {
      throw { status: 400, message: "Each session needs a training_module_id" };
    }
    const position = positionByWeekday.get(weekday) ?? 0;
    positionByWeekday.set(weekday, position + 1);
    await client.query(
      `INSERT INTO nk_training_program_sessions (program_id, weekday, training_module_id, position)
       VALUES ($1, $2, $3, $4)`,
      [programId, weekday, s.training_module_id, position]
    );
  }
}

// First date >= startDateStr matching `weekday`, then + weekOffset weeks.
function occurrenceDate(startDateStr, weekday, weekOffset) {
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const daysUntil = (weekday - start.getUTCDay() + 7) % 7;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + daysUntil + weekOffset * 7);
  return d.toISOString().slice(0, 10);
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${PROGRAM_QUERY} ORDER BY p.title`);
    res.json({ programs: rows });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${PROGRAM_QUERY} HAVING p.id = $1`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Program not found" } });
    }
    res.json({ program: rows[0] });
  })
);

router.post(
  "/",
  authorize("coach"),
  asyncHandler(async (req, res) => {
    const { title, explanation, type_id, icon, duration_weeks, sessions } = req.body ?? {};

    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: { message: "Title is required" } });
    }
    if (!validIcon(icon)) {
      return res
        .status(400)
        .json({ error: { message: "icon must be a string of 8 characters or fewer" } });
    }
    const weeks = Number(duration_weeks);
    if (!validDurationWeeks(weeks)) {
      return res
        .status(400)
        .json({ error: { message: "duration_weeks must be a whole number between 1 and 52" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO nk_training_programs (title, explanation, type_id, icon, duration_weeks)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [title, explanation ?? null, type_id ?? null, icon || null, weeks]
      );
      const programId = rows[0].id;
      await insertSessions(client, programId, sessions);
      await client.query("COMMIT");

      const { rows: full } = await client.query(`${PROGRAM_QUERY} HAVING p.id = $1`, [
        programId,
      ]);
      res.status(201).json({ program: full[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.status) {
        return res.status(err.status).json({ error: { message: err.message } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

router.patch(
  "/:id",
  authorize("coach"),
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const { title, explanation, type_id, icon, duration_weeks, archived, sessions } = body;

    if ("icon" in body && !validIcon(icon)) {
      return res
        .status(400)
        .json({ error: { message: "icon must be a string of 8 characters or fewer" } });
    }
    if ("duration_weeks" in body && !validDurationWeeks(Number(duration_weeks))) {
      return res
        .status(400)
        .json({ error: { message: "duration_weeks must be a whole number between 1 and 52" } });
    }

    const fields = { title, explanation, type_id, icon, duration_weeks, archived };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(key === "icon" && value === "" ? null : value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (setClauses.length > 0) {
        values.push(req.params.id);
        const { rowCount } = await client.query(
          `UPDATE nk_training_programs SET ${setClauses.join(", ")}, updated_at = NOW()
           WHERE id = $${values.length}`,
          values
        );
        if (rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: { message: "Program not found" } });
        }
      }

      if ("sessions" in body) {
        await insertSessions(client, req.params.id, sessions);
      }

      await client.query("COMMIT");

      const { rows: full } = await pool.query(`${PROGRAM_QUERY} HAVING p.id = $1`, [
        req.params.id,
      ]);
      if (full.length === 0) {
        return res.status(404).json({ error: { message: "Program not found" } });
      }
      res.json({ program: full[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.status) {
        return res.status(err.status).json({ error: { message: err.message } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/:id",
  authorize("coach"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM nk_training_programs WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Program not found" } });
    }
    res.status(204).end();
  })
);

// Bulk-generates the actual Schedule events for one or more athletes,
// same "insert in a transaction, then fire-and-forget Google Calendar
// sync per event after commit" shape events.js's own POST / uses for its
// `repeat` feature. resolveAthleteIds does the exact same self-vs-coach-
// vs-admin branching POST /events already relies on, so a coach bulk-
// enrolling a squad and an athlete self-enrolling are the same code path.
router.post(
  "/:id/enroll",
  asyncHandler(async (req, res) => {
    const { start_date, athlete_ids } = req.body ?? {};
    if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return res
        .status(400)
        .json({ error: { message: "start_date (YYYY-MM-DD) is required" } });
    }

    let athleteIds;
    try {
      athleteIds = await resolveAthleteIds(req.user, athlete_ids);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: { message: err.message } });
      }
      throw err;
    }

    const { rows: programRows } = await pool.query(
      `SELECT id, duration_weeks FROM nk_training_programs WHERE id = $1`,
      [req.params.id]
    );
    if (programRows.length === 0) {
      return res.status(404).json({ error: { message: "Program not found" } });
    }
    const program = programRows[0];

    const { rows: sessions } = await pool.query(
      `SELECT weekday, training_module_id FROM nk_training_program_sessions
       WHERE program_id = $1 ORDER BY weekday, position`,
      [req.params.id]
    );
    if (sessions.length === 0) {
      return res
        .status(400)
        .json({ error: { message: "This program has no sessions defined yet" } });
    }

    const totalEvents = program.duration_weeks * sessions.length;
    if (totalEvents > MAX_PROGRAM_ENROLLMENT_EVENTS) {
      return res.status(400).json({
        error: {
          message: `This program would generate ${totalEvents} events, over the limit of ${MAX_PROGRAM_ENROLLMENT_EVENTS}`,
        },
      });
    }

    // Pre-fetched once per distinct module (not once per occurrence) since
    // the weekly pattern repeats identically every week - see
    // copyModuleItemsToEventItems's `preloadedItems` param in events.js.
    const moduleIds = [...new Set(sessions.map((s) => s.training_module_id).filter(Boolean))];
    const moduleInfoById = new Map();
    if (moduleIds.length > 0) {
      const { rows: moduleRows } = await pool.query(
        `SELECT id, title FROM nk_training_modules WHERE id = ANY($1::int[])`,
        [moduleIds]
      );
      const { rows: itemRows } = await pool.query(
        `SELECT module_id, item_type, name, explanation, sets, reps, duration_seconds, distance_meters
         FROM nk_training_module_items WHERE module_id = ANY($1::int[]) ORDER BY module_id, position`,
        [moduleIds]
      );
      for (const m of moduleRows) {
        moduleInfoById.set(m.id, { title: m.title, items: [] });
      }
      for (const it of itemRows) {
        moduleInfoById.get(it.module_id)?.items.push(it);
      }
    }

    const createdEvents = [];
    for (const athleteId of athleteIds) {
      const { rows: clubRows } = await pool.query(
        `SELECT club_id FROM nk_athlete_clubs WHERE athlete_id = $1 ORDER BY club_id LIMIT 1`,
        [athleteId]
      );
      const clubId = clubRows[0]?.club_id ?? null;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: enrollRows } = await client.query(
          `INSERT INTO nk_training_program_enrollments
             (training_program_id, athlete_id, created_by_user_id, start_date)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [program.id, athleteId, req.user.id, start_date]
        );
        const enrollmentId = enrollRows[0].id;

        let sequenceIndex = 0;
        for (let week = 0; week < program.duration_weeks; week++) {
          for (const session of sessions) {
            const moduleInfo = moduleInfoById.get(session.training_module_id);
            const date = occurrenceDate(start_date, session.weekday, week);

            const { rows: eventRows } = await client.query(
              `INSERT INTO nk_events
                 (title, event_type, club_id, start_date, end_date, training_module_id,
                  program_enrollment_id, sequence_index)
               VALUES ($1, 'training', $2, $3, $3, $4, $5, $6)
               RETURNING ${EVENT_FIELDS}`,
              [
                moduleInfo?.title || "Training",
                clubId,
                date,
                session.training_module_id,
                enrollmentId,
                sequenceIndex,
              ]
            );
            const event = eventRows[0];
            await client.query(
              `INSERT INTO nk_event_athletes (event_id, athlete_id) VALUES ($1, $2)`,
              [event.id, athleteId]
            );
            if (moduleInfo && moduleInfo.items.length > 0) {
              await copyModuleItemsToEventItems(
                client,
                event.id,
                session.training_module_id,
                date,
                null,
                moduleInfo.items
              );
            }
            createdEvents.push({ event, athleteId });
            sequenceIndex++;
          }
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    for (const { event, athleteId } of createdEvents) {
      syncToGoogleCalendar(() => googleCalendar.syncEventToConnectedUsers(event, [athleteId]));
    }

    res.status(201).json({
      athlete_count: athleteIds.length,
      event_count: createdEvents.length,
    });
  })
);

// One athlete's active enrollments (their own, or one a manager - coach/
// admin - is allowed to see), each with its generated events so the UI
// can offer a real event to anchor a "shift from here" against.
router.get(
  "/enrollments/:athleteId",
  asyncHandler(async (req, res) => {
    const athleteId = Number(req.params.athleteId);
    if (!(await isEnrollmentManager(req.user, { athlete_id: athleteId }))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows: enrollments } = await pool.query(
      `SELECT e.id, e.training_program_id, e.athlete_id, e.start_date, e.created_at,
              p.title AS program_title
       FROM nk_training_program_enrollments e
       LEFT JOIN nk_training_programs p ON p.id = e.training_program_id
       WHERE e.athlete_id = $1
       ORDER BY e.start_date DESC`,
      [athleteId]
    );
    if (enrollments.length === 0) {
      return res.json({ enrollments: [] });
    }

    const { rows: events } = await pool.query(
      `SELECT id, program_enrollment_id, title, start_date, sequence_index
       FROM nk_events
       WHERE program_enrollment_id = ANY($1::int[])
       ORDER BY sequence_index`,
      [enrollments.map((e) => e.id)]
    );
    const eventsByEnrollment = new Map();
    for (const ev of events) {
      if (!eventsByEnrollment.has(ev.program_enrollment_id)) {
        eventsByEnrollment.set(ev.program_enrollment_id, []);
      }
      eventsByEnrollment.get(ev.program_enrollment_id).push(ev);
    }

    res.json({
      enrollments: enrollments.map((e) => ({
        ...e,
        events: eventsByEnrollment.get(e.id) ?? [],
      })),
    });
  })
);

// Shifts an enrollment's events from a chosen anchor session onward by
// the delta between that session's *current* date (which may already
// differ from its originally-generated date, if it was individually
// dragged) and `new_start_date`. Compared by sequence_index, not date -
// date-based comparison breaks the moment any other event in the same
// enrollment has been individually rescheduled out of order.
router.patch(
  "/enrollments/:id/shift",
  asyncHandler(async (req, res) => {
    const { from_event_id, new_start_date } = req.body ?? {};
    if (!from_event_id || !new_start_date || !/^\d{4}-\d{2}-\d{2}$/.test(new_start_date)) {
      return res.status(400).json({
        error: { message: "from_event_id and new_start_date (YYYY-MM-DD) are required" },
      });
    }

    const { rows: enrollRows } = await pool.query(
      `SELECT id, athlete_id FROM nk_training_program_enrollments WHERE id = $1`,
      [req.params.id]
    );
    if (enrollRows.length === 0) {
      return res.status(404).json({ error: { message: "Enrollment not found" } });
    }
    const enrollment = enrollRows[0];
    if (!(await isEnrollmentManager(req.user, enrollment))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows: anchorRows } = await pool.query(
      `SELECT id, start_date, sequence_index FROM nk_events
       WHERE id = $1 AND program_enrollment_id = $2`,
      [from_event_id, enrollment.id]
    );
    if (anchorRows.length === 0 || anchorRows[0].sequence_index == null) {
      return res
        .status(400)
        .json({ error: { message: "from_event_id is not part of this enrollment" } });
    }
    const anchor = anchorRows[0];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: shifted } = await client.query(
        `UPDATE nk_events
         SET start_date = start_date + ($1::date - $2::date),
             end_date = end_date + ($1::date - $2::date),
             updated_at = NOW()
         WHERE program_enrollment_id = $3 AND sequence_index >= $4
         RETURNING ${EVENT_FIELDS}`,
        [new_start_date, anchor.start_date, enrollment.id, anchor.sequence_index]
      );
      const shiftedIds = shifted.map((e) => e.id);
      if (shiftedIds.length > 0) {
        await client.query(
          `UPDATE nk_event_items
           SET item_date = item_date + ($1::date - $2::date)
           WHERE event_id = ANY($3::int[])`,
          [new_start_date, anchor.start_date, shiftedIds]
        );
      }
      await client.query("COMMIT");

      for (const event of shifted) {
        syncToGoogleCalendar(() =>
          googleCalendar.syncEventToConnectedUsers(event, [enrollment.athlete_id])
        );
      }
      res.json({ shifted_event_ids: shiftedIds });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// Removes a whole enrollment from a schedule - every event it generated
// cascades away via program_enrollment_id's ON DELETE CASCADE, so the
// Google Calendar link rows for them must be captured first (same
// "capture before the cascade wipes them" reasoning as
// DELETE /events/:id/series).
router.delete(
  "/enrollments/:id",
  asyncHandler(async (req, res) => {
    const { rows: enrollRows } = await pool.query(
      `SELECT id, athlete_id FROM nk_training_program_enrollments WHERE id = $1`,
      [req.params.id]
    );
    if (enrollRows.length === 0) {
      return res.status(404).json({ error: { message: "Enrollment not found" } });
    }
    const enrollment = enrollRows[0];
    if (!(await isEnrollmentManager(req.user, enrollment))) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows: links } = await pool.query(
      `SELECT gca.user_id, gca.calendar_id, gce.google_event_id, gce.event_id
       FROM nk_google_calendar_events gce
       JOIN nk_google_calendar_accounts gca ON gca.user_id = gce.user_id
       JOIN nk_events e ON e.id = gce.event_id
       WHERE e.program_enrollment_id = $1`,
      [enrollment.id]
    );

    await pool.query(`DELETE FROM nk_training_program_enrollments WHERE id = $1`, [
      enrollment.id,
    ]);
    syncToGoogleCalendar(() => googleCalendar.deleteEventFromConnectedUsers(links));
    res.status(204).end();
  })
);

module.exports = router;
