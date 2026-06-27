const { summarizeChannel } = require('../ai/gemini');

async function handleSummaryCommand({ command, ack, respond, client, logger }) {
  // Acknowledge the command request immediately
  await ack();

  const channelId = command.channel_id;

  // Send a temporary "thinking" message
  await respond({
    text: `📋 Generating a structured summary for <#${channelId}>... This might take a few seconds.`,
    response_type: 'ephemeral',
  });

  try {
    // 1. Fetch recent messages from the channel (last 100 messages)
    const history = await client.conversations.history({
      channel: channelId,
      limit: 50, // Grab the last 50 messages to summarize
    });

    if (!history.messages || history.messages.length === 0) {
      await respond({
        text: `There are no recent messages in <#${channelId}> to summarize.`,
        replace_original: true,
        response_type: 'ephemeral',
      });
      return;
    }

    // Map messages for Gemini
    // Filter out bot messages and system join messages for cleaner summary
    const messagesForAi = history.messages
      .filter(msg => !msg.bot_id && !msg.subtype)
      .map(msg => ({
        user: `<@${msg.user}>`,
        text: msg.text,
        date: new Date(msg.ts * 1000).toLocaleString(),
      }))
      .reverse(); // Reverse to chronological order

    if (messagesForAi.length === 0) {
      await respond({
        text: `Not enough human conversation in <#${channelId}> to summarize recently.`,
        replace_original: true,
        response_type: 'ephemeral',
      });
      return;
    }

    // 2. Synthesize summary with Gemini
    const summary = await summarizeChannel(messagesForAi, channelId);

    // 3. Post the final summary
    await respond({
      text: summary,
      replace_original: true,
      response_type: 'ephemeral',
    });

  } catch (error) {
    logger.error('Error in /summary command:', error);
    await respond({
      text: '⚠️ Something went wrong while generating the summary. Please try again later.',
      replace_original: true,
      response_type: 'ephemeral',
    });
  }
}

module.exports = { handleSummaryCommand };
