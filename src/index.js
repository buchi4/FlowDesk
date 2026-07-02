const { App } = require('@slack/bolt');
const config = require('./config');
const { registerMessageHandler } = require('./handlers/messageHandler');
const { registerInteractionHandlers } = require('./handlers/interactionHandler');
const { handleAskCommand } = require('./commands/ask');
const { handleSummaryCommand } = require('./commands/summary');
const { handleTestDigestCommand } = require('./commands/testdigest');
const { startReminderJob } = require('./jobs/reminders');
const { startDailyDigestJob } = require('./jobs/dailyDigest');

// ─── Initialize Bolt App ────────────────────────────────────

const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  appToken: config.slack.appToken,
  // Disable built-in receiver for Socket Mode
  port: config.port,
});

// ─── Register Handlers ──────────────────────────────────────

// Phase 1: Message event handler (commitment detection)
registerMessageHandler(app);

// Phase 1: Interactive action handlers (confirm/dismiss/complete)
registerInteractionHandlers(app);

// ─── Phase 2: Slash Commands (stubs for now) ────────────────

app.command('/ask', handleAskCommand);
app.command('/summary', handleSummaryCommand);

app.command('/mytasks', async ({ ack, respond, command }) => {
  await ack();
  // Phase 2: This will show actual tasks
  const { getActionItemsByUser } = require('./db/supabase');

  try {
    const items = await getActionItemsByUser(command.user_id);

    if (items.length === 0) {
      await respond({
        text: "🎉 You're all clear! No open commitments.",
        response_type: 'ephemeral',
      });
      return;
    }

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🎯 Your Open Commitments', emoji: true },
      },
      { type: 'divider' },
    ];

    for (const item of items) {
      const deadlineStr = item.deadline
        ? `📅 Due: ${new Date(item.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
        : '📅 No deadline set';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${item.commitment_text}*\n   ${deadlineStr} · <#${item.slack_channel_id}>`,
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Done', emoji: true },
          action_id: 'complete_task',
          value: item.id,
        },
      });
    }

    await respond({
      blocks,
      text: `You have ${items.length} open commitment(s).`,
      response_type: 'ephemeral',
    });
  } catch (error) {
    console.error('Error in /mytasks:', error);
    await respond({
      text: '⚠️ Something went wrong fetching your tasks. Please try again.',
      response_type: 'ephemeral',
    });
  }
});

app.command('/flowhelp', async ({ ack, respond }) => {
  await ack();
  await respond({
    text: 'FlowDesk Help',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📚 FlowDesk — Your Chief of Staff', emoji: true },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*FlowDesk watches your channels and helps you stay on top of commitments.*\n\n' +
            '🎯 *Auto-Tracking*\n' +
            "When you say something like _\"I'll send the report by Friday\"_, FlowDesk detects it and DMs you to confirm.\n\n" +
            '📋 *Commands:*\n' +
            '• `/mytasks` — See all your open commitments\n' +
            '• `/ask [question]` — Search channel history with AI\n' +
            '• `/summary` — Get a structured brief of the current channel\n' +
            '• `/flowhelp` — This help message\n\n' +
            '☀️ *Daily Digest*\n' +
            'Every morning, FlowDesk DMs you a personalized brief of what matters.\n\n' +
            '_Add FlowDesk to any channel to start tracking commitments there._',
        },
      },
    ],
    response_type: 'ephemeral',
  });
});

// Demo command for Devpost video
app.command('/testdigest', async ({ command, ack, respond, logger }) => {
  // We need to pass `app` down because runDailyDigest expects it.
  const { handleTestDigestCommand } = require('./commands/testdigest');
  await handleTestDigestCommand({ command, ack, respond, app, logger });
});

// ─── Start the App ──────────────────────────────────────────

(async () => {
  await app.start();
  
  // Start background jobs
  startReminderJob(app);
  startDailyDigestJob(app);
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   ⚡ FlowDesk is running!            ║');
  console.log('  ║                                      ║');
  console.log('  ║   Mode: Socket Mode                  ║');
  console.log(`  ║   Port: ${config.port}                         ║`);
  console.log('  ║                                      ║');
  console.log('  ║   Listening for:                      ║');
  console.log('  ║   • Messages (commitment detection)  ║');
  console.log('  ║   • /mytasks, /ask, /summary          ║');
  console.log('  ║   • /flowhelp                         ║');
  console.log('  ║   • Button interactions               ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
})();
