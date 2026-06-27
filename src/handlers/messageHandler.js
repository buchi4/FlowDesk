const { detectCommitment } = require('../ai/gemini');
const { saveActionItem, logMessage } = require('../db/supabase');

// Minimum confidence threshold for commitment detection
const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Register the message event handler on the Bolt app.
 * Listens to all messages in channels FlowDesk is invited to,
 * detects commitments, and DMs users to confirm tracking.
 */
function registerMessageHandler(app) {
  app.message(async ({ message, client, logger }) => {
    try {
      logger.info(`[DEBUG] Received a message event: "${message.text}" from user ${message.user} in channel ${message.channel}`);
      // Skip bot messages, message edits, deletions, and thread replies (for now)
      if (message.subtype) return;
      if (message.bot_id) return;
      if (message.thread_ts && message.thread_ts !== message.ts) return;
      if (!message.text || message.text.trim().length < 5) return;

      // Cache the message for /ask search
      logMessage({
        slackChannelId: message.channel,
        slackUserId: message.user,
        messageTs: message.ts,
        messageText: message.text,
      });

      // Get user and channel info for context
      let userName = 'someone';
      let channelName = 'unknown';

      try {
        const [userInfo, channelInfo] = await Promise.all([
          client.users.info({ user: message.user }),
          client.conversations.info({ channel: message.channel }),
        ]);
        userName = userInfo.user?.real_name || userInfo.user?.name || 'someone';
        channelName = channelInfo.channel?.name || 'unknown';
      } catch (e) {
        // Non-critical — continue with defaults
        logger.warn('Could not fetch user/channel info:', e.message);
      }

      // Detect commitment using Gemini
      const result = await detectCommitment(message.text, {
        userName,
        channelName,
        currentDate: new Date().toISOString(),
      });

      if (!result.isCommitment || result.confidence < CONFIDENCE_THRESHOLD) {
        return; // Not a commitment or low confidence — skip
      }

      // Save to Supabase as pending
      const actionItem = await saveActionItem({
        slackUserId: message.user,
        slackChannelId: message.channel,
        messageTs: message.ts,
        commitmentText: result.commitmentText,
        deadline: result.deadline,
      });

      // Build deadline display text
      let deadlineText = '';
      if (result.deadlineDescription) {
        deadlineText = `\n📅 *Deadline:* ${result.deadlineDescription}`;
      }

      // DM the user with confirm/dismiss buttons
      await client.chat.postMessage({
        channel: message.user, // DM the user
        text: `I noticed you made a commitment in #${channelName}. Want to track it?`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎯 *I noticed a commitment in #${channelName}:*\n\n> ${result.commitmentText}${deadlineText}`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '✅ Track it', emoji: true },
                style: 'primary',
                action_id: 'confirm_commitment',
                value: actionItem.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: '❌ Dismiss', emoji: true },
                action_id: 'dismiss_commitment',
                value: actionItem.id,
              },
            ],
          },
        ],
      });

      logger.info(
        `Commitment detected for ${userName} in #${channelName}: "${result.commitmentText}" (confidence: ${result.confidence})`
      );
    } catch (error) {
      logger.error('Error in message handler:', error);
    }
  });
}

module.exports = { registerMessageHandler };
