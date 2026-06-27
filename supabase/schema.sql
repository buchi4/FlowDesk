-- FlowDesk Database Schema
-- Run this in your Supabase SQL editor (supabase.com > SQL Editor)

-- Drop existing tables (safe to re-run)
DROP TABLE IF EXISTS action_items CASCADE;
DROP TABLE IF EXISTS decisions CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS message_log CASCADE;

-- Action items (commitments tracked by FlowDesk)
CREATE TABLE action_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_user_id TEXT NOT NULL,
  slack_channel_id TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  commitment_text TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'dismissed')),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logged decisions (for /ask context enrichment)
CREATE TABLE decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_channel_id TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  decision_summary TEXT NOT NULL,
  participants TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
  slack_user_id TEXT PRIMARY KEY,
  digest_enabled BOOLEAN DEFAULT TRUE,
  digest_time TEXT DEFAULT '09:00',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message cache (for /ask since search.messages requires paid plan)
CREATE TABLE message_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_channel_id TEXT NOT NULL,
  slack_user_id TEXT NOT NULL,
  message_ts TEXT NOT NULL UNIQUE,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_action_items_user ON action_items(slack_user_id);
CREATE INDEX idx_action_items_status ON action_items(status);
CREATE INDEX idx_action_items_deadline ON action_items(deadline);
CREATE INDEX idx_decisions_channel ON decisions(slack_channel_id);
CREATE INDEX idx_message_log_channel ON message_log(slack_channel_id);
CREATE INDEX idx_message_log_text ON message_log USING gin(to_tsvector('english', message_text));
