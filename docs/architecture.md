# FlowDesk Architecture

FlowDesk is designed as a hybrid background agent. It operates invisibly via the Slack Events API for auto-tracking, while providing explicit slash commands and an MCP server for direct interaction.

## Core Flow

1. **Slack Events API (Socket Mode)**
   Listens to `message.channels` and `message.groups` in channels where FlowDesk is invited.
   
2. **Commitment Detection (Gemini 2.5 Flash)**
   Every message is passed to Gemini with a highly-tuned system prompt to detect actionable commitments vs. casual statements.

3. **Database (Supabase PostgreSQL)**
   - `action_items`: Stores the commitments, deadlines, and completion status.
   - `message_log`: Caches raw messages to enable cross-channel search for free-tier Slack workspaces (since `search.messages` is a paid feature).

4. **Interactivity**
   FlowDesk DMs the user using Block Kit when a commitment is detected. Button clicks (Confirm/Dismiss/Done) trigger `interactionHandler.js` which updates Supabase and acknowledges the message.

## Hackathon Requirements Met

We successfully integrated **Slack AI Capabilities** (by heavily utilizing Gemini for conversational context generation and channel summarization) and **MCP Server Integration** (by exposing FlowDesk's database and capabilities to any MCP client).

### MCP Server Integration
FlowDesk includes a standalone Model Context Protocol (MCP) server (`src/mcp/server.js`) that allows external AI agents to:
- `search_history`: Search the workspace history using Gemini synthesis.
- `get_tasks`: Retrieve open commitments for any user.
- `track_commitment`: Manually inject a commitment into the FlowDesk database.
