const cron = require('node-cron');
const { getPendingReminders, markReminderSent } = require('../db/supabase');

/**
 * Start the reminder cron job.
 * Runs at the top of every hour to check for upcoming deadlines.
 */
function startReminderJob(app) {
  // Run every hour at minute 0: '0 * * * *'
  // For hackathon/testing, you can change to '* * * * *' (every minute) to test
  cron.schedule('0 * * * *', async () => {
    try {
      const items = await getPendingReminders();
      
      if (items.length === 0) return;

      for (const item of items) {
        // Send a DM to the user
        await app.client.chat.postMessage({
          channel: item.slack_user_id,
          text: '⏰ Reminder: You have an upcoming commitment deadline!',
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '⏰ Deadline approaching', emoji: true }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Just a friendly reminder about your commitment from <#${item.slack_channel_id}>:\n\n> *${item.commitment_text}*\n\nIt's due on ${new Date(item.deadline).toLocaleString()}.`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Mark Complete', emoji: true },
                  action_id: 'complete_task',
                  value: item.id
                }
              ]
            }
          ]
        });

        // Mark as reminded so we don't spam them
        await markReminderSent(item.id);
      }
    } catch (error) {
      console.error('Error running reminder cron job:', error);
    }
  });

  console.log('[Scheduler] Reminder job started');
}

module.exports = { startReminderJob };
