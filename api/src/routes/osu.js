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
const { tools, callTool } = require("../mcp/tools");

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

const SYSTEM_PROMPT = `You are Osu, the admin assistant built into the Nada Karate Athlete Manager.
You help club/association admins look up and manage clubs, athletes, pending
sign-ups, and schedule events using the tools available to you. Be concise.
Before taking an action that creates or changes a record, briefly state what
you're about to do; after tool results come back, summarize what happened in
plain language rather than dumping raw data. If a request is ambiguous or
could affect the wrong record, ask a clarifying question instead of guessing.`;

const CLAUDE_TOOLS = tools.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema,
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
        system: SYSTEM_PROMPT,
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
