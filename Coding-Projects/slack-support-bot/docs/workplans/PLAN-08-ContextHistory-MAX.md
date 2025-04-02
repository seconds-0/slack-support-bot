# Work Plan: Add Maximum Slack History & Search Context to RAG

- **Task ID**: `PLAN-08-ContextHistory-Max`
- **Problem Statement**: Significantly enhance the RAG pipeline's context by fetching extensive message history from the current Slack thread (if applicable), the parent channel, and potentially relevant Slack search results. Combine, de-duplicate, and format this history to provide maximum conversational context to the Gemini LLM, leveraging its large context window. Implement reduction strategies only if nearing model token limits.
- **Components Involved**:
  - `src/app.js` (`app_mention` handler)
  - `src/rag/generator.js` (Prompt template, input to `generateAnswer`)
  - `@slack/bolt` (Client methods: `conversations.replies`, `conversations.history`, `search.messages`)
  - Helper function for formatting/combining history.
- **Dependencies**:
  - `PLAN-07-RAGIntegration` completed.
  - Slack Bot Token scopes include: `channels:history`, `groups:history`, `im:history`, `mpim:history`, and `search:read`.
- **Implementation Checklist**:
  - \[ ] **Modify `app.event('app_mention', ...)` Handler in `src/app.js`:**
    - \[ ] **Fetch Multiple History Sources Concurrently:** _Before_ calling the retriever/generator, initiate fetches for thread, channel, and potentially search results using `Promise.allSettled` (to handle potential failures in one source without stopping others).
      - \[ ] **Thread History:** If `event.thread_ts`, add `client.conversations.replies({ channel: event.channel, ts: event.thread_ts, limit: 100 })` to the promises array.
      - \[ ] **Channel History:** Add `client.conversations.history({ channel: event.channel, limit: 75 })` to the promises array.
      - \[ ] **Slack Search (Optional - evaluate need/complexity):**
        - \[ ] Extract keywords from `userQuery` (simple split or basic NLP).
        - \[ ] Construct a search query string (e.g., `keywords in:${event.channel} from:@user`). Consider time range (`after:`, `before:`).
        - \[ ] Add `client.search.messages({ query: searchQuery, count: 10, sort: 'timestamp', sort_dir: 'desc' })` to the promises array.
      - \[ ] Execute `const results = await Promise.allSettled([...historyPromises]);`.
      - \[ ] Process `results`: Extract successful message arrays, log any failed fetches (but don't halt). Store messages from thread, channel, search separately initially. (`let threadMessages = []; let channelMessages = []; let searchMessages = [];`)
    - \[ ] **Combine, De-duplicate, and Sort History:**
      - \[ ] Create a temporary map or Set using message `ts` as the key to store unique messages.
      - \[ ] Iterate through `threadMessages`, `channelMessages`, and `searchMessages` (if fetched), adding each message to the map keyed by its `ts`. This automatically handles duplicates.
      - \[ ] Convert the map values back into an array: `const uniqueMessages = Array.from(messageMap.values());`.
      - \[ ] Sort `uniqueMessages` chronologically based on the `ts` property (oldest first). `uniqueMessages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));`.
    - \[ ] **Format Combined History:** Create/update `formatSlackHistory(messages, botUserId)`:
      - \[ ] Input is the sorted `uniqueMessages` array.
      - \[ ] Formatting logic remains similar (e.g., `<UserID> [Timestamp]: Text`).
      - \[ ] **No Aggressive Truncation:** Initially, format the _entire_ history.
      - \[ ] Calculate the approximate token count or character length of the formatted string.
      - \[ ] **Implement Conditional Reduction (If Necessary):**
        - \[ ] Define a maximum desired length (e.g., 15,000 characters, estimate based on typical token ratios and remaining space needed for prompt/context/response).
        - \[ ] If `formattedHistory.length > MAX_HISTORY_LENGTH`:
          - \[ ] Implement reduction logic: Remove messages starting from the _oldest_ (`uniqueMessages[0]`) until the length is below the threshold.
          - \[ ] Add a clear indicator at the beginning, like `[... History truncated ...]`.
          - \[ ] Log a warning that history was reduced.
      - \[ ] Call this function: `const formattedHistory = formatSlackHistory(uniqueMessages, context.botUserId);`.
  - \[ ] **Modify `src/rag/generator.js`:**
    - \[ ] **Ensure Prompt Template:** Verify the `RAG_PROMPT_TEMPLATE` includes the `{slack_history}` placeholder correctly (as defined in the original Plan 8).
    - \[ ] **Ensure `generateAnswer` Signature:** Verify `generateAnswer` accepts `slackHistory`: `generateAnswer(question, documents, slackHistory)`.
    - \[ ] **Ensure RunnableSequence Input:** Verify the chain passes `slackHistory`: `slack_history: (input) => input.slackHistory`.
  - \[ ] **Modify Call Site in `src/app.js`:**
    - \[ ] Ensure the `formattedHistory` string is passed correctly when calling the generator: `const answer = await generateAnswer(userQuery, documents, formattedHistory);`.
- **Verification Steps**:
  1.  **Run Locally:** Start the application.
  2.  **Test Follow-up Query (Thread):** Perform the same thread follow-up test as in the original Plan 8. Verify the answer is correct. **Crucially**, inspect the logs (add temporary logging of `formattedHistory` passed to the generator) to confirm that _both_ thread-specific messages and relevant channel history messages (if any) were included in the context provided to the LLM.
  3.  **Test Complex Scenario:** Create a scenario where relevant context might be spread across the channel history _and_ potentially findable via search terms from the user's query. Mention the bot and assess if its answer reflects synthesis across these sources. Inspect logs to confirm messages from different sources were combined.
  4.  **Test High Volume Channel/Thread:** Test in a channel or thread with significant history (hundreds of messages). Verify the application doesn't excessively slow down during history fetching/processing. Check logs to see if the history reduction logic was triggered (if the combined history was long enough) and if the `[... History truncated ...]` indicator appears.
  5.  **Check Token Usage (GCP Console):** After several test runs, check the Vertex AI API metrics in the GCP console to get a rough idea of the token counts being used per request. Ensure they are generally within reasonable limits for the chosen Gemini model.
  6.  **Test Search Integration (If Implemented):** If Slack Search was added, design a query where relevant info is _unlikely_ to be in recent history but _is_ findable via search. Verify if the bot incorporates search results into its answer. Check logs for search results processing.
  7.  **Code Review:** Examine history fetching (`Promise.allSettled`), combining/de-duplication/sorting logic, the formatting function (especially the conditional reduction logic), and the integration points with the generator. Ensure error handling for API calls is present.
- **Decision Authority**:
  - AI **can** choose the specific limits for fetching history/replies/search (should be generous, e.g., 75-150 messages).
  - AI **can** define the keyword extraction logic for Slack Search (start simple).
  - AI **must** implement de-duplication based on message `ts`.
  - AI **must** implement chronological sorting.
  - AI **can** determine the threshold and specific logic for conditional history reduction (e.g., character count, priority rules).
  - AI **can** decide whether to include Slack Search in the initial implementation or defer it (recommend deferring slightly if complexity is a major concern for speed).
- **Questions/Uncertainties**:
  - _Blocking_: None.
  - _Non-blocking_: Performance impact of fetching/processing large amounts of history on request latency. Effectiveness of basic keyword extraction for Slack Search. Optimal threshold for triggering history reduction. Best strategy for reduction (FIFO, prioritizing thread, etc.). Decision to include Slack Search now vs later. _(Assumption: Include generous history fetching, defer Slack Search unless specifically requested now, implement basic FIFO reduction if needed)._
- **Acceptable Tradeoffs**:
  - Increased latency due to fetching more data and processing it.
  - Potentially higher token costs per request due to larger prompts.
  - Simple keyword extraction for search might yield irrelevant results.
  - Basic FIFO reduction might remove important older context if triggered.
- **Status**: Not Started
- **Notes**:
  - Using `Promise.allSettled` is important to ensure one failed API call (e.g., search failing) doesn't prevent processing of other history sources.
  - De-duplication via message timestamp (`ts`) is essential.
  - Careful monitoring of performance and token usage will be necessary after implementing this.
  - Conditional reduction adds complexity but prevents hard failures due to exceeding token limits. Start with a high threshold.
  - **Recommendation:** Implement Thread + Channel history first. Add Slack Search in a subsequent refinement (`PLAN-08b`?) if needed, as it adds significant complexity for potentially marginal initial gain compared to good thread/channel history.
