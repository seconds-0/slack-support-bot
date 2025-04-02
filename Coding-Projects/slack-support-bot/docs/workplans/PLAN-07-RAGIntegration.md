# Work Plan: Integrate RAG Pipeline into Slack Handler

- **Task ID**: `PLAN-07-RAGIntegration`
- **Problem Statement**: Connect the implemented Vector Search retriever (`PLAN-05`) and Gemini generator (`PLAN-06`) within the main `app_mention` event handler in `src/app.js`. This involves calling the retriever with the user's query, passing the results to the generator, and sending the final generated answer back to Slack, replacing the temporary logic used for testing.
- **Components Involved**:
  - `src/app.js` (Main modification area)
  - `src/rag/retriever.js` (`initializeRetriever` returning the LangChain retriever object)
  - `src/rag/generator.js` (`generateAnswer` function)
  - `@slack/bolt` (Specifically the `app.event('app_mention', ...)` handler)
- **Dependencies**:
  - `PLAN-03-SlackAppBase` completed (Basic Bolt app running).
  - `PLAN-05-VectorSearchRetriever` completed and verified (LangChain retriever initializes and returns documents).
  - `PLAN-06-GeminiGenerator` completed and verified (`generateAnswer` function works).
- **Implementation Checklist**:
  - \[ ] **Refactor `src/app.js` Startup:**
    - \[ ] Ensure `initializeRetriever` is called during the `main` startup sequence _after_ `getConfig()`. Store the returned LangChain `retriever` object.
    - \[ ] Remove any temporary test calls to `generateAnswer` from the startup sequence (it should be called dynamically within the event handler).
    - \[ ] Add robust error handling around `initializeRetriever()` call during startup. If it fails, the app should probably not start or should clearly indicate RAG is unavailable.
      ```javascript
      // Inside main() in src/app.js
      let retriever; // Make retriever accessible in the outer scope of main
      try {
        retriever = await initializeRetriever(); // Assuming it returns the LangChain retriever
      } catch (error) {
        console.error(
          'FATAL: Failed to initialize vector retriever. RAG functionality will be disabled.',
          error
        );
        // Decide: exit process? Or let app run without RAG? Let's allow running but log clearly.
        // process.exit(1); // Option: Exit if retriever is critical
      }
      // Initialize generator client implicitly via first call later, or explicitly here if preferred
      // await initializeGeneratorClient(); // If we create an explicit init for generator
      ```
  - \[ ] **Modify `app.event('app_mention', ...)` Handler:**
    - \[ ] **Check Retriever Status:** At the beginning of the handler, check if the `retriever` object was successfully initialized during startup. If not, send a message like "Sorry, the knowledge base retrieval system is currently unavailable." and return.
    - \[ ] **Extract User Query:** Cleanly extract the user's actual query text from `event.text`, removing the bot mention (e.g., `const userQuery = event.text.replace(/<@.*?>\s*/, '').trim();`). Handle cases where the query might be empty after removing the mention.
    - \[ ] **Add Initial Acknowledgement (Optional but Recommended):** Send a quick "Thinking..." or "Searching runbooks..." message back to Slack immediately using `say()` or `client.chat.postMessage`. This improves perceived responsiveness. Store the timestamp (`ts`) of this message if you want to update it later (more complex).
      ```javascript
      // Quick acknowledgement (optional)
      let thinkingMessageTs = null;
      try {
        const thinkingMsg = await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.thread_ts || event.ts,
          text: '🤔 Searching runbooks and thinking...',
        });
        thinkingMessageTs = thinkingMsg.ts;
      } catch (ackError) {
        logger.warn(`Could not send thinking message: ${ackError.message}`);
      }
      ```
    - \[ ] **Call Retriever:** Invoke the retriever: `const documents = await retriever.getRelevantDocuments(userQuery);`. Wrap in a try-catch block specific to retrieval errors.
    - \[ ] **Check Retrieval Results:** If an error occurred during retrieval or `documents.length === 0`:
      - \[ ] Log the situation.
      - \[ ] Send a message like "Sorry, I couldn't find any relevant information in the runbooks for that query." using `say()` (replying in the thread).
      - \[ ] If you sent a "Thinking..." message, consider deleting it using `client.chat.delete` or updating it using `client.chat.update` (using `thinkingMessageTs`). Updating is generally preferred.
      - \[ ] Return from the handler.
    - \[ ] **Call Generator:** If documents were found, call the generator: `const answer = await generateAnswer(userQuery, documents);`. Wrap in a try-catch block specific to generation errors.
    - \[ ] **Handle Generation Errors:** If an error occurred during generation:
      - \[ ] Log the error.
      - \[ ] Send an error message like "Sorry, I encountered an error while generating the answer." using `say()`.
      - \[ ] Consider updating/deleting the "Thinking..." message.
      - \[ ] Return from the handler.
    - \[ ] **Send Final Answer:** If generation was successful:
      - \[ ] Use `say()` to send the final `answer`, replying in the thread (`thread_ts: event.thread_ts || event.ts`). Include the Block Kit button from previous plans (`PLAN-03`/`PLAN-06`) for "Log Incident".
      ```javascript
      await say({
        thread_ts: event.thread_ts || event.ts,
        text: answer, // Fallback text
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: answer } },
          // Add "Log Incident" button block here
          {
            type: 'actions',
            block_id: 'actions_block_incident',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📄 Log Incident',
                  emoji: true,
                },
                style: 'primary',
                action_id: 'log_incident_button',
              },
            ],
          },
        ],
      });
      ```
      - \[ ] **Crucially:** If you sent a "Thinking..." message, **delete it** now using `client.chat.delete({ channel: event.channel, ts: thinkingMessageTs })` or **update it** to show the final status (more complex, deletion is simpler). Wrap the deletion in its own try-catch as it's non-critical if it fails.
    - \[ ] Remove the old temporary `say()` calls that were used for testing retriever/generator separately.
- **Verification Steps**:
  1.  **Run Locally:** Start the application (`node src/app.js`).
  2.  **Test End-to-End Flow:**
      - Mention the bot with a query expected to have relevant runbook context.
      - Verify you (optionally) see a "Thinking..." message appear quickly.
      - Verify that after a short delay, the "Thinking..." message is deleted/updated (if implemented) and the final answer generated by the RAG pipeline appears in the Slack thread.
      - Verify the "Log Incident" button is present below the answer.
      - Check application logs to trace the flow: mention received -> retrieval -> generation -> final post.
  3.  **Test No-Context Flow:**
      - Mention the bot with a query expected to find no relevant runbooks.
      - Verify the bot replies with the "couldn't find relevant information" message.
      - Verify the "Thinking..." message (if used) is handled correctly (deleted/updated).
  4.  **Test Error Flows:**
      - (Optional/Simulated) Introduce temporary errors in `retriever.js` or `generator.js` (e.g., throw an error). Mention the bot and verify the appropriate error message ("retrieval system unavailable", "error generating answer") is sent to Slack and logged correctly.
  5.  **Code Review:** Examine `src/app.js` focusing on the `app_mention` handler. Check for correct sequencing, error handling for each step (retrieval, generation, Slack posts), proper use of `thread_ts`, handling of the optional "Thinking..." message, and removal of old test code.
- **Decision Authority**:
  - AI **can** decide on the exact wording for the "Thinking...", "No context found", and error messages.
  - AI **can** choose whether to implement the initial "Thinking..." message (Recommended for better UX, but adds slight complexity with deletion/update). Deletion is simpler than updating.
  - AI **must** ensure the final answer includes the "Log Incident" button block.
- **Questions/Uncertainties**:
  - _Blocking_: None, assuming previous plans were verified.
  - _Non-blocking_: Optimal UX for the "Thinking..." message (deletion vs update). Robustness of error handling messages.
- **Acceptable Tradeoffs**:
  - The "Thinking..." message handling might be omitted for simplicity initially, potentially making the bot feel less responsive on longer queries.
  - Error messages sent to the user are generic; they don't expose internal details.
- **Status**: Not Started
- **Notes**:
  - This plan ties the core RAG components together into the main user interaction flow.
  - Proper error handling at each stage (retrieval, generation, Slack API calls) is important for a stable user experience.
  - Handling the `thread_ts` correctly is essential for keeping conversations organized in Slack.
  - Deleting the "Thinking..." message provides a cleaner final history than updating it, and is simpler to implement.
