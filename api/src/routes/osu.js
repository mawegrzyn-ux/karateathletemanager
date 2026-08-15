// Osu - the admin chatbot. Uses the Claude API's tool-use loop to answer
// questions and perform tasks (create clubs/events, approve pending
// signups, etc.) against this app's own data, via the same tool
// definitions the standalone MCP server (api/src/mcp/server.js) exposes.
// Admin-only for now (per the initial request) - the whole router sits
// behind authorize.requireAdmin.
const { Router } = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { tools, callTool, todayInfo } = require("../mcp/tools");

const router = Router();
router.use(authorize.requireAdmin);

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ITERATIONS = 8;

// The key can be set at runtime via the admin "Configure Osu" form (stored
// in nk_settings) rather than requiring a server redeploy with a new
// api/.env - that's the whole reason this constructs the client lazily
// per request instead of once at module load. Cached by key value so a
// saved/rotated key takes effect on the very next request without a
// restart, but repeat requests with the same key don't pay the DB round
// trip.
let cachedKey = null;
let cachedClient = null;

async function getClient() {
  const { rows } = await pool.query(
    `SELECT value FROM nk_settings WHERE key = 'anthropic_api_key'`
  );
  const key = rows[0]?.value || process.env.ANTHROPIC_API_KEY || null;
  if (!key) return null;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedClient = new Anthropic({ apiKey: key });
  }
  return cachedClient;
}

// Built fresh per request (rather than a module-level constant) so today's
// date is always current - it's stated up front here rather than left for
// Osu to figure out via get_current_date, so the common "today"/"this week"
// case doesn't cost a tool round-trip; the tool itself stays available for
// precision (exact time) or if a conversation runs long enough to cross
// midnight.
function buildSystemPrompt() {
  const { date, weekday, time } = todayInfo();
  return `You are Osu, the admin assistant built into the Nada Karate Athlete Manager.
Today is ${weekday}, ${date} (current time ${time} UTC).
You help club/association admins look up and manage clubs, athletes, pending
sign-ups, and schedule events using the tools available to you. Be concise.
Before taking an action that creates or changes a record, briefly state what
you're about to do; after tool results come back, summarize what happened in
plain language rather than dumping raw data. If a request is ambiguous or
could affect the wrong record, ask a clarifying question instead of guessing
- this holds even when a "reasonable default" is available. Filling a gap
with a plausible guess is still guessing; only proceed once the admin has
actually told you, or the conversation otherwise makes it unambiguous.

When asked to build a training session, before calling
create_training_session confirm you actually know all of: the
focus/goal, an appropriate skill or age level, roughly how many
exercises, and each exercise's measurement format (sets/reps vs. timed
vs. distance). A vague request ("make a leg workout") won't cover all of
these - ask about whatever's missing and wait for the reply; don't
invent a plausible value for one just to avoid asking a second question.
Once the plan is concrete, use web_search for technique/programming
research as needed. For each exercise item, prefer real content over
inventing it: for a general fitness/conditioning exercise (squats,
lunges, push-ups, planks, etc.), call search_exercises first, then
get_exercise_details on the match you pick - use its name/explanation/
video_url directly in the item rather than writing your own. ExerciseDB
doesn't cover karate-specific techniques or drills (kicks, strikes, kata
elements) - for those, use search_videos to find a demonstration clip
instead (it's fine to skip an item's video if nothing suitable turns up
either way - not every exercise needs one). Only pass a video_url from
get_exercise_details or search_videos into create_training_session's
items (or one the admin gave you directly) - never invent a URL. Check
list_training_session_types first so an existing category gets reused
via type_name instead of left untyped when one clearly fits. Always call
these tools by name (create_training_session, list_training_sessions,
list_training_session_types) and refer to this content as a "training
session" in your own replies too - never "training module", which is
only an old internal name.

When asked to build a training programme (a weekly pattern of existing
training sessions repeated over several weeks, that athletes later
enroll into themselves from a chosen start date): this bundles more
under-specified choices at once than a single session, so be even more
willing to ask first. Before calling create_training_program, confirm
you know: which weekdays get a session, which existing training session
(or one to build first) for each, and how many weeks. Missing any one of
these means ask, not guess a shape the admin didn't ask for. Use
list_training_sessions to find an existing session's id for each weekday
slot; if a suitable one doesn't exist, build it first with
create_training_session (following the guidance above, including asking
about its own shape if that's unclear) before referencing its id in
create_training_program. Never invent a training_session_id. This tool
only defines the weekly pattern - it doesn't enroll any athlete, so
don't imply anyone's calendar was actually changed.`;
}

const CLAUDE_TOOLS = tools.map(({ name, description, input_schema, input_examples }) => ({
  name,
  description,
  input_schema,
  ...(input_examples ? { input_examples } : {}),
}));

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const { messages } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ error: { message: "messages is required" } });
    }
    for (const m of messages) {
      if (m.role !== "user" && m.role !== "assistant") {
        return res
          .status(400)
          .json({ error: { message: "Invalid message role" } });
      }
      if (typeof m.content !== "string") {
        return res
          .status(400)
          .json({ error: { message: "Invalid message content" } });
      }
    }

    const client = await getClient();
    if (!client) {
      return res.status(409).json({
        error: {
          code: "not_configured",
          message: "Osu isn't configured yet - add an Anthropic API key to get started.",
        },
      });
    }

    const conversation = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const actions = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: buildSystemPrompt(),
        thinking: { type: "adaptive" },
        tools: CLAUDE_TOOLS,
        messages: conversation,
      });

      conversation.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const reply = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return res.json({ reply, actions });
      }

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let resultText;
        let isError = false;
        try {
          const output = await callTool(block.name, block.input);
          resultText = JSON.stringify(output);
          actions.push({ name: block.name, input: block.input, output });
        } catch (err) {
          resultText = err.message;
          isError = true;
          actions.push({ name: block.name, input: block.input, error: err.message });
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultText,
          is_error: isError,
        });
      }
      conversation.push({ role: "user", content: toolResults });
    }

    res.status(500).json({
      error: {
        message:
          "Osu took too many steps without finishing - try a narrower request.",
      },
    });
  })
);

module.exports = router;
