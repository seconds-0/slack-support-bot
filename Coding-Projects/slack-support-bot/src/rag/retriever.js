const { VertexAIEmbeddings } = require('@langchain/google-vertexai');
const { VertexAIVectorStore } = require('@langchain/google-vertexai'); // Using LangChain Vector Store
const { getConfig } = require('../config');

// Cache for the retriever instance
let retrieverInstance = null;
let config = null;

/**
 * Initializes the Vertex AI Vector Store and returns a retriever instance.
 * Caches the instance after first initialization.
 * @param {number} [k=4] - The default number of documents to retrieve.
 * @returns {Promise<import("@langchain/core/retrievers").BaseRetriever>} - A LangChain retriever instance.
 */
async function initializeRetriever(k = 4) {
  if (retrieverInstance) {
    console.log('Returning cached LangChain Vector Retriever instance.');
    // Note: This doesn't update 'k' if called again with a different value.
    // If dynamic 'k' is needed per query, the retriever might need adjustments or re-creation.
    return retrieverInstance;
  }

  console.log('Initializing LangChain Vector Retriever...');
  try {
    config = await getConfig();

    // Validate required config for retriever
    const requiredConfig = [
      'gcpProjectId',
      'gcpRegion',
      'vertexAiIndexId', // Required by VertexAIVectorStore
      'vertexAiIndexEndpointId',
      'vertexAiEmbeddingModelName',
    ];
    const missingConfig = requiredConfig.filter((key) => !config[key]);
    if (missingConfig.length > 0) {
      throw new Error(
        `Missing required configuration for Vector Retriever: ${missingConfig.join(', ')}`
      );
    }

    // Initialize Embeddings Client (used by the Vector Store)
    const embeddings = new VertexAIEmbeddings({
      modelName: config.vertexAiEmbeddingModelName,
      // Credentials should be handled by google-auth-library (ADC)
      projectId: config.gcpProjectId,
      location: config.gcpRegion,
    });

    // Initialize Vector Store
    // Ensure @google-cloud/aiplatform is installed (should be from PLAN-01)
    const store = new VertexAIVectorStore(embeddings, {
      project: config.gcpProjectId,
      location: config.gcpRegion,
      endpoint: config.vertexAiIndexEndpointId,
      index: config.vertexAiIndexId,
      // Optional: Specify publisher/model if needed by the specific LangChain version or index type
      // publisher: 'google',
      // model: 'your-model-name', // Usually inferred
    });

    // Create the retriever instance
    retrieverInstance = store.asRetriever(k);

    console.log(
      `LangChain Vector Retriever initialized successfully (k=${k}).`
    );
    return retrieverInstance;
  } catch (error) {
    console.error('Failed to initialize LangChain Vector Retriever:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

module.exports = { initializeRetriever };
