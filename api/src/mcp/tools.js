// Shared tool definitions + handlers for Osu (the admin chatbot) and the
// standalone MCP server (server.js). Single source of truth so the two
// surfaces can never drift apart: each tool's `input_schema` is plain JSON
// Schema, usable as-is both for Claude's tool-use API and for the MCP
// server's `tools/list` response.
//
// These run with admin-equivalent trust - every caller (Osu's chat route,
// or an MCP client connecting to server.js) is expected to have already
// been authorized as an admin before these handlers are invoked. Handlers
// talk to the database directly rather than through the HTTP routes, the
// same way api/src/utils/activateUser.js does.
const pool = require("../db/pool");
const { activateUser } = require("../utils/activateUser");

// Server "today" - UTC-based, same convention the rest of the backend uses
// for date strings (see events.js) and that the frontend's todayStr() mirrors.
// Exported separately from the tool so Osu's system prompt (osu.js) can also
// state today's date up front without a tool round-trip, while the tool
// itself stays available for Osu to re-check it (or fetch the current time)
// mid-conversation.
function todayInfo() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(now);
  const time = now.toISOString().slice(11, 16);
  return { date, weekday, time };
}

async function getBraveApiKey() {
  const { rows } = await pool.query(
    `SELECT value FROM nk_settings WHERE key = 'brave_api_key'`
  );
  const apiKey = rows[0]?.value || process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Web search isn't configured yet - add a Brave Search API key under More > Configuration."
    );
  }
  return apiKey;
}

async function braveRequest(url, apiKey) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Brave Search request failed (${res.status})`);
  }
  return res;
}

// Mirrors the limits/enum in api/src/routes/trainingModules.js's own
// insertItems - create_training_module below replicates that validation
// directly (per this file's own convention of talking to the DB rather
// than through the HTTP routes) rather than importing from a route file.
const TRAINING_ITEM_TYPES = ["exercise", "rest"];
const MAX_SETS = 50;
const MAX_REPS = 1000;
const MAX_DURATION_SECONDS = 6 * 60 * 60; // 6 hours
const MAX_DISTANCE_METERS = 100000; // 100km

const tools = [
  {
    name: "get_current_date",
    description:
      "Returns today's date (YYYY-MM-DD), day of week, and current time (UTC, HH:MM). Use this whenever a request depends on 'today', 'this week', 'upcoming', or similar relative dates, or to compute an actual date from one (e.g. 'next Tuesday').",
    input_schema: { type: "object", properties: {} },
    async handler() {
      return todayInfo();
    },
  },
  {
    name: "list_clubs",
    description:
      "Search clubs by name (substring, case-insensitive). Omit query to list all clubs.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional name filter" },
      },
    },
    async handler({ query }) {
      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.location, a.name AS association_name
         FROM nk_clubs c
         LEFT JOIN nk_associations a ON a.id = c.association_id
         WHERE $1::text IS NULL OR c.name ILIKE '%' || $1 || '%'
         ORDER BY c.name ASC
         LIMIT 50`,
        [query ?? null]
      );
      return { clubs: rows };
    },
  },
  {
    name: "create_club",
    description: "Create a new club.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        location: { type: "string" },
        contact_email: { type: "string" },
        contact_phone: { type: "string" },
      },
      required: ["name"],
    },
    async handler({ name, location, contact_email, contact_phone }) {
      if (!name || !name.trim()) throw new Error("name is required");
      const { rows } = await pool.query(
        `INSERT INTO nk_clubs (name, location, contact_email, contact_phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, location, contact_email, contact_phone`,
        [name, location ?? null, contact_email ?? null, contact_phone ?? null]
      );
      return { club: rows[0] };
    },
  },
  {
    name: "list_athletes",
    description:
      "Search athletes by name (substring, case-insensitive). Omit query to list all athletes (capped at 50).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional name filter" },
      },
    },
    async handler({ query }) {
      const { rows } = await pool.query(
        `SELECT a.id, a.first_name, a.last_name, a.is_active, g.name AS grade_name
         FROM nk_athletes a
         LEFT JOIN nk_grade_levels g ON g.id = a.grade_id
         WHERE $1::text IS NULL
            OR a.first_name ILIKE '%' || $1 || '%'
            OR a.last_name ILIKE '%' || $1 || '%'
         ORDER BY a.last_name, a.first_name
         LIMIT 50`,
        [query ?? null]
      );
      return { athletes: rows };
    },
  },
  {
    name: "list_pending_users",
    description:
      "List accounts awaiting admin approval, including what role/club they signed up for.",
    input_schema: { type: "object", properties: {} },
    async handler() {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name,
                u.wants_athlete, u.wants_coach, u.wants_referee,
                u.requested_club_id, c.name AS requested_club_name,
                u.created_at
         FROM nk_users u
         LEFT JOIN nk_clubs c ON c.id = u.requested_club_id
         WHERE u.status = 'pending'
         ORDER BY u.created_at ASC`
      );
      return { pending_users: rows };
    },
  },
  {
    name: "approve_user",
    description:
      "Approve a pending user's account, activating it and auto-creating their athlete/coach/referee profile as requested at signup.",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "integer" },
      },
      required: ["user_id"],
    },
    async handler({ user_id }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `UPDATE nk_users SET status = 'active', updated_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING id, email, role, status, is_admin, athlete_id, coach_id, referee_id,
                     first_name, last_name, phone, photo_url, date_of_birth,
                     wants_athlete, wants_coach, wants_referee, requested_club_id`,
          [user_id]
        );
        if (rows.length === 0) {
          await client.query("ROLLBACK");
          throw new Error("No pending user found with that id");
        }
        const user = await activateUser(client, rows[0]);
        await client.query("COMMIT");
        return { user };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  },
  {
    name: "list_events",
    description:
      "List schedule events, optionally within a date range (inclusive, YYYY-MM-DD). Omit both to get the next 20 upcoming events.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
    },
    async handler({ from, to }) {
      const { rows } = await pool.query(
        `SELECT id, title, event_type, start_date, end_date, start_time, end_time, location
         FROM nk_events
         WHERE ($1::date IS NULL OR end_date >= $1)
           AND ($2::date IS NULL OR start_date <= $2)
           AND ($1::date IS NOT NULL OR $2::date IS NOT NULL OR end_date >= CURRENT_DATE)
         ORDER BY start_date ASC
         LIMIT 20`,
        [from ?? null, to ?? null]
      );
      return { events: rows };
    },
  },
  {
    name: "create_event",
    description:
      "Create a single (non-repeating) schedule event with no athletes assigned yet.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        event_type: {
          type: "string",
          description:
            "One of the standard schedule type keys (e.g. competition, squad_session, training, travel, time_off, seminar, training_camp, grading, rest, other, kata_performance) - clubs can also define custom types, but this tool creates the event with no club assigned, so only standard types are accepted here.",
        },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM, optional" },
        end_time: { type: "string", description: "HH:MM, optional" },
        location: { type: "string" },
        notes: { type: "string" },
      },
      required: ["title", "event_type", "start_date", "end_date"],
    },
    async handler({
      title,
      event_type,
      start_date,
      end_date,
      start_time,
      end_time,
      location,
      notes,
    }) {
      if (!title || !title.trim()) throw new Error("title is required");
      if (!start_date || !end_date) {
        throw new Error("start_date and end_date are required");
      }
      const { rows: typeRows } = await pool.query(
        `SELECT 1 FROM nk_event_types WHERE key = $1 AND is_standard = true LIMIT 1`,
        [event_type]
      );
      if (typeRows.length === 0) {
        throw new Error(
          `event_type must be a standard schedule type key (this tool creates events with no club, so custom per-club types aren't available here)`
        );
      }
      const { rows } = await pool.query(
        `INSERT INTO nk_events
           (title, event_type, start_date, end_date, start_time, end_time, location, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, title, event_type, start_date, end_date, start_time, end_time, location`,
        [
          title,
          event_type,
          start_date,
          end_date,
          start_time ?? null,
          end_time ?? null,
          location ?? null,
          notes ?? null,
        ]
      );
      return { event: rows[0] };
    },
  },
  {
    name: "web_search",
    description:
      "Search the public web (via Brave Search) and return the top results' titles, URLs, and snippets. Use for anything outside this app's own data - current events, rules/regulations, opponent research, etc.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
    async handler({ query }) {
      if (!query || !query.trim()) throw new Error("query is required");
      const apiKey = await getBraveApiKey();

      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "8");

      const res = await braveRequest(url, apiKey);
      const data = await res.json();
      const results = (data.web?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }));
      return { results };
    },
  },
  {
    name: "search_videos",
    description:
      "Search the web for instructional/demonstration videos (via Brave Video Search) and return each result's title, url, thumbnail, and duration. Use when building a training module to find a demonstration clip for an exercise. Results are biased toward YouTube by default (youtube_only, default true) since this app's video embed only renders a real inline player for YouTube links - a video_url on a training module item from any other site will just show as a plain link, not an embedded player.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        youtube_only: {
          type: "boolean",
          description: "Restrict results to youtube.com (default true).",
        },
      },
      required: ["query"],
    },
    async handler({ query, youtube_only }) {
      if (!query || !query.trim()) throw new Error("query is required");
      const apiKey = await getBraveApiKey();
      const restrictToYouTube = youtube_only !== false;

      const url = new URL("https://api.search.brave.com/res/v1/videos/search");
      url.searchParams.set(
        "q",
        restrictToYouTube ? `${query} site:youtube.com` : query
      );
      url.searchParams.set("count", "8");

      const res = await braveRequest(url, apiKey);
      const data = await res.json();
      const results = (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        thumbnail: r.thumbnail?.src ?? null,
        duration: r.video?.duration ?? null,
      }));
      return { results };
    },
  },
  {
    name: "list_training_module_types",
    description:
      "List the training module categories (e.g. Cardio, Strength) a module can optionally be tagged with, so a new module can be matched to an existing one instead of left untyped.",
    input_schema: { type: "object", properties: {} },
    async handler() {
      const { rows } = await pool.query(
        `SELECT id, name FROM nk_training_module_types ORDER BY name`
      );
      return { types: rows };
    },
  },
  {
    name: "create_training_module",
    description:
      "Creates a training module (shown to users as a 'training session'): a title/explanation plus an ordered list of exercise/rest items, each optionally carrying a demonstration video_url (see search_videos), sets/reps or duration_seconds or distance_meters, and its own explanation. Do NOT call this speculatively - only once the focus/goal, an appropriate skill or age level, roughly how many exercises, and each exercise's measurement format (sets/reps vs. timed vs. distance) are all actually known from the conversation. If any of those is still vague or unstated, ask about it and wait for the reply first; do not fill it with a plausible-sounding guess just to avoid asking.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        explanation: { type: "string", description: "Overview shown at the top of the module." },
        type_name: {
          type: "string",
          description:
            "Matched case-insensitively against an existing training module type name (see list_training_module_types). Omit if none fits.",
        },
        icon: { type: "string", description: "A single emoji, optional." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_type: { type: "string", enum: ["exercise", "rest"] },
              name: { type: "string", description: "Required for exercise items." },
              explanation: { type: "string" },
              video_url: {
                type: "string",
                description: "A demonstration video link, ideally from search_videos.",
              },
              sets: { type: "integer" },
              reps: { type: "integer" },
              duration_seconds: { type: "integer" },
              distance_meters: { type: "integer" },
            },
            required: ["item_type"],
          },
        },
      },
      required: ["title", "items"],
    },
    // A sibling of input_schema (per the Claude API's tool definition
    // shape), not nested inside it - kept next to the schema here purely
    // for readability, split back apart before either the Osu route or
    // the MCP server (server.js) sends the tool definition onward.
    input_examples: [
      {
        title: "Beginner Kicking Drill",
        explanation: "Basic roundhouse and front kick practice for new students.",
        type_name: "Technique",
        items: [
          {
            item_type: "exercise",
            name: "Front kicks",
            explanation: "Chamber the knee before extending.",
            sets: 3,
            reps: 10,
          },
          { item_type: "rest", duration_seconds: 30 },
          {
            item_type: "exercise",
            name: "Roundhouse kicks",
            video_url: "https://www.youtube.com/watch?v=<id from search_videos>",
            sets: 3,
            reps: 10,
          },
        ],
      },
    ],
    async handler({ title, explanation, type_name, icon, items }) {
      if (!title || !title.trim()) throw new Error("title is required");
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("items must be a non-empty array");
      }
      if (icon != null && (typeof icon !== "string" || icon.length > 8)) {
        throw new Error("icon must be a string of 8 characters or fewer");
      }

      let typeId = null;
      if (type_name) {
        const { rows } = await pool.query(
          `SELECT id FROM nk_training_module_types WHERE name ILIKE $1 LIMIT 1`,
          [type_name]
        );
        typeId = rows[0]?.id ?? null;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `INSERT INTO nk_training_modules (title, explanation, type_id, icon)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [title, explanation ?? null, typeId, icon || null]
        );
        const moduleId = rows[0].id;

        for (let i = 0; i < items.length; i++) {
          const it = items[i] ?? {};
          if (!TRAINING_ITEM_TYPES.includes(it.item_type)) {
            throw new Error("Each item needs a valid item_type (exercise or rest)");
          }
          const sets = it.sets != null ? Number(it.sets) : null;
          const reps = it.reps != null ? Number(it.reps) : null;
          const duration = it.duration_seconds != null ? Number(it.duration_seconds) : null;
          const distance = it.distance_meters != null ? Number(it.distance_meters) : null;
          if (sets != null && (!Number.isInteger(sets) || sets <= 0 || sets > MAX_SETS)) {
            throw new Error(`sets must be a whole number between 1 and ${MAX_SETS}`);
          }
          if (reps != null && (!Number.isInteger(reps) || reps <= 0 || reps > MAX_REPS)) {
            throw new Error(`reps must be a whole number between 1 and ${MAX_REPS}`);
          }
          if (
            duration != null &&
            (!Number.isInteger(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS)
          ) {
            throw new Error(
              `duration_seconds must be a whole number between 1 and ${MAX_DURATION_SECONDS}`
            );
          }
          if (
            distance != null &&
            (!Number.isInteger(distance) || distance <= 0 || distance > MAX_DISTANCE_METERS)
          ) {
            throw new Error(
              `distance_meters must be a whole number between 1 and ${MAX_DISTANCE_METERS}`
            );
          }

          await client.query(
            `INSERT INTO nk_training_module_items
               (module_id, position, item_type, name, explanation, video_url, sets, reps, duration_seconds, distance_meters)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              moduleId,
              i,
              it.item_type,
              it.item_type === "exercise" ? it.name ?? null : null,
              it.explanation ?? null,
              it.video_url ?? null,
              sets,
              reps,
              duration,
              distance,
            ]
          );
        }

        await client.query("COMMIT");
        return { module_id: moduleId, item_count: items.length };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  },
  {
    name: "list_training_modules",
    description:
      "Search training sessions (id + title + icon) by title, substring case-insensitive. Omit query to list all. Use this to find the id of an existing session to reference in create_training_program's weekly pattern, or to check whether a suitable one already exists before creating a new one with create_training_module.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional title filter" },
      },
    },
    async handler({ query }) {
      const { rows } = await pool.query(
        `SELECT id, title, icon FROM nk_training_modules
         WHERE $1::text IS NULL OR title ILIKE '%' || $1 || '%'
         ORDER BY title
         LIMIT 50`,
        [query ?? null]
      );
      return { modules: rows };
    },
  },
  {
    name: "create_training_program",
    description:
      "Creates a training programme: a weekly pattern (which existing training session happens on which weekday) that repeats for duration_weeks. Every session referenced must already exist - use list_training_modules to find its id, or create_training_module first if none fits; never invent a training_module_id. This only defines the pattern - it does NOT assign it to anyone or touch any athlete's calendar, since athletes enroll into it themselves from the app by picking a start date. Do NOT call this speculatively - a programme request bundles several choices (which weekdays get a session, which existing session for each, how many weeks) that are each easy to leave vague, so confirm all of them are actually known from the conversation first; if any is still unclear, ask rather than guess a shape the admin didn't ask for.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        explanation: { type: "string", description: "Overview shown at the top of the programme." },
        type_name: {
          type: "string",
          description:
            "Matched case-insensitively against an existing training module type name (see list_training_module_types). Omit if none fits.",
        },
        icon: { type: "string", description: "A single emoji, optional." },
        duration_weeks: {
          type: "integer",
          description: "How many weeks the weekly pattern repeats, between 1 and 52.",
        },
        sessions: {
          type: "array",
          description: "The weekly pattern - one entry per session slot.",
          items: {
            type: "object",
            properties: {
              weekday: { type: "integer", description: "0 = Sunday .. 6 = Saturday" },
              training_module_id: {
                type: "integer",
                description: "An existing training session's id (see list_training_modules).",
              },
            },
            required: ["weekday", "training_module_id"],
          },
        },
      },
      required: ["title", "duration_weeks", "sessions"],
    },
    // A sibling of input_schema, same reasoning as create_training_module's
    // own input_examples above.
    input_examples: [
      {
        title: "Pre-season Conditioning",
        explanation: "8-week base fitness block before competition season.",
        duration_weeks: 8,
        // Illustrative ids only - a real call must use ids returned by
        // list_training_modules (or create_training_module), never a
        // literal id copied from this example.
        sessions: [
          { weekday: 1, training_module_id: 101 },
          { weekday: 3, training_module_id: 102 },
          { weekday: 5, training_module_id: 101 },
        ],
      },
    ],
    async handler({ title, explanation, type_name, icon, duration_weeks, sessions }) {
      if (!title || !title.trim()) throw new Error("title is required");
      if (icon != null && (typeof icon !== "string" || icon.length > 8)) {
        throw new Error("icon must be a string of 8 characters or fewer");
      }
      const weeks = Number(duration_weeks);
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
        throw new Error("duration_weeks must be a whole number between 1 and 52");
      }
      if (!Array.isArray(sessions) || sessions.length === 0) {
        throw new Error("sessions must be a non-empty array");
      }
      for (const s of sessions) {
        const weekday = Number(s?.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
          throw new Error("Each session needs a weekday between 0 (Sunday) and 6 (Saturday)");
        }
        if (!s?.training_module_id) {
          throw new Error("Each session needs a training_module_id");
        }
      }

      const moduleIds = [...new Set(sessions.map((s) => s.training_module_id))];
      const { rows: existingModules } = await pool.query(
        `SELECT id FROM nk_training_modules WHERE id = ANY($1::int[])`,
        [moduleIds]
      );
      const existingIds = new Set(existingModules.map((m) => m.id));
      const missing = moduleIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        throw new Error(
          `No training session found with id(s) ${missing.join(", ")} - check list_training_modules`
        );
      }

      let typeId = null;
      if (type_name) {
        const { rows } = await pool.query(
          `SELECT id FROM nk_training_module_types WHERE name ILIKE $1 LIMIT 1`,
          [type_name]
        );
        typeId = rows[0]?.id ?? null;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `INSERT INTO nk_training_programs (title, explanation, type_id, icon, duration_weeks)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [title, explanation ?? null, typeId, icon || null, weeks]
        );
        const programId = rows[0].id;

        // position orders same-weekday sessions (e.g. an AM/PM double) by
        // the order they were given in, mirroring trainingPrograms.js's
        // own insertSessions.
        const positionByWeekday = new Map();
        for (const s of sessions) {
          const weekday = Number(s.weekday);
          const position = positionByWeekday.get(weekday) ?? 0;
          positionByWeekday.set(weekday, position + 1);
          await client.query(
            `INSERT INTO nk_training_program_sessions (program_id, weekday, training_module_id, position)
             VALUES ($1, $2, $3, $4)`,
            [programId, weekday, s.training_module_id, position]
          );
        }

        await client.query("COMMIT");
        return { program_id: programId, session_count: sessions.length };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  },
];

const toolsByName = new Map(tools.map((t) => [t.name, t]));

async function callTool(name, input) {
  const tool = toolsByName.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(input ?? {});
}

module.exports = { tools, callTool, todayInfo };
