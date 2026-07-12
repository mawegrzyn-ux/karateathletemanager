#!/usr/bin/env node
// Standalone MCP (Model Context Protocol) server exposing admin task tools
// for the karate athlete manager over stdio. Run directly (`node
// src/mcp/server.js`) to connect it to any MCP client - Claude Desktop, the
// Claude Code CLI, another agent - or let osu.js spawn it in-process (see
// that file). Tool definitions and DB logic live in ./tools.js so this file
// and the chatbot never drift apart on what a tool does.
require("dotenv").config();

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { tools, callTool } = require("./tools");

const server = new Server(
  { name: "nadakarate-admin", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    inputSchema: input_schema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await callTool(request.params.name, request.params.arguments);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: err.message }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
