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

const tools = [
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
        event_type: { type: "string", enum: EVENT_TYPES },
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
      if (!EVENT_TYPES.includes(event_type)) {
        throw new Error(`event_type must be one of: ${EVENT_TYPES.join(", ")}`);
      }
      if (!start_date || !end_date) {
        throw new Error("start_date and end_date are required");
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
];

const toolsByName = new Map(tools.map((t) => [t.name, t]));

async function callTool(name, input) {
  const tool = toolsByName.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(input ?? {});
}

module.exports = { tools, callTool };
