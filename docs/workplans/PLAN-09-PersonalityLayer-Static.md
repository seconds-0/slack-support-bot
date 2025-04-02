# Work Plan: Implement Static Personality Injection Layer

- **Task ID**: `PLAN-09-PersonalityLayer-Static`
- **Problem Statement**: Implement the personality injection using a _static, curated set_ of example messages from a designated user. This involves creating a one-time script to fetch initial examples, manual curation by the user, storing the curated examples within the project, and modifying the RAG generator prompt to use these static examples.
- **Components Involved**:
  - `scripts/fetch-style-examples.js` (New temporary script)
  - `src/config/style-examples.json` (New file storing curated examples)
  - `src/rag/generator.js` (Prompt template modification, example loading)
  - `src/config/index.js` (Loading personality config: User ID, name, style description)
  - `@slack/bolt` or `@slack/web-api` (For the fetch script)
  - Node.js `fs` module (For loading JSON file)
  - LLM Prompt Engineering
- **Dependencies**:
  - `PLAN-08-ContextHistory-Max` completed.
  - Configuration values (`PERSONALITY_USER_ID`, Name, Description) defined.
  - Slack Bot Token with `search:read` available _temporarily_ for running the fetch script.
  - Manual curation step performed by the user after running the fetch script.
- **Implementation Checklist**:

  - \[ ] **Create One-Time Fetch Script (`scripts/fetch-style-examples.js`):**
    - \[ ] Import `WebClient` from `@slack/web-api`, `fs` from `fs`.
    - \[ ] Load `SLACK_BOT_TOKEN` and `PERSONALITY_USER_ID` from environment variables (`dotenv` might be useful here too). Add validation.
    - \[ ] Define constants for filtering: `MIN_EXAMPLE_LENGTH`, `MAX_EXAMPLE_LENGTH`, `INITIAL_FETCH_COUNT`, `FINAL_EXAMPLE_COUNT`.
    - \[ ] Initialize `WebClient`.
    - \[ ] Call `slackClient.search.messages` with `query: from:<@USER_ID>`, `count: INITIAL_FETCH_COUNT`, `sort: 'timestamp'`. Handle pagination if needed to get enough messages.
    - \[ ] Process results: Extract message text (`match.text`).
    - \[ ] Apply filtering: Remove short/long messages, mentions-only, potentially messages with too many code blocks or links (keep it simple initially).
    - \[ ] Select a diverse set (e.g., try to avoid too many near-duplicates).
    - \[ ] Slice to get the `FINAL_EXAMPLE_COUNT`.
    - \[ ] Write the resulting array of strings to a file: `fs.writeFileSync('style-examples.json', JSON.stringify(selectedExamples, null, 2));`.
    - \[ ] Add logging throughout the script. Include instructions for the user to run it and then curate the output file.
  - \[ ] **(Manual Step - User)**:
    - \[ ] Run the fetch script: `node scripts/fetch-style-examples.js` (after setting temporary env vars).
    - \[ ] Review and manually edit the generated `style-examples.json` file. Ensure examples are high-quality and representative. Aim for 10-20 good examples.
    - \[ ] Move the final curated `style-examples.json` file into the `src/config/` directory within the project structure.
  - \[ ] **Modify `src/rag/generator.js`:**

    - \[ ] Remove the previous `getPersonalityStyleExamples` function and any calls to it. Remove the `cachedStyleExamples` variable.
    - \[ ] Add `fs` and `path` imports.
    - \[ ] **Load Static Examples:** Implement logic within `initializeGenerator` (or a similar setup function) to load the examples from the JSON file.

      ```javascript
      // Inside initializeGenerator or similar setup in generator.js
      let staticStyleExamples = []; // Store loaded examples

      try {
        const filePath = path.join(__dirname, '../config/style-examples.json'); // Adjust path if needed
        const fileContent = fs.readFileSync(filePath, 'utf8');
        staticStyleExamples = JSON.parse(fileContent);
        if (!Array.isArray(staticStyleExamples)) {
          console.warn(
            'Loaded style examples is not an array. Check style-examples.json format.'
          );
          staticStyleExamples = [];
        }
        console.log(
          `Loaded ${staticStyleExamples.length} static style examples.`
        );
      } catch (error) {
        console.error('Failed to load static style examples from file:', error);
        // Proceed without examples, but log the error clearly
        staticStyleExamples = [];
      }
      ```

    - \[ ] **Update Prompt Template:** Ensure the `RAG_PROMPT_TEMPLATE` still includes `{personality_name}`, `{style_description}`, and `{style_examples}` placeholders.
    - \[ ] **Update `generateAnswer` / RunnableSequence:** Modify the chain input to use the loaded `staticStyleExamples`.

      ```javascript
      // Inside generateAnswer
      const formattedExamples =
        staticStyleExamples.length > 0
          ? staticStyleExamples.map((ex) => `- "${ex}"`).join('\n')
          : 'No style examples loaded.';

      const ragChain = RunnableSequence.from([
        {
          personality_name: () =>
            config.personalityName || 'the designated user',
          style_description: () =>
            config.personalityStyleDescription || 'helpful and informative',
          style_examples: () => formattedExamples, // Use loaded static examples
          // ... other inputs (slack_history, context, question) ...
        },
        ragPrompt,
        currentLlm,
        new StringOutputParser(),
      ]);

      // ... invoke chain ...
      ```

  - \[ ] **Update Configuration:** Ensure `PERSONALITY_NAME` and `PERSONALITY_STYLE_DESCRIPTION` are still loaded or defined correctly via `getConfig`. The fetch script needs `SLACK_BOT_TOKEN` and `PERSONALITY_USER_ID` temporarily via env vars, but the main bot application no longer needs `search:read` scope specifically for this feature.

- **Verification Steps**:
  1.  **Run Fetch Script:** Execute `scripts/fetch-style-examples.js` once. Verify it creates `style-examples.json` and logs expected messages.
  2.  **(Manual)** Curate `style-examples.json` and place it in `src/config/`.
  3.  **Run Bot Locally:** Start the application (`node src/app.js`). Verify logs indicate successful loading of the static examples from the JSON file. Check the number logged matches the curated file.
  4.  **Test Interaction:** Mention the bot with various queries.
  5.  **Assess Bot's Response Style:** Evaluate responses against the curated examples and the style description. Verify consistency. Check factual accuracy isn't compromised by the persona. Check "I don't know" scenarios are handled in character.
  6.  **Test File Loading Error:** (Optional) Temporarily rename or corrupt `style-examples.json`. Restart the bot. Verify it logs an error but continues to function (without style examples). Verify the prompt sent to the LLM contains "No style examples loaded."
  7.  **Code Review:** Examine the fetch script (`scripts/fetch-style-examples.js`). Review the changes in `src/rag/generator.js` for loading the static JSON file and integrating `staticStyleExamples` into the prompt context. Ensure dynamic fetching code is removed.
- **Decision Authority**:
  - AI **must** implement the static loading mechanism (reading from the local JSON file).
  - AI **can** choose filtering parameters within the fetch script.
  - AI **must** ensure the generator functions correctly (though possibly without examples) if the JSON file fails to load.
- **Questions/Uncertainties**:
  - _Blocking_: Requires manual curation step by the user.
  - _Non-blocking_: Quality of examples achievable via automatic fetching + filtering vs purely manual selection. Best location/name for the curated JSON file (`src/config/style-examples.json` seems reasonable).
- **Acceptable Tradeoffs**:
  - Requires a manual, one-time setup step (running script + curation).
  - The personality is fixed based on the curated examples and won't adapt to any future messages (which is the desired state now).
  - If the curated examples aren't good, the personality mimicry will be weak.
- **Status**: Not Started
- **Notes**:
  - The temporary fetch script (`scripts/fetch-style-examples.js`) should probably be removed or clearly marked as "one-time use" after the curation is done.
  - Storing the examples as a JSON file within the source code (Option B) is generally the simplest approach for this scenario. Ensure the file is committed to version control.
  - Error handling during the loading of the static JSON file is important.
