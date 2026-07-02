const { runDailyDigest } = require('../jobs/dailyDigest');

async function handleTestDigestCommand({ command, ack, respond, app, logger }) {
  // Acknowledge the command request immediately
  await ack();

  const userId = command.user_id;

  // Send a temporary "thinking" message
  await respond({
    text: `📨 Generating your Daily Digest on-demand...`,
    response_type: 'ephemeral',
  });

  try {
    // Run the digest just for this user
    await runDailyDigest(app, userId);

    await respond({
      text: '✅ Digest delivered! Check your DMs.',
      replace_original: true,
      response_type: 'ephemeral',
    });
  } catch (error) {
    logger.error('Error in /testdigest command:', error);
    await respond({
      text: '⚠️ Something went wrong while generating the digest. Please try again later.',
      replace_original: true,
      response_type: 'ephemeral',
    });
  }
}

module.exports = { handleTestDigestCommand };
