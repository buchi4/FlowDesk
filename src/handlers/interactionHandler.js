const { updateActionItemStatus } = require('../db/supabase');

/**
 * Register interactive action handlers on the Bolt app.
 * Handles button clicks for confirm/dismiss/complete actions.
 */
function registerInteractionHandlers(app) {
  // ─── Confirm Commitment ────────────────────────────────────
  app.action('confirm_commitment', async ({ ack, body, client, logger }) => {
    await ack();

    const itemId = body.actions[0].value;

    try {
      await updateActionItemStatus(itemId, 'confirmed');

      // Update the original DM message to show confirmation
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: '✅ Commitment tracked!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Tracked!* I'll remind you when the deadline approaches.\n\nUse \`/mytasks\` to see all your commitments.`,
            },
          },
        ],
      });

      logger.info(`Commitment confirmed: ${itemId}`);
    } catch (error) {
      logger.error('Error confirming commitment:', error);
      await client.chat.postMessage({
        channel: body.user.id,
        text: "⚠️ Something went wrong confirming that item. Please try `/mytasks` to check your items.",
      });
    }
  });

  // ─── Dismiss Commitment ────────────────────────────────────
  app.action('dismiss_commitment', async ({ ack, body, client, logger }) => {
    await ack();

    const itemId = body.actions[0].value;

    try {
      await updateActionItemStatus(itemId, 'dismissed');

      // Update the original DM message
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: '👍 Dismissed — won\'t track this one.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👍 *Dismissed.* I won't track this one.`,
            },
          },
        ],
      });

      logger.info(`Commitment dismissed: ${itemId}`);
    } catch (error) {
      logger.error('Error dismissing commitment:', error);
    }
  });

  // ─── Complete Task (from /mytasks) ─────────────────────────
  app.action('complete_task', async ({ ack, body, client, logger }) => {
    await ack();

    const itemId = body.actions[0].value;

    try {
      await updateActionItemStatus(itemId, 'completed');

      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: body.user.id,
        text: `🎉 Task marked as complete!`,
      });

      logger.info(`Task completed: ${itemId}`);
    } catch (error) {
      logger.error('Error completing task:', error);
    }
  });
}

module.exports = { registerInteractionHandlers };
