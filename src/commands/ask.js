const { searchMessages } = require('../db/supabase');
const { synthesizeSearchResults } = require('../ai/gemini');

async function handleAskCommand({ command, ack, respond, client, logger }) {
  // Acknowledge the command request immediately (Slack requires ack within 3s)
  await ack();

  const query = command.text.trim();
  if (!query) {
    await respond({
      text: 'Please provide a question to search for. Usage: `/ask [your question]`',
      response_type: 'ephemeral',
    });
    return;
  }

  // Send a temporary "thinking" message
  await respond({
    text: `🔍 Searching workspace history for: *"${query}"*...`,
    response_type: 'ephemeral',
  });

  try {
    // 1. Fetch relevant messages from Supabase
    const searchResults = await searchMessages(query, 15);

    if (!searchResults || searchResults.length === 0) {
      await respond({
        text: `Sorry, I couldn't find any relevant messages for *"${query}"*.`,
        replace_original: true,
        response_type: 'ephemeral',
      });
      return;
    }

    // Map messages for Gemini, trying to resolve usernames if possible
    // To keep it fast, we use raw slack_user_id, but ideally we'd fetch names.
    const messagesForAi = searchResults.map(msg => ({
      user: `<@${msg.slack_user_id}>`,
      date: new Date(msg.created_at).toLocaleDateString(),
      text: msg.message_text,
    }));

    // 2. Synthesize answer with Gemini
    const answer = await synthesizeSearchResults(query, messagesForAi);

    // 3. Post the final answer
    await respond({
      text: `*Q: ${query}*\n\n${answer}`,
      replace_original: true,
      response_type: 'ephemeral',
    });

  } catch (error) {
    logger.error('Error in /ask command:', error);
    await respond({
      text: '⚠️ Something went wrong while searching. Please try again later.',
      replace_original: true,
      response_type: 'ephemeral',
    });
  }
}

module.exports = { handleAskCommand };
