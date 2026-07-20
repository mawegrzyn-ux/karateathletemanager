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

      const { rows } = await pool.query(
        `SELECT value FROM nk_settings WHERE key = 'brave_api_key'`
      );
      const apiKey = rows[0]?.value || process.env.BRAVE_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Web search isn't configured yet - add a Brave Search API key under More > Configuration."
        );
      }

      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "8");

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      });
      if (!res.ok) {
        throw new Error(`Brave Search request failed (${res.status})`);
      }
      const data = await res.json();
      const results = (data.web?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }));
      return { results };
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
