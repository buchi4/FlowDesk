const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

// ─── Action Items ───────────────────────────────────────────

/**
 * Save a new action item (commitment detected by Gemini).
 * Initially saved as 'pending' until user confirms via button.
 */
async function saveActionItem({
  slackUserId,
  slackChannelId,
  messageTs,
  commitmentText,
  deadline,
}) {
  const { data, error } = await supabase
    .from('action_items')
    .insert({
      slack_user_id: slackUserId,
      slack_channel_id: slackChannelId,
      message_ts: messageTs,
      commitment_text: commitmentText,
      deadline,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save action item: ${error.message}`);
  return data;
}

/**
 * Update the status of an action item (confirm, complete, dismiss).
 */
async function updateActionItemStatus(itemId, status) {
  const updates = { status, updated_at: new Date().toISOString() };

  if (status === 'confirmed') updates.confirmed_at = new Date().toISOString();
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('action_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update action item: ${error.message}`);
  return data;
}

/**
 * Get all open (confirmed, not completed) action items for a user.
 * Used by /mytasks and daily digest.
 */
async function getActionItemsByUser(slackUserId) {
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('slack_user_id', slackUserId)
    .eq('status', 'confirmed')
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Failed to fetch action items: ${error.message}`);
  return data || [];
}

/**
 * Get action items with approaching deadlines that haven't been reminded yet.
 * Used by the reminder cron job.
 */
async function getPendingReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .not('deadline', 'is', null)
    .lte('deadline', in24h.toISOString());

  if (error) throw new Error(`Failed to fetch reminders: ${error.message}`);
  return data || [];
}

/**
 * Mark that a reminder has been sent for an action item.
 */
async function markReminderSent(itemId) {
  const { error } = await supabase
    .from('action_items')
    .update({ reminder_sent: true, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) throw new Error(`Failed to mark reminder sent: ${error.message}`);
}

// ─── Message Log (for /ask) ─────────────────────────────────

/**
 * Cache a message for later search via /ask.
 * Uses upsert to avoid duplicates on message_ts.
 */
async function logMessage({ slackChannelId, slackUserId, messageTs, messageText }) {
  const { error } = await supabase
    .from('message_log')
    .upsert(
      {
        slack_channel_id: slackChannelId,
        slack_user_id: slackUserId,
        message_ts: messageTs,
        message_text: messageText,
      },
      { onConflict: 'message_ts' }
    );

  if (error) console.error(`Failed to log message: ${error.message}`);
}

/**
 * Full-text search over cached messages.
 * Uses PostgreSQL's to_tsvector for relevance-ranked results.
 */
async function searchMessages(query, limit = 50) {
  // Try full-text search first (good for specific keywords)
  const { data, error } = await supabase
    .from('message_log')
    .select('*')
    .textSearch('message_text', query, { type: 'websearch' })
    .limit(limit)
    .order('created_at', { ascending: false });

  if (!error && data && data.length > 0) {
    return data;
  }

  // If full-text search returns nothing (common for conversational queries like "who is..."),
  // fallback to grabbing the latest 50 messages globally from the cache and letting Gemini find the answer.
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('message_log')
    .select('*')
    .limit(limit)
    .order('created_at', { ascending: false });

  if (fallbackError) throw new Error(`Search failed: ${fallbackError.message}`);
  return fallbackData || [];
}

// ─── Decisions ──────────────────────────────────────────────

/**
 * Log a decision for /ask context enrichment.
 */
async function logDecision({ slackChannelId, messageTs, decisionSummary, participants }) {
  const { error } = await supabase
    .from('decisions')
    .insert({
      slack_channel_id: slackChannelId,
      message_ts: messageTs,
      decision_summary: decisionSummary,
      participants,
    });

  if (error) console.error(`Failed to log decision: ${error.message}`);
}

/**
 * Get recent decisions for a channel (used by /summary and digest).
 */
async function getRecentDecisions(slackChannelId, limit = 10) {
  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .eq('slack_channel_id', slackChannelId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch decisions: ${error.message}`);
  return data || [];
}

module.exports = {
  supabase,
  saveActionItem,
  updateActionItemStatus,
  getActionItemsByUser,
  getPendingReminders,
  markReminderSent,
  logMessage,
  searchMessages,
  logDecision,
  getRecentDecisions,
};
