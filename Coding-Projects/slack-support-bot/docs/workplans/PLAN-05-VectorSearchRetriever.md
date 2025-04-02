**Task ID**: `PLAN-05-VectorSearchRetriever`

- **Problem Statement**: Implement the logic required to take a user's query, generate its vector embedding using Vertex AI Embeddings, and then query the deployed Vertex AI Vector Search index to retrieve the most relevant runbook chunks based on semantic similarity. This module will serve as the "retriever" component of the RAG pipeline.
- **Components Involved**:
  - `src/rag/retriever.js` (New file)
  - `src/config/index.js` (For configuration: Project ID, Region, Index ID, Endpoint ID)
  - `@langchain/google-vertexai` (`VertexAIEmbeddings`)
  - `@google-cloud/aiplatform` (`IndexEndpointServiceClient` for querying)
  - Vertex AI Embeddings API
  - Vertex AI Vector Search API
- **Dependencies**:
  - `PLAN-01-ProjectSetup` completed.
  - `PLAN-02-SecretsConfig` completed (`getConfig` available).
  - `PLAN-04-DriveIngestion` completed (or at least runnable, so the index contains data).
  - Vertex AI Vector Search Index and Endpoint deployed and populated with data.
  - Configuration (Project ID, Region, Index ID, Endpoint ID) available via `getConfig`.
- **Implementation Checklist**:

  - \[ ] **Create `src/rag/retriever.js`:**
    - \[ ] Import necessary modules: `getConfig` from `../config`, `VertexAIEmbeddings` from `@langchain/google-vertexai`, `IndexEndpointServiceClient` from `@google-cloud/aiplatform`.
  - \[ ] **Initialize Services within a Class or Function Scope:** It's useful to initialize clients once and reuse them. A class `VectorRetriever` or an initialization function `initializeRetriever` could work. Let's use an async initialization function pattern that returns the query function.

    ```javascript
    // src/rag/retriever.js
    // ... imports ...

    let embeddingsClient;
    let vectorSearchClient;
    let endpointPath;
    let deployedIndexId; // Optional, if needed for specific query types
    let config; // Store loaded config

    async function initializeRetriever() {
      if (vectorSearchClient) return getRelevantDocuments; // Already initialized

      console.log('Initializing Vector Retriever...');
      config = await getConfig();

      // Validate required config for retriever
      if (
        !config.gcpProjectId ||
        !config.gcpRegion ||
        !config.vertexAiIndexEndpointId
      ) {
        throw new Error(
          'Missing required configuration for Vector Retriever (Project ID, Region, Endpoint ID)'
        );
      }

      // Initialize Embeddings Client
      embeddingsClient = new VertexAIEmbeddings({
        modelName:
          config.vertexAiEmbeddingModelName || 'textembedding-gecko@003',
      });

      // Initialize Vector Search Client
      const clientOptions = {
        apiEndpoint: `${config.gcpRegion}-aiplatform.googleapis.com`,
      };
      vectorSearchClient = new IndexEndpointServiceClient(clientOptions);

      // Construct Endpoint Path
      endpointPath = vectorSearchClient.indexEndpointPath(
        config.gcpProjectId,
        config.gcpRegion,
        config.vertexAiIndexEndpointId
      );

      // Optional: Get the deployed index ID if needed - might require listing deployments
      // For basic findNeighbors, only the endpoint path is strictly necessary.
      // If using specific deployed index features, might need: config.vertexAiDeployedIndexId

      console.log(`Vector Retriever initialized. Endpoint: ${endpointPath}`);
      return getRelevantDocuments; // Return the function to perform queries
    }

    async function getRelevantDocuments(query, k = 4) {
      // ... Implementation below ...
    }

    module.exports = { initializeRetriever };
    ```

  - \[ ] **Implement `getRelevantDocuments(query, k = 4)` function:**

    - \[ ] **Input Validation:** Check if `query` is a non-empty string. Check if `k` (number of results) is a positive integer.
    - \[ ] **Generate Query Embedding:**
      ```javascript
      console.log(
        `Generating embedding for query: "${query.substring(0, 50)}..."`
      );
      const queryEmbedding = await embeddingsClient.embedQuery(query);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error('Failed to generate embedding for the query.');
      }
      ```
    - \[ ] **Prepare Vector Search Query:**
      ```javascript
      const request = {
        indexEndpoint: endpointPath,
        queries: [
          // Can send multiple queries in one request if needed
          {
            datapoint: {
              // datapointId: `query_${Date.now()}`, // Optional ID for the query itself
              featureVector: queryEmbedding,
            },
            neighborCount: k, // Number of results to retrieve
            // Add filtering here if needed based on metadata later
            // Example: string_filter: [{ name: 'namespace', allow_tokens: ['general'] }]
          },
        ],
        // deployedIndexId: deployedIndexId, // Only required if needing specific deployed index behavior
      };
      console.log(`Querying Vector Search with k=${k}`);
      ```
    - \[ ] **Execute Vector Search Query:**

      ```javascript
      try {
        const [response] = await vectorSearchClient.findNeighbors(request);

        if (
          !response ||
          !response.nearestNeighbors ||
          response.nearestNeighbors.length === 0 ||
          !response.nearestNeighbors[0].neighbors
        ) {
          console.log('Vector Search returned no neighbors.');
          return [];
        }

        const neighbors = response.nearestNeighbors[0].neighbors;
        console.log(`Retrieved ${neighbors.length} neighbors.`);

        // Format results - IMPORTANT: Vector Search only returns IDs and distance.
        // We need a way to map these IDs back to the actual text content.
        // **V1 Simplification:** For now, just return the IDs and distances.
        // We will need to address fetching content in a later step or adjust ingestion.
        const results = neighbors.map((neighbor) => ({
          id: neighbor.datapoint.datapointId,
          distance: neighbor.distance, // Lower distance is better for COSINE/DOT_PRODUCT usually
        }));

        return results;
      } catch (error) {
        console.error(`Vector Search query failed: ${error.message}`, error);
        // Decide how to handle: return empty array or re-throw? Let's return empty for now.
        return [];
      }
      ```

    - \[ ] **Refine Return Value (Crucial Discussion):** The above returns only IDs. For RAG, we need the _text_ associated with those IDs. Options:

      1.  **(Requires Ingestion Change):** Store `pageContent` directly in Vector Search metadata (only feasible for _very small_ chunks, generally discouraged due to cost/size limits).
      2.  **(Requires Additional Lookup):** After getting IDs from Vector Search, query a separate database (e.g., Firestore, Cloud SQL, or even re-query GCS/Drive if IDs map directly to files/sections) to get the `pageContent` for those specific chunk IDs.
      3.  **(LangChain Abstraction - Preferred):** LangChain's `VertexAIVectorStore` _might_ handle this lookup if configured correctly (it often needs a way to map IDs back to content). We need to investigate if we can use `VertexAIVectorStore` directly instead of the raw client.

    - \[ ] **Revised Approach using LangChain `VertexAIVectorStore` (If Possible):**
      - Investigate `VertexAIVectorStore` from `@langchain/google-vertexai`.
      - Check its constructor and how it expects the index/endpoint information.
      - If it works, the initialization would involve creating an instance of `VertexAIVectorStore`.
      - The query logic would simplify to: `const retriever = vectorStore.asRetriever(k); const documents = await retriever.getRelevantDocuments(query);` - LangChain handles embedding and potentially the content lookup (needs verification on _how_ it gets content). **Assume this path is feasible for now.**

  - \[ ] **Revised Checklist Item (Using LangChain `VertexAIVectorStore`):**

    - \[ ] **Modify `initializeRetriever`:**

      ```javascript
      // ... imports ...
      const { VertexAIVectorStore } = require('@langchain/google-vertexai'); // LangChain Store

      let retrieverInstance;
      let config;

      async function initializeRetriever(k = 4) {
        // Pass k for retriever config
        if (retrieverInstance) return retrieverInstance;

        console.log('Initializing LangChain Vector Retriever...');
        config = await getConfig();

        // ... validate config ...

        const embeddings = new VertexAIEmbeddings({
          /* ... */
        });

        // Requires google-cloud/aiplatform installed.
        // Check Langchain JS docs for exact parameters
        const store = new VertexAIVectorStore(embeddings, {
          // Parameters likely include:
          project: config.gcpProjectId,
          location: config.gcpRegion,
          endpoint: config.vertexAiIndexEndpointId, // Check if it needs full path or just ID
          index: config.vertexAiIndexId, // Check if needed
          // May need publisher/model info depending on Langchain version
        });

        retrieverInstance = store.asRetriever(k);
        console.log(`LangChain Vector Retriever initialized (k=${k}).`);
        return retrieverInstance;
      }
      module.exports = { initializeRetriever };
      ```

    - \[ ] **Modify `getRelevantDocuments` (No longer needed if `initializeRetriever` returns the LangChain retriever):** The call site will use the returned retriever directly.

  - \[ ] **Update `src/app.js` (Temporarily for Testing):**
    - \[ ] Import `initializeRetriever` from `../rag/retriever`.
    - \[ ] Call `const retriever = await initializeRetriever();` during app startup (after config loaded). Handle potential errors.
    - \[ ] Modify the `app_mention` handler to:
      - \[ ] Extract the `userQuery`.
      - \[ ] Call `const documents = await retriever.getRelevantDocuments(userQuery);`.
      - \[ ] Log the retrieved `documents` (expecting LangChain `Document` objects with `pageContent` and `metadata`).
      - \[ ] Modify the `say` call to include the number of documents found, e.g., `say(\`Found ${documents.length} relevant document chunks.\`)`.

- **Verification Steps**:
  1.  **Run Locally:** Start the application (`node src/app.js`). Ensure the "Initializing LangChain Vector Retriever..." log appears without errors during startup.
  2.  **Test Query:** Mention the bot in Slack with a query relevant to the content ingested into Vector Search (e.g., `@YourBotName how do I restart the auth service?`).
  3.  **Check Logs:**
      - Verify logs indicating embedding generation for the query.
      - Verify logs related to the Vector Search query execution (likely handled within LangChain now).
      - **Critically:** Verify the logs showing the structure of the `documents` returned by `retriever.getRelevantDocuments()`. Confirm they contain `pageContent` (the actual text chunk) and relevant `metadata` (like source filename/ID).
  4.  **Check Slack Reply:** Verify the bot's temporary reply indicates the _number_ of documents found.
  5.  **Test Edge Cases:** Mention the bot with irrelevant queries and verify few/no documents are returned.
  6.  **Code Review:** Examine `src/rag/retriever.js` for correct initialization of `VertexAIVectorStore`, error handling during initialization, and proper usage in `src/app.js`.
- **Decision Authority**:
  - AI **must** prioritize using the LangChain `VertexAIVectorStore` abstraction if feasible, as it simplifies retrieving content alongside IDs.
  - AI **can** set the default number of retrieved documents (`k`), but `4` is a reasonable starting point.
  - AI **can** structure the initialization logic (class vs function).
- **Questions/Uncertainties**:
  - _Blocking_: Does the LangChain `VertexAIVectorStore` correctly handle retrieving `pageContent` using only the vector ID returned by Vertex AI Search? _(Assumption: Yes, it likely relies on metadata or assumes content was stored, which needs careful verification based on ingestion)_. If not, we revert to the manual client approach and need a separate lookup step (`PLAN-05b-ContentLookup`). **Proceed assuming LangChain handles it for now.**
  - _Non-blocking_: Exact constructor parameters for `VertexAIVectorStore` (verify against current LangChain JS documentation). Default value for `k`.
- **Acceptable Tradeoffs**:
  - Initial retriever doesn't implement metadata filtering (can be added later if needed).
  - Performance of the query depends heavily on the deployed index configuration and embedding model.
  - The temporary integration into `app.js` is basic; proper RAG chaining comes next.
- **Status**: Not Started
- **Notes**:
  - The biggest potential hurdle here is ensuring the link between the Vector Search result (ID) and the actual text content (`pageContent`). Using the LangChain abstraction is the cleanest way if it works as expected. Verification step #3 is crucial.
  - If `VertexAIVectorStore` _doesn't_ retrieve content, the plan needs immediate revision to either:
    a) Modify `PLAN-04` to store small content snippets in metadata (if feasible).
    b) Add a new plan (`PLAN-05b`) to implement a lookup mechanism (e.g., Firestore keyed by chunk ID) to fetch content _after_ getting IDs from Vector Search.
