# Work Plan: Implement Gemini LLM Generator Logic

- **Task ID**: `PLAN-06-GeminiGenerator`
- **Problem Statement**: Implement the logic required to take the retrieved context (runbook chunks) and the user's query (and potentially Slack history later), format them into a suitable prompt, and call the Vertex AI Gemini model to generate a synthesized answer. This module acts as the "generator" in the RAG pipeline, initially without personality or deep history integration.
- **Components Involved**:
  - `src/rag/generator.js` (New file)
  - `src/config/index.js` (For model name, project config)
  - `@langchain/google-vertexai` (`ChatVertexAI`)
  - `langchain/prompts` (`PromptTemplate`)
  - `langchain/schema/output_parser` (`StringOutputParser`)
  - `langchain/schema/runnable` (`RunnableSequence` - optional but good practice)
  - Vertex AI Gemini API
- **Dependencies**:
  - `PLAN-01-ProjectSetup` completed.
  - `PLAN-02-SecretsConfig` completed (`getConfig` available).
  - Configuration (Project ID, Region, LLM Model Name) available via `getConfig`.
- **Implementation Checklist**:

  - \[ ] **Create `src/rag/generator.js`:**
    - \[ ] Import necessary modules: `getConfig` from `../config`, `ChatVertexAI` from `@langchain/google-vertexai`, `PromptTemplate` from `@langchain/core/prompts`, `StringOutputParser` from `@langchain/core/output_parsers`, `RunnableSequence` from `@langchain/core/runnables`.
    - \[ ] Import utility if needed: `formatDocumentsAsString` from `langchain/util/document`.
  - \[ ] **Initialize LLM Client:** Create a function `initializeGenerator()` or initialize directly within the generation function scope (consider caching if creating a class). Let's use a simple function scope for now.

    ```javascript
    // src/rag/generator.js
    // ... imports ...

    let llm; // Cache LLM client instance
    let config;

    async function getLlmClient() {
      if (llm) return llm;

      console.log('Initializing Gemini LLM Client...');
      config = await getConfig(); // Ensure config is loaded

      // Validate config
      if (!config.vertexAiLlmModelName) {
        throw new Error(
          'Missing required configuration: Vertex AI LLM Model Name'
        );
      }

      llm = new ChatVertexAI({
        modelName: config.vertexAiLlmModelName, // e.g., "gemini-1.0-pro"
        temperature: 0.2, // Lower for factual RAG
        maxOutputTokens: 1024, // Adjust as needed
        // Credentials handled implicitly by google-auth-library
      });
      console.log(
        `Gemini LLM Client initialized with model ${config.vertexAiLlmModelName}.`
      );
      return llm;
    }
    ```

  - \[ ] **Define Basic RAG Prompt Template:** Create a `PromptTemplate` instance. For V1, it takes retrieved `context` (runbook chunks) and the user's `question`.

    ```javascript
    const RAG_PROMPT_TEMPLATE = `You are an AI assistant helping developers with on-call issues. Answer the user's question based *only* on the following context retrieved from runbooks. If the context does not contain the answer, clearly state that you cannot answer from the provided information. Be concise and provide step-by-step instructions if found in the context.
    
    Context:
    {context}
    
    Question: {question}`;

    const ragPrompt = PromptTemplate.fromTemplate(RAG_PROMPT_TEMPLATE);
    ```

  - \[ ] **Implement `generateAnswer(question, documents)` function:**

    - \[ ] Function accepts the user's `question` (string) and `documents` (array of LangChain `Document` objects from the retriever).
    - \[ ] Get the initialized LLM client: `const currentLlm = await getLlmClient();`.
    - \[ ] **Format Context:** Use `formatDocumentsAsString(documents)` to convert the retrieved document chunks into a single string suitable for the prompt.
    - \[ ] **Option A (Simple Chaining):**
      ```javascript
      /*
      const formattedPrompt = await ragPrompt.format({
          context: formatDocumentsAsString(documents),
          question: question,
      });
      const response = await currentLlm.invoke(formattedPrompt);
      const answer = response.content; // Assuming response structure
      return answer;
      */
      ```
    - \[ ] **Option B (Using RunnableSequence - Recommended):** Define the chain for clarity and composability.

      ```javascript
      const ragChain = RunnableSequence.from([
        {
          context: (input) => formatDocumentsAsString(input.documents), // Get context from input documents
          question: (input) => input.question, // Pass question through
        },
        ragPrompt,
        currentLlm,
        new StringOutputParser(), // Parses the LLM output message into a string
      ]);

      console.log(
        `Invoking RAG generation chain for question: "${question.substring(
          0,
          50
        )}..."`
      );
      const answer = await ragChain.invoke({
        question: question,
        documents: documents,
      });
      console.log(`LLM generation completed. Answer length: ${answer.length}`);
      return answer;
      ```

    - \[ ] Add error handling around the `ragChain.invoke` call.

  - \[ ] **Export the Generator Function:**
    ```javascript
    module.exports = { generateAnswer };
    ```
  - \[ ] **Update `src/app.js` (Temporarily for Testing):**
    - \[ ] Import `generateAnswer` from `../rag/generator`.
    - \[ ] Modify the `app_mention` handler (after getting `documents` from the retriever):
      - \[ ] Check if `documents` were found.
      - \[ ] If documents exist, call `const answer = await generateAnswer(userQuery, documents);`.
      - \[ ] Log the generated `answer`.
      - \[ ] Update the `say` call to include the generated `answer` instead of just the count. E.g., `say(\`Based on runbooks:\n>>> ${answer}\`)`.
      - \[ ] If no documents were found, provide a different message, e.g., `say("Sorry, I couldn't find any relevant runbook information for that query.")`.

- **Verification Steps**:
  1.  **Run Locally:** Start the application (`node src/app.js`). Ensure Gemini client initialization logs appear without errors.
  2.  **Test Query:** Mention the bot in Slack with a query that _should_ have relevant context in the ingested runbooks (e.g., `@YourBotName describe the steps for service X deployment`).
  3.  **Check Logs:**
      - Verify logs from the retriever confirming documents were found.
      - Verify the "Invoking RAG generation chain..." log.
      - Verify the "LLM generation completed..." log.
      - Examine the logged `answer` for coherence and relevance to the query and expected runbook content.
  4.  **Check Slack Reply:** Verify the bot replies with the generated `answer` from the LLM. Assess the quality: Does it use the context? Does it correctly state if context is insufficient? Is it concise?
  5.  **Test No-Context Scenario:** Mention the bot with a query for which no relevant documents should be found. Verify the bot replies with the "couldn't find relevant information" message.
  6.  **Test Error Handling:** (Optional) Temporarily introduce an error (e.g., invalid model name in config) and verify appropriate errors are logged during LLM initialization or invocation.
  7.  **Code Review:** Examine `src/rag/generator.js` for correct LLM initialization, prompt formatting, use of LangChain components (RunnableSequence, StringOutputParser), and error handling.
- **Decision Authority**:
  - AI **can** choose the exact wording for the RAG prompt, ensuring it clearly instructs the LLM to use only the provided context.
  - AI **can** set LLM parameters like `temperature` and `maxOutputTokens` to reasonable defaults for RAG.
  - AI **must** use `StringOutputParser` or equivalent to get the text content from the LLM response.
  - AI **should** use `RunnableSequence` for structuring the generation chain.
- **Questions/Uncertainties**:
  - _Blocking_: None, assuming Vertex AI Gemini API is accessible and configured correctly.
  - _Non-blocking_: Optimal `temperature` and `maxOutputTokens` (defaults are likely fine for V1, can be tuned later). Exact structure of the LLM response object (assuming `.content` via `StringOutputParser`).
- **Acceptable Tradeoffs**:
  - The prompt is basic and doesn't include Slack history or personality yet.
  - The answer quality is entirely dependent on the retrieved context quality and the base capabilities of the Gemini model.
  - No sophisticated handling of conflicting information within the context.
  - Error handling for LLM calls is basic logging.
- **Status**: Not Started
- **Notes**:
  - Using `RunnableSequence` makes the flow (input -> format context -> prompt -> llm -> parse output) much clearer and easier to extend later (e.g., adding history or post-processing steps).
  - `formatDocumentsAsString` is a standard LangChain utility for preparing context.
  - Keeping `temperature` low (e.g., 0.1-0.3) generally helps LLMs stick to the provided context in RAG scenarios.
