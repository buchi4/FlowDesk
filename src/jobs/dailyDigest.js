const cron = require('node-cron');
const { supabase, getActionItemsByUser, getRecentDecisions } = require('../db/supabase');
const { generateDigest } = require('../ai/gemini');

async function runDailyDigest(app, specificUserId = null) {
  console.log('[Scheduler] Starting Daily Digest generation...');
  
  try {
    let userIdsToDigest = [];

    if (specificUserId) {
      userIdsToDigest = [specificUserId];
    } else {
      // 1. Get all users who have digest enabled
      const { data: users, error } = await supabase
        .from('user_preferences')
        .select('slack_user_id')
        .eq('digest_enabled', true);

      if (error) throw error;
      
      // If the user preferences table is empty (e.g. hackathon), we might just
      // fetch all users who have open action items instead as a fallback
      userIdsToDigest = users?.map(u => u.slack_user_id) || [];
      
      if (userIdsToDigest.length === 0) {
         // Fallback: get unique users with open items
         const { data: pendingUsers } = await supabase
           .from('action_items')
           .select('slack_user_id')
           .eq('status', 'confirmed');
           
         if (pendingUsers) {
           userIdsToDigest = [...new Set(pendingUsers.map(u => u.slack_user_id))];
         }
      }
    }

    for (const userId of userIdsToDigest) {
      // Fetch user info for personalization
      let userName = 'there';
      try {
        const userInfo = await app.client.users.info({ user: userId });
        userName = userInfo.user?.profile?.first_name || userInfo.user?.real_name || 'there';
      } catch (e) {
        // Ignore
      }

      // Fetch their open items
      const openItems = await getActionItemsByUser(userId);
      
      // Fetch recent decisions across channels they are in
      // (For simplicity in the hackathon, we'll just grab recent decisions globally,
      // but in prod you'd filter by channels the user is a member of)
      const recentDecisions = await getRecentDecisions('global', 5); 

      // Generate the digest using Gemini
      const digestText = await generateDigest({
        userName,
        openItems,
        recentActivity: [], // Could be hydrated with `conversations.history` across their channels
        decisions: recentDecisions
      });

      // Send the DM
      await app.client.chat.postMessage({
        channel: userId,
        text: '☀️ Your Daily FlowDesk Digest',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '☀️ Good Morning', emoji: true }
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: digestText }
          }
        ]
      });
    }
    
    console.log('[Scheduler] Daily Digest completed.');
  } catch (error) {
    console.error('Error running daily digest job:', error);
  }
}

/**
 * Start the daily digest cron job.
 * Runs at 9:00 AM server time. For a production app, you would
 * use the user_preferences table to schedule it per-user at their local 9AM.
 */
function startDailyDigestJob(app) {
  // Run at 9:00 AM every day
  cron.schedule('0 9 * * *', async () => {
    await runDailyDigest(app);
  });

  console.log('[Scheduler] Daily Digest job scheduled for 09:00 AM');
}

module.exports = { startDailyDigestJob, runDailyDigest };
