# Work Plan: Basic Slack Bolt App Setup and Connection

- **Task ID**: `PLAN-03-SlackAppBase`
- **Problem Statement**: Initialize the core Slack Bolt application within `src/app.js`. This includes loading necessary configuration/secrets, setting up the Bolt `App` instance, implementing a simple listener for the `app_mention` event to confirm connectivity, and starting the Bolt server (either via HTTP or Socket Mode).
- **Components Involved**:
  - `src/app.js` (Primary implementation file)
  - `src/config/index.js` (Provides configuration/secrets)
  - `@slack/bolt` (The Slack SDK/Framework)
  - Slack Platform (Receiving events, posting messages)
  - `.env` (For local testing)
- **Dependencies**:
  - `PLAN-01-ProjectSetup` completed (Bolt dependency installed).
  - `PLAN-02-SecretsConfig` completed (Config loading function `getConfig` is available).
  - Slack App created in the Slack API dashboard.
  - Bot Token (`SLACK_BOT_TOKEN`) and Signing Secret (`SLACK_SIGNING_SECRET`) [or App Token (`SLACK_APP_TOKEN`) for Socket Mode] correctly populated in `.env` for local testing or Secret Manager for future deployment.
- **Implementation Checklist**:
  - \[ ] **Modify `src/app.js`**:
    - \[ ] Remove placeholder `console.log`.
    - \[ ] Import necessary modules: `App`, `LogLevel` from `@slack/bolt`, and `getConfig` from `./config`.
    - \[ ] Define an async `main` function to encapsulate the application startup logic.
    - \[ ] Inside `main`, call `const config = await getConfig();` to load configuration.
    - \[ ] **Determine Connection Mode:** Check for `config.slackAppToken` (or a dedicated env var like `USE_SOCKET_MODE=true`). Set a boolean flag `useSocketMode`.
    - \[ ] **Initialize Bolt App:** Create the `App` instance:
      ```javascript
      const app = new App({
        token: config.slackBotToken,
        signingSecret: useSocketMode ? undefined : config.slackSigningSecret, // Only needed for HTTP
        socketMode: useSocketMode,
        appToken: useSocketMode ? config.slackAppToken : undefined, // Only needed for Socket Mode
        logLevel: LogLevel.INFO, // Or LogLevel.DEBUG for more verbose logs
        // port: Number(process.env.PORT) || 3000 // Bolt's ExpressReceiver handles this automatically
      });
      ```
    - \[ ] **Implement Basic `app_mention` Listener:**
      ```javascript
      app.event(
        'app_mention',
        async ({ event, context, client, say, logger }) => {
          logger.info(
            `Received app_mention event from user ${event.user} in channel ${event.channel}`
          );
          try {
            // Simple acknowledgement reply
            const result = await say({
              text: `Hi <@${event.user}>! I received your mention. Processing... (Basic V1 acknowledgement)`,
              thread_ts: event.thread_ts || event.ts, // Reply in thread if possible
            });
            logger.info(`Sent acknowledgement reply, message ts: ${result.ts}`);
          } catch (error) {
            logger.error(
              `Failed to handle app_mention or send reply: ${error.message}`,
              error.stack
            );
            // Optionally try to send an error message back to the user
            // await say({ text: `Sorry, I encountered an error processing your mention.`, thread_ts: event.thread_ts || event.ts });
          }
        }
      );
      ```
      _(Note: Added basic error handling and thread reply logic)_
    - \[ ] **Implement Generic Error Handler (Bolt):** Add a global error handler for Bolt issues.
      ```javascript
      app.error(async (error) => {
        // General error handler
        console.error(
          'Bolt app encountered an error:',
          JSON.stringify(error, null, 2)
        );
        // Add more sophisticated error logging/reporting if needed
      });
      ```
    - \[ ] **Start the App:** Inside the `main` function, after initializing the app and listeners:
      ```javascript
      await app.start(); // Bolt automatically determines port/mode
      console.log(
        `⚡️ Bolt app is running! (Mode: ${
          useSocketMode ? 'Socket Mode' : 'HTTP'
        })`
      );
      ```
    - \[ ] **Call `main()`:** Add `main().catch((error) => { console.error('Failed to start application:', error); process.exit(1); });` at the end of the file to run the startup logic.
  - \[ ] **Update `.env` / `.env.example`**: Ensure `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` (for HTTP) or `SLACK_APP_TOKEN` (for Socket Mode) are present and clearly commented. Consider adding `USE_SOCKET_MODE=true/false`.
- **Verification Steps**:
  1.  **Local Testing (Socket Mode Recommended):**
      - Ensure `USE_SOCKET_MODE=true` (or equivalent logic trigger) is set in `.env`.
      - Ensure `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` (starting `xapp-...`) are correctly set in `.env`.
      - Run the application: `node src/app.js`.
      - Verify the console logs `⚡️ Bolt app is running! (Mode: Socket Mode)`.
      - Go to your Slack workspace. In a channel where the bot has been invited, mention the bot (e.g., `@YourBotName hello`).
      - Verify the bot replies in the thread (or channel if not threaded) with the acknowledgement message (`Hi @User! I received...`).
      - Check the application console logs for the "Received app_mention event..." and "Sent acknowledgement reply..." messages.
      - Test mentioning in a thread and verify the reply stays within the thread.
  2.  **Local Testing (HTTP Mode - Requires ngrok or similar):**
      - Ensure `USE_SOCKET_MODE=false` (or equivalent).
      - Ensure `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are set in `.env`.
      - Set the `PORT` environment variable if needed (e.g., `export PORT=3000`).
      - Start a tunneling service like `ngrok`: `ngrok http 3000` (if using port 3000). Note the `https://` forwarding URL.
      - Go to your Slack App configuration -> "Event Subscriptions". Enable events. Enter the ngrok URL + `/slack/events` (Bolt's default path) as the Request URL. Slack should verify the URL.
      - Go to "Interactivity & Shortcuts". Enable interactivity. Enter the _same_ ngrok URL + `/slack/events`. Save.
      - (You might need to reinstall the app to update permissions/scopes if prompted).
      - Run the application: `node src/app.js`.
      - Verify the console logs `⚡️ Bolt app is running! (Mode: HTTP)`.
      - Mention the bot in Slack. Verify the reply and console logs as described in the Socket Mode test.
  3.  **Code Review:** Check `src/app.js` for correct initialization, clear event handling, basic error logging, and adherence to the style guide.
- **Decision Authority**:
  - AI **can** choose the specific wording for the acknowledgement message and log messages.
  - AI **should** default to Socket Mode for local testing setup instructions unless HTTP/ngrok is explicitly preferred by the user, as Socket Mode is generally simpler locally.
  - AI **cannot** change required configuration parameters (tokens, secrets).
- **Questions/Uncertainties**:
  - _Blocking_: None, assuming Slack credentials are correct.
  - _Non-blocking_: Preferred local testing mode (Socket vs HTTP). Assuming Socket Mode is preferred locally unless told otherwise. Exact logging level desired (`LogLevel.INFO` assumed suitable for now).
- **Acceptable Tradeoffs**:
  - The acknowledgement reply is very basic and hardcoded.
  - Error handling is basic console logging; more robust reporting (e.g., to external services) is out of scope for this plan.
  - No processing of the user's actual message text is done yet.
- **Status**: Not Started
- **Notes**:
  - Using Bolt's unified `app.start()` simplifies startup logic, as it handles port binding for HTTP and connection logic for Socket Mode automatically.
  - Replying in a thread (`thread_ts`) is crucial for keeping conversations organized.
  - The global `app.error` handler is important for catching unhandled exceptions within Bolt's processing.
