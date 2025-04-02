# Work Plan: Implement "Log Incident" Ticketing Action

- **Task ID**: `PLAN-10-TicketingAction`
- **Problem Statement**: Implement the Slack interaction handler for the "Log Incident" button added in previous steps. When clicked, the handler should gather context from the conversation thread, format it into a structured message, and post that message to a designated "incidents" channel (acting as a simple ticketing system/Slack List). It should also confirm back to the original thread that the incident was logged.
- **Components Involved**:
  - `src/app.js` (Registering the action handler)
  - `src/slack/interactions.js` (New file for interaction logic)
  - `src/config/index.js` (Loading `TICKET_CHANNEL_ID`)
  - `@slack/bolt` (App instance for `app.action`, client methods like `conversations.replies`, `chat.postMessage`, `users.info`, `chat.getPermalink`)
- **Dependencies**:
  - `PLAN-07-RAGIntegration` completed (Button is being added to responses).
  - `PLAN-02-SecretsConfig` completed (`TICKET_CHANNEL_ID` loaded).
  - Slack Bot Token scopes include `chat:write`, `users:read`, history scopes (e.g., `channels:history`), potentially `reactions:write` (for confirmation).
  - The designated `TICKET_CHANNEL_ID` exists in Slack and the bot is a member of that channel.
- **Implementation Checklist**:

  - \[ ] **Create `src/slack/interactions.js`:**

    - \[ ] Import necessary Slack client types or utilities if needed (though direct client use via handler args is common).
    - \[ ] Define an async function `handleLogIncidentAction({ ack, body, client, say, logger, config })`. Note: `config` needs to be passed or accessible.

      ```javascript
      // src/slack/interactions.js

      // Helper to format the ticket message
      async function formatTicketMessage(
        body,
        threadMessages,
        client,
        permalink,
        reporterName
      ) {
        const contextSummary = (threadMessages || [])
          .map((m) => {
            // Basic formatting, consider more complex rendering if needed
            const timestamp = new Date(parseFloat(m.ts) * 1000).toISOString();
            // Try to get user name (might require separate fetching/caching - skip for V1 simplicity)
            const userLabel = m.user
              ? `<@${m.user}>`
              : m.bot_id
                ? `Bot <@${m.bot_id}>`
                : 'Unknown';
            return `*${userLabel}* [${timestamp}]:\n${m.text}`;
          })
          .join('\n\n'); // Use double newline for better separation

        const initialUserQuery =
          threadMessages?.[0]?.text?.substring(0, 100) || 'N/A'; // Rough guess at initial query

        const ticketBlocks = [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 Incident Reported: ${initialUserQuery}...`,
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Reported By:* ${reporterName || `<@${body.user.id}>`}`,
              },
              { type: 'mrkdwn', text: `*Status:* 🆕 New` }, // Default status
              {
                type: 'mrkdwn',
                text: `*Timestamp:* <!date^${Math.floor(
                  Date.now() / 1000
                )}^{date_num} {time_secs}|${new Date().toISOString()}>`,
              },
              { type: 'mrkdwn', text: `*Source Thread:* <${permalink}|Link>` },
            ],
          },
          {
            type: 'divider',
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `Logged via On-Call Bot` }],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                '*Thread Context Summary:*\n' +
                contextSummary.substring(0, 2800), // Slack block character limit
            },
          },
          // Add more sections/fields here if needed to match a structured "List"
        ];
        return ticketBlocks;
      }

      async function handleLogIncidentAction({
        ack,
        body,
        client,
        say,
        logger,
        config,
      }) {
        await ack(); // Acknowledge button click immediately (within 3s)
        logger.info(
          `'Log Incident' button clicked by ${body.user.id} in channel ${body.channel.id}`
        );

        try {
          const channelId = body.channel.id;
          // The message TS where the button was clicked. This SHOULD be the thread_ts if button was in thread.
          const threadTs = body.message?.thread_ts || body.message.ts;
          const messageTs = body.message.ts; // TS of the message containing the button

          // 1. Fetch Thread Context (crucial for the ticket)
          let threadMessages = [];
          if (threadTs) {
            try {
              const threadContext = await client.conversations.replies({
                channel: channelId,
                ts: threadTs,
                limit: 50, // Fetch a good amount of context
              });
              threadMessages = threadContext.messages || [];
              logger.info(
                `Fetched ${threadMessages.length} messages from thread ${threadTs}`
              );
            } catch (fetchError) {
              logger.error(
                `Failed to fetch thread replies for ts ${threadTs}: ${fetchError.message}`
              );
              // Proceed without detailed context, maybe just include original message?
              threadMessages = [body.message]; // Fallback to just the message with the button
            }
          } else {
            logger.warn(
              `Button clicked outside of a thread? Using button message ts ${messageTs} as context.`
            );
            threadMessages = [body.message]; // Should ideally not happen if button is only posted in threads
          }

          // 2. Get Permalink and User Info
          const [permalinkRes, userInfoRes] = await Promise.allSettled([
            client.chat.getPermalink({
              channel: channelId,
              message_ts: threadTs,
            }), // Link to the START of the thread
            client.users.info({ user: body.user.id }),
          ]);

          const permalink =
            permalinkRes.status === 'fulfilled'
              ? permalinkRes.value.permalink
              : '#';
          const reporterName =
            userInfoRes.status === 'fulfilled'
              ? userInfoRes.value.user?.real_name
              : null;

          // 3. Format the Ticket Message using Block Kit
          const ticketBlocks = await formatTicketMessage(
            body,
            threadMessages,
            client,
            permalink,
            reporterName
          );

          // 4. Post to the Designated Ticket Channel
          if (!config.ticketChannelId) {
            throw new Error('TICKET_CHANNEL_ID is not configured.');
          }

          const ticketPostResult = await client.chat.postMessage({
            channel: config.ticketChannelId,
            text: `New Incident Reported by ${
              reporterName || body.user.username
            }`, // Fallback text
            blocks: ticketBlocks,
            // Optional: Add metadata for easier parsing later?
          });
          logger.info(
            `Incident logged to channel ${config.ticketChannelId}, message ts: ${ticketPostResult.ts}`
          );

          // 5. Confirm in the Original Thread
          // Use say() passed to the handler for easy reply in context, OR use client.chat.postMessage
          await say({
            thread_ts: threadTs, // Ensure reply goes to the correct thread
            text: `✅ Incident logged for you in <#${config.ticketChannelId}>! (<${ticketPostResult.message.permalink}|View Logged Incident>)`,
          });

          // Optional: Add a reaction to the original button message
          try {
            await client.reactions.add({
              channel: channelId,
              name: 'white_check_mark', // Or ':page_facing_up:'
              timestamp: messageTs, // React to the message containing the button
            });
          } catch (reactionError) {
            logger.warn(`Could not add reaction: ${reactionError.message}`);
          }
        } catch (error) {
          logger.error('Error handling log_incident_button:', error);
          // Notify user in the original thread about the failure
          try {
            await say({
              thread_ts: body.message?.thread_ts || body.message.ts, // Reply in the correct thread
              text: `❌ Sorry, I couldn't log the incident. Error: ${error.message}`,
            });
          } catch (sayError) {
            logger.error(
              `Failed to send error message back to user: ${sayError.message}`
            );
          }
        }
      }

      module.exports = { handleLogIncidentAction };
      ```

  - \[ ] **Register Action Handler in `src/app.js`:**

    - \[ ] Import the handler function: `const { handleLogIncidentAction } = require('./slack/interactions');`.
    - \[ ] Get the `config` object after initialization.
    - \[ ] Register the handler using `app.action()`, passing the `action_id` specified on the button ('log_incident_button'). Pass config down if needed.

      ```javascript
      // Inside main() in src/app.js, after app initialization and getConfig()
      const config = await getConfig(); // Ensure config is loaded and accessible

      app.action('log_incident_button', (args) =>
        handleLogIncidentAction({ ...args, config })
      ); // Pass config down

      // ... rest of app.start() etc ...
      ```

- **Verification Steps**:
  1.  **Run Locally:** Start the application (`node src/app.js`).
  2.  **Trigger Bot Response:** Mention the bot to get a response containing the "Log Incident" button.
  3.  **Click Button:** Click the "Log Incident" button.
  4.  **Check Acknowledgement:** Verify the button click is acknowledged quickly (UI doesn't show an error).
  5.  **Check Ticket Channel:** Navigate to the Slack channel specified by `TICKET_CHANNEL_ID` in your `.env`. Verify a new message appears, formatted using the Block Kit defined in `formatTicketMessage`. Check that it includes:
      - Header with incident title guess.
      - Reporter's name.
      - Link to the source thread.
      - Timestamp.
      - Summary of the thread context.
  6.  **Check Original Thread:** Go back to the thread where you clicked the button. Verify a confirmation message appears ("✅ Incident logged...") with a link to the newly posted message in the ticket channel.
  7.  **Check Reaction (Optional):** If reaction adding was implemented, verify the ✅ reaction appears on the bot's message containing the button.
  8.  **Check Logs:** Review application logs for messages indicating the button click, context fetching, posting to the ticket channel, and posting the confirmation message. Check for any errors logged.
  9.  **Test Error Handling:** (Optional/Simulated) Temporarily set an invalid `TICKET_CHANNEL_ID` in `.env`. Click the button. Verify an error message is posted back to the original thread and logged by the application.
  10. **Code Review:** Examine `src/slack/interactions.js` for correct context fetching (`conversations.replies`), permalink/user info gathering, Block Kit formatting, posting to the correct channel, confirmation message logic, and error handling. Review the registration in `src/app.js`.
- **Decision Authority**:
  - AI **can** choose the exact Block Kit structure and wording for the message posted to the ticket channel, aiming for clarity and usefulness as a ticket summary.
  - AI **can** decide on the confirmation message wording and optional reaction emoji.
  - AI **must** fetch thread context using `conversations.replies`.
  - AI **must** post the ticket summary to the configured `TICKET_CHANNEL_ID`.
  - AI **must** confirm success or report failure back in the original thread.
- **Questions/Uncertainties**:
  - _Blocking_: None, assuming `TICKET_CHANNEL_ID` is valid and the bot is in that channel.
  - _Non-blocking_: Best way to summarize thread context (current approach is basic text join). Handling potential failures in fetching user info or permalink (current approach uses fallbacks/defaults). Exact Block Kit fields desired for the "ticket".
- **Acceptable Tradeoffs**:
  - Context summary is a simple concatenation of messages; it doesn't intelligently summarize.
  - Error handling for fetching context/user info/permalink is basic (uses fallbacks or logs errors).
  - The "ticket" posted is just a formatted message; it doesn't integrate with any formal ticketing system API beyond Slack.
- **Status**: Not Started
- **Notes**:
  - Acknowledging the action (`ack()`) within 3 seconds is required by Slack. Defer heavy work (like fetching history, posting messages) until after `ack()`.
  - Using `say` within the action handler is convenient for replying in the context where the button was clicked.
  - Ensure the bot user is invited to the `TICKET_CHANNEL_ID`.
  - Block Kit provides rich formatting options for the ticket message. Refer to Slack's Block Kit Builder for design ideas.
