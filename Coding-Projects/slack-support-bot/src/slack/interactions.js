/**
 * Slack Interaction Handlers (button clicks, etc.)
 * These get registered in src/app.js
 */

/**
 * Register interaction handlers with the app instance.
 * @param {import('@slack/bolt').App} app - The initialized Bolt app instance.
 * @param {Object} config - The loaded application configuration.
 */
function registerInteractionHandlers(app, config) {
  // Handler for the "Log Incident" button click
  app.action('log_incident_button', async ({ ack, body, client, logger }) => {
    // Always acknowledge the interaction immediately
    await ack();
    logger.info('Log Incident button clicked', {
      user: body.user.id,
      channel: body.channel.id,
      messageTs: body.message.ts,
    });

    try {
      // Extract context from the event
      const userWhoClicked = body.user.id;
      const clickedMessageTs = body.message.ts;
      const originalChannel = body.channel.id;
      const threadTs = body.message.thread_ts || body.message.ts;
      const ticketingChannelId = config.ticketingChannelId;

      // Extract the original message text (question & answer)
      // The message structure will vary, so we need to handle both simple text
      // and block-structured messages
      let originalText = '';
      let botResponse = '';

      if (body.message.blocks && body.message.blocks.length > 0) {
        // Extract text from the first section block (if available)
        const firstBlock = body.message.blocks.find(
          (block) => block.type === 'section'
        );
        if (firstBlock && firstBlock.text && firstBlock.text.text) {
          botResponse = firstBlock.text.text;
        }
      }

      // Fallback to plain text if blocks aren't available or formatted as expected
      if (!botResponse && body.message.text) {
        botResponse = body.message.text;
      }

      // Get the thread history to find the original question
      const threadHistory = await client.conversations.replies({
        channel: originalChannel,
        ts: threadTs,
        limit: 10, // Usually the question is the first message in the thread
      });

      if (
        threadHistory.messages &&
        threadHistory.messages.length > 0 &&
        threadHistory.messages[0].text
      ) {
        // First message in thread is typically the original question
        originalText = threadHistory.messages[0].text;
      }

      // Create a permalink to the original message
      const permalink = await client.chat.getPermalink({
        channel: originalChannel,
        message_ts: threadTs,
      });

      // Format the incident log message
      const incidentMessage = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 New Support Incident Logged',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Logged by:* <@${userWhoClicked}>`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Original Question:*\n>${originalText.replace(
                /\n/g,
                '\n>'
              )}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Answer from Bot:*\n>${botResponse.replace(/\n/g, '\n>')}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*<${permalink.permalink}|View Thread>*`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Logged on: ${new Date().toLocaleString()}`,
              },
            ],
          },
        ],
      };

      // Post the message to the ticketing channel
      const result = await client.chat.postMessage({
        channel: ticketingChannelId,
        ...incidentMessage,
      });

      logger.info('Incident logged successfully', {
        channel: ticketingChannelId,
        messageTs: result.ts,
      });

      // Optionally notify the user who clicked the button
      await client.chat.postMessage({
        channel: originalChannel,
        thread_ts: threadTs,
        text: `Thanks <@${userWhoClicked}>! I've logged this incident. <#${ticketingChannelId}|incident-log>`,
      });
    } catch (error) {
      logger.error('Error handling Log Incident button click', error);

      // Try to notify the user that something went wrong
      try {
        await client.chat.postMessage({
          channel: body.channel.id,
          thread_ts: body.message.thread_ts || body.message.ts,
          text: `Sorry <@${body.user.id}>, there was an error logging this incident. Please try again or contact an administrator.`,
        });
      } catch (notifyError) {
        logger.error('Failed to send error notification to user', notifyError);
      }
    }
  });

  console.log('Slack interaction handlers registered successfully');
}

module.exports = { registerInteractionHandlers };
