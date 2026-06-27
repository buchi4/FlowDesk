const { GoogleGenAI } = require('@google/genai');
const config = require('../config');

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// ─── Commitment Detection ───────────────────────────────────

const COMMITMENT_SYSTEM_PROMPT = `You are an expert at detecting actionable commitments in Slack messages.

Your job is to determine if a message contains a REAL commitment — something the sender is personally promising to do, with a clear action.

RULES:
- A commitment must be a personal promise to do something specific
- The sender must be the one committing (not asking someone else)
- Vague intentions ("I'll think about it", "maybe I'll look into it") are NOT commitments
- Requests and questions are NOT commitments
- Simple acknowledgments ("sounds good", "ok") are NOT commitments

EXAMPLES OF REAL COMMITMENTS:
- "I'll send the proposal by Thursday" → YES
- "I'll handle the onboarding call" → YES
- "Let me put together the report this week" → YES
- "I'll review the PR before EOD" → YES
- "I can take care of the deployment tomorrow" → YES

EXAMPLES OF NON-COMMITMENTS:
- "I'll think about it" → NO (too vague)
- "I'd love to help" → NO (no specific action)
- "Can you send me the report?" → NO (request, not commitment)
- "That sounds good" → NO (acknowledgment)
- "We should probably update the docs" → NO (suggestion, not personal commitment)
- "Someone needs to fix the CI" → NO (not personal)

Respond ONLY with valid JSON, no markdown fences. Use this exact format:
{
  "isCommitment": true/false,
  "confidence": 0.0-1.0,
  "commitmentText": "concise description of what was committed to",
  "deadline": "ISO 8601 datetime string or null if no deadline mentioned",
  "deadlineDescription": "human readable deadline or null"
}

If isCommitment is false, set commitmentText to null, deadline to null, and deadlineDescription to null.

When extracting deadlines, interpret relative terms based on the current date/time provided. Examples:
- "by Friday" → the coming Friday
- "by EOD" → end of today
- "tomorrow" → tomorrow
- "this week" → end of this week (Friday)
- "next Monday" → the following Monday`;

/**
 * Detect if a message contains an actionable commitment.
 * Returns structured data about the commitment.
 */
async function detectCommitment(messageText, context = {}) {
  const { userName, channelName, currentDate } = context;

  const userPrompt = `Current date/time: ${currentDate || new Date().toISOString()}
Channel: #${channelName || 'unknown'}
User: ${userName || 'someone'}

Message: "${messageText}"

Analyze this message. Is it a commitment?`;

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents: userPrompt,
      config: {
        systemInstruction: COMMITMENT_SYSTEM_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 300,
      },
    });

    const text = response.text.trim();

    // Parse JSON — handle potential markdown code fences
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    return {
      isCommitment: result.isCommitment === true,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      commitmentText: result.commitmentText || null,
      deadline: result.deadline || null,
      deadlineDescription: result.deadlineDescription || null,
    };
  } catch (error) {
    console.error('Gemini commitment detection error:', error.message);
    return {
      isCommitment: false,
      confidence: 0,
      commitmentText: null,
      deadline: null,
      deadlineDescription: null,
    };
  }
}

// ─── Search Result Synthesis ────────────────────────────────

const SEARCH_SYSTEM_PROMPT = `You are FlowDesk, a Slack assistant. A user asked a question about their workspace history.

You will be given a set of Slack messages from the workspace. Your job is to:
1. Read through them and find the answer to the user's question
2. Synthesize a clear, direct answer
3. Cite specific messages by their index number

FORMAT YOUR RESPONSE LIKE THIS:
- Start with a direct answer to the question
- Use bullet points for key findings
- End with "📎 Sources: [1], [3], [5]" listing which messages you drew from

Keep it concise — 2-4 sentences for the answer, plus sources. Don't repeat the question.
If the messages don't contain relevant information, say so honestly.`;

/**
 * Synthesize search results into a direct answer.
 */
async function synthesizeSearchResults(query, messages) {
  const formattedMessages = messages
    .map((m, i) => `[${i + 1}] ${m.user || 'Unknown'} (${m.date || 'unknown date'}): ${m.text}`)
    .join('\n');

  const userPrompt = `Question: "${query}"

Relevant messages from Slack:
${formattedMessages}`;

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents: userPrompt,
      config: {
        systemInstruction: SEARCH_SYSTEM_PROMPT,
        temperature: 0.3,
        maxOutputTokens: 800,
      },
    });

    return response.text.trim();
  } catch (error) {
    console.error('Gemini search synthesis error:', error.message);
    return "Sorry, I couldn't process that search right now. Please try again in a moment.";
  }
}

// ─── Channel Summary ────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `You are FlowDesk, a Slack assistant. Summarize the recent channel activity into a structured brief.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

📋 *What's happening*
Brief 2-3 sentence overview of the main topics being discussed.

✅ *Decisions made*
- Decision 1
- Decision 2
(or "No clear decisions detected" if none)

🎯 *Open action items*
- @person committed to X (due: date)
- @person is working on Y
(or "No open items" if none)

⚠️ *Needs response*
- Question from @person about X
- @person asked for feedback on Y
(or "Nothing urgent" if none)

Keep it concise and scannable. Use Slack formatting (*bold*, _italic_). Reference users by their display name.`;

/**
 * Summarize recent channel activity.
 */
async function summarizeChannel(messages, channelName) {
  const formattedMessages = messages
    .map((m) => `${m.user || 'Unknown'} (${m.date || 'unknown'}): ${m.text}`)
    .join('\n');

  const userPrompt = `Summarize the recent activity in #${channelName || 'this channel'}:

${formattedMessages}`;

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents: userPrompt,
      config: {
        systemInstruction: SUMMARY_SYSTEM_PROMPT,
        temperature: 0.3,
        maxOutputTokens: 1000,
      },
    });

    return response.text.trim();
  } catch (error) {
    console.error('Gemini summary error:', error.message);
    return "Sorry, I couldn't generate a summary right now. Please try again in a moment.";
  }
}

// ─── Daily Digest ───────────────────────────────────────────

const DIGEST_SYSTEM_PROMPT = `You are FlowDesk, a friendly Slack assistant generating a personalized morning brief.

Write in a warm, human tone — like a helpful colleague, not a robot.

FORMAT:
Start with a brief greeting, then:

🎯 *Your open items*
List their action items with deadlines and status.

📰 *What happened while you were away*
Brief summary of notable channel activity.

💡 *Heads up*
Anything that might need their attention today.

Keep it concise and actionable. If there are no items in a section, skip it entirely.
End with something encouraging.`;

/**
 * Generate a personalized daily digest for a user.
 */
async function generateDigest({ userName, openItems, recentActivity, decisions }) {
  const sections = [];

  if (openItems?.length) {
    sections.push(
      'Open action items:\n' +
        openItems
          .map((item) => `- "${item.commitment_text}" (due: ${item.deadline || 'no deadline'})`)
          .join('\n')
    );
  }

  if (recentActivity?.length) {
    sections.push(
      'Recent channel activity:\n' +
        recentActivity.map((a) => `- #${a.channel}: ${a.summary}`).join('\n')
    );
  }

  if (decisions?.length) {
    sections.push(
      'Recent decisions:\n' +
        decisions.map((d) => `- ${d.decision_summary}`).join('\n')
    );
  }

  const userPrompt = `Generate a morning brief for ${userName || 'this user'}.

${sections.join('\n\n') || 'No notable activity to report.'}`;

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents: userPrompt,
      config: {
        systemInstruction: DIGEST_SYSTEM_PROMPT,
        temperature: 0.5,
        maxOutputTokens: 800,
      },
    });

    return response.text.trim();
  } catch (error) {
    console.error('Gemini digest error:', error.message);
    return "Good morning! I had trouble generating your brief today — I'll try again tomorrow. ☀️";
  }
}

module.exports = {
  detectCommitment,
  synthesizeSearchResults,
  summarizeChannel,
  generateDigest,
};
