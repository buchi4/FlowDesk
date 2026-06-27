# FlowDesk

> A Slack agent that works like a chief of staff — tracking commitments, answering questions from history, and briefing you on what actually matters.

## Features

🎯 **Action Tracker** — Detects commitments in real time and confirms them with one click  
🔍 **Smart Search** (`/ask`) — Natural language search over Slack history  
📋 **Channel Summary** (`/summary`) — Structured brief of any channel  
✅ **Task Manager** (`/mytasks`) — View and complete action items inline  
☀️ **Daily Digest** — Personalized morning brief delivered via DM  

## Tech Stack

- **Slack Bolt.js** — Events API, slash commands, interactive messages
- **Google Gemini** (`gemini-2.5-flash`) — Commitment detection, summarization, search synthesis
- **Supabase** — PostgreSQL database for action items, message cache, decisions
- **Node.js** — Runtime
- **node-cron** — Scheduled jobs (reminders, daily digest)

## Quick Start

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it `FlowDesk`, pick your workspace

**OAuth Scopes** (Bot Token Scopes):
- `channels:history` — Read messages in channels
- `channels:read` — View channel info
- `chat:write` — Send messages
- `commands` — Add slash commands
- `im:write` — DM users
- `users:read` — Get user info

**Event Subscriptions** → Enable Events → Subscribe to bot events:
- `message.channels` — Listen for messages in channels

**Slash Commands** → Create these:
- `/ask` — Search workspace history
- `/summary` — Summarize current channel
- `/mytasks` — View your open tasks
- `/flowhelp` — Show help

**Socket Mode** → Enable Socket Mode  
**App-Level Token** → Generate one with `connections:write` scope

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → run the contents of `supabase/schema.sql`
3. Copy your project URL and service role key from Settings → API

### 3. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
GEMINI_API_KEY=...
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=...
```

### 4. Install & Run

```bash
npm install
npm start
```

### 5. Invite FlowDesk to a Channel

In Slack, go to any channel and type:
```
/invite @FlowDesk
```

Now try saying: *"I'll send the proposal by Friday"* — FlowDesk will DM you!

## Project Structure

```
flowdesk/
├── src/
│   ├── index.js              # Entry point, Bolt app setup
│   ├── config.js             # Environment config
│   ├── ai/
│   │   └── gemini.js         # Gemini API integration
│   ├── db/
│   │   └── supabase.js       # Supabase client & queries
│   ├── handlers/
│   │   ├── messageHandler.js # Commitment detection
│   │   └── interactionHandler.js # Button clicks
│   ├── commands/             # (Phase 2)
│   └── jobs/                 # (Phase 3)
├── supabase/
│   └── schema.sql            # Database schema
├── .env.example
└── package.json
```

## Hackathon

Built for the [Slack Agent Builder Challenge](https://slackhack.devpost.com/) (2026).

**Track:** Slack Agent for Good + New Slack Agent  
**Required Tech:** Slack AI capabilities, MCP server integration, Real-Time Search API
