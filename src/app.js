const { App, LogLevel } = require('@slack/bolt');
const { getConfig } = require('./config');
// Comment out the retriever for local testing
// const { initializeRetriever } = require('./rag/retriever');
// const { generateAnswer } = require('./rag/generator');
const { registerInteractionHandlers } = require('./slack/interactions');

// Cache the retriever instance
let retriever = null; // Set to null for local testing

// Configuration for history fetching
const MAX_HISTORY_LENGTH = 15000; // Approx character limit for history string
const THREAD_HISTORY_LIMIT = 100;
const CHANNEL_HISTORY_LIMIT = 75;

// Improved error messages for users
const ERROR_MESSAGES = {
  RETRIEVER_UNAVAILABLE: (userId) => 
    `Sorry <@${userId}>, I can't access the knowledge base right now. The team has been notified. Try again in a few minutes?`,
  EMPTY_QUERY: (userId) =>
    `Hey <@${userId}>! What do you need help with? Just @ me with your question.`,
  RETRIEVAL_ERROR: (userId) =>
    `Sorry <@${userId}>, I ran into a problem finding relevant information. Check back in a bit?`,
  GENERATION_ERROR: (userId) =>
    `Sorry <@${userId}>, I found some info but couldn't process it correctly. The team's been notified.`,
  NO_DOCUMENTS: (userId) =>
    `Hi <@${userId}>. I looked through our docs but couldn't find anything about that. Could you try rephrasing or be more specific?`,
  UNEXPECTED_ERROR: (userId) =>
    `Sorry <@${userId}>, something unexpected happened. The team has been notified.`
};

/**
 * Formats an array of Slack messages into a chronological string, applying truncation if needed.
 * @param {Array<object>} messages - Array of Slack message objects.
 * @param {string} botUserId - The User ID of the bot.
 * @param {number} maxLength - The maximum character length allowed for the history string.
 * @returns {string} - The formatted (and potentially truncated) history string.
 */
function formatSlackHistory(messages, botUserId, maxLength) {
  if (!messages || messages.length === 0) {
    return 'No relevant conversation history found.';
  }

  // Sort messages chronologically (oldest first)
  messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  let formattedHistory = messages
    .map((msg) => {
      const userName = msg.user === botUserId ? 'Bot' : `<@${msg.user}>`;
      const timestamp = new Date(parseFloat(msg.ts) * 1000).toLocaleString(); // Human-readable time
      return `${userName} [${timestamp}]: ${msg.text}`;
    })
    .join('\n');

  if (formattedHistory.length > maxLength) {
    console.warn(
      `Original history length (${formattedHistory.length}) exceeds max length (${maxLength}). Truncating oldest messages.`
    );
    let truncatedLength = formattedHistory.length;
    const lines = formattedHistory.split('\n');
    let linesToRemove = 0;

    while (truncatedLength > maxLength && linesToRemove < lines.length) {
      truncatedLength -= lines[linesToRemove].length + 1; // +1 for newline char
      linesToRemove++;
    }

    // Keep the most recent messages
    formattedHistory = lines.slice(linesToRemove).join('\n');
    formattedHistory = `[... History truncated due to length ...]\n${formattedHistory}`;
    console.warn(`Truncated history length: ${formattedHistory.length}`);
  }

  return formattedHistory;
}

async function main() {
  // Load configuration first
  const config = await getConfig();

  // Skip retriever initialization for local testing
  console.log('TESTING MODE: Skipping retriever initialization.');

  // Determine connection mode (Socket Mode if appToken is present)
  // Note: PLAN-02 config loading uses camelCase keys
  const useSocketMode = !!config.slackAppToken;

  // Initialize Bolt App
  const app = new App({
    token: config.slackBotToken,
    signingSecret: useSocketMode ? undefined : config.slackSigningSecret, // Only needed for HTTP
    socketMode: useSocketMode,
    appToken: useSocketMode ? config.slackAppToken : undefined, // Only needed for Socket Mode
    logLevel: LogLevel.INFO, // Use DEBUG for more verbose logs during development
    // port: Number(process.env.PORT) || 3000 // Bolt's default is 3000, Cloud Run uses 8080. app.start() handles this.
  });

  // --- Event Listeners --- //

  // Listens for mentions (@YourBotName hello)
  app.event('app_mention', async ({ event, client, context, say, logger }) => {
    logger.info(
      `Received app_mention event from user ${event.user} in channel ${event.channel} (thread: ${event.thread_ts})`,
      {
        userId: event.user,
        channelId: event.channel,
        threadTs: event.thread_ts,
        messageTs: event.ts,
        text: event.text, // Log the mention text
      }
    );

    // FOR LOCAL TESTING: Always return a simple response rather than using the retriever
    try {
      await say({
        text: `Hi <@${event.user}>! I'm the On-Call Support Bot running in local testing mode. The RAG pipeline is disabled.`,
        thread_ts: event.thread_ts || event.ts,
        blocks: [
          { 
            type: 'section', 
            text: { 
              type: 'mrkdwn', 
              text: `Hi <@${event.user}>! I'm the On-Call Support Bot running in local testing mode. The RAG pipeline is disabled.` 
            } 
          },
          {
            type: 'actions',
            block_id: 'actions_block_incident', // Unique block ID
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📄 Log Incident',
                  emoji: true,
                },
                style: 'primary',
                action_id: 'log_incident_button', // Unique action ID
              },
            ],
          },
        ],
      });
      logger.info('Test response sent.');
    } catch (error) {
      logger.error('Error sending test response:', error);
    }
  });

  // --- Generic Error Handler --- //
  app.error(async (error) => {
    // Bolt-level error handler
    console.error('## Bolt App Error ##');
    console.error(JSON.stringify(error, null, 2));
    // In a real app, you might send this to an error tracking service
  });

  // Register interaction handlers for buttons, etc.
  registerInteractionHandlers(app, config);

  // --- Start the App --- //
  await app.start();
  console.log(
    `⚡️ Bolt app is running! (Mode: ${useSocketMode ? 'Socket Mode' : 'HTTP'})`
  );
}

// --- Run the App --- //
main().catch((error) => {
  console.error('FATAL: Failed to start application:');
  console.error(error);
  process.exit(1);
});
