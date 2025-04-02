const functions = require('@google-cloud/functions-framework');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { VertexAIEmbeddings } = require('@langchain/google-vertexai');
const { IndexEndpointServiceClient } = require('@google-cloud/aiplatform').v1;
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const pdf = require('pdf-parse');

// --- Configuration --- //
const CHUNK_SIZE = 1000; // Characters per chunk
const CHUNK_OVERLAP = 150; // Characters overlap between chunks
const EMBEDDING_BATCH_SIZE = 200; // Max vectors per Vertex AI embed request
const UPSERT_BATCH_SIZE = 100; // Max vectors per Vertex AI upsert request

const SUPPORTED_MIME_TYPES = {
  'application/vnd.google-apps.document': {
    exportMimeType: 'text/plain',
    parser: 'text',
  },
  'text/plain': { parser: 'text' },
  'text/markdown': { parser: 'text' },
  'application/pdf': { parser: 'pdf' },
};

// --- Config Helper --- //
// Adapted from src/config to work in Cloud Function context

// List of secret names expected in Secret Manager
const productionSecretNames = [
  'VERTEX_AI_INDEX_ID',
  'VERTEX_AI_INDEX_ENDPOINT_ID',
  'VERTEX_AI_EMBEDDING_MODEL_NAME',
  'GOOGLE_DRIVE_FOLDER_ID',
  'DRIVE_SERVICE_ACCOUNT_KEY', // JSON key content
];

// Helper function to convert snake_case to camelCase
function toCamelCase(str) {
  return str
    .toLowerCase()
    .replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace('-', '').replace('_', '')
    );
}

async function getConfig() {
  console.log('Loading configuration for Cloud Function...');
  const loadedConfig = {};
  
  const secretClient = new SecretManagerServiceClient();
  
  // Get Project ID - From env var (should be set by Cloud Function runtime)
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error('GCP_PROJECT_ID environment variable is required');
  }
  loadedConfig.gcpProjectId = projectId;
  
  // Get Region - From env var (should be set by Cloud Function runtime)
  if (!process.env.GCP_REGION) {
    throw new Error('GCP_REGION environment variable is required');
  }
  loadedConfig.gcpRegion = process.env.GCP_REGION;
  
  console.log(`Fetching secrets from Project ID: ${projectId}`);
  
  try {
    const accessPromises = productionSecretNames.map(async (secretName) => {
      const secretVersionName = `projects/${projectId}/secrets/${secretName}/versions/latest`;
      try {
        const [version] = await secretClient.accessSecretVersion({
          name: secretVersionName,
        });
        const payload = version.payload.data.toString('utf8');
        const camelCaseKey = toCamelCase(secretName);
        
        // Special handling for the Drive SA key JSON
        if (secretName === 'DRIVE_SERVICE_ACCOUNT_KEY') {
          try {
            loadedConfig.driveServiceAccountCredentials = JSON.parse(payload);
          } catch (parseError) {
            console.error(`Failed to parse JSON for secret: ${secretName}`, parseError);
            throw new Error(`Secret ${secretName} does not contain valid JSON.`);
          }
        } else {
          loadedConfig[camelCaseKey] = payload;
        }
        console.log(`Successfully fetched secret: ${secretName}`);
      } catch (error) {
        console.error(`Failed to access secret: ${secretName}`, error);
        throw new Error(`Failed to load required secret: ${secretName}`);
      }
    });
    
    await Promise.all(accessPromises);
    console.log('All secrets fetched successfully from Secret Manager.');
  } catch (error) {
    console.error('Error fetching secrets from Secret Manager:', error);
    throw error;
  }
  
  return loadedConfig;
}

// --- Helper Functions --- //

/**
 * Lists files within a specific Google Drive folder matching supported types.
 * @param {object} drive - Authenticated Google Drive API client.
 * @param {string} folderId - The ID of the Google Drive folder.
 * @returns {Promise<Array<{id: string, name: string, mimeType: string}>>} - Array of file objects.
 */
async function listDriveFiles(drive, folderId) {
  console.log(`Listing files in Google Drive folder: ${folderId}`);
  const files = [];
  let pageToken = null;
  const mimeTypeQuery = Object.keys(SUPPORTED_MIME_TYPES)
    .map((mt) => `mimeType='${mt}'`)
    .join(' or ');
  const query = `'${folderId}' in parents and (${mimeTypeQuery}) and trashed = false`;

  try {
    do {
      const res = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 100, // Adjust as needed
        pageToken,
      });
      if (res.data.files) {
        files.push(...res.data.files);
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    console.log(`Found ${files.length} supported files in the folder.`);
    return files;
  } catch (error) {
    console.error('Error listing files from Google Drive:', error);
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

/**
 * Downloads and extracts text content from a Google Drive file.
 * @param {object} drive - Authenticated Google Drive API client.
 * @param {object} file - File object { id, name, mimeType }.
 * @returns {Promise<string|null>} - Extracted text content or null if failed.
 */
async function getFileContent(drive, file) {
  console.log(`Processing file: ${file.name} (${file.mimeType})`);
  const fileConfig = SUPPORTED_MIME_TYPES[file.mimeType];
  if (!fileConfig) {
    console.warn(`Skipping unsupported file type: ${file.mimeType} for ${file.name}`);
    return null;
  }

  try {
    if (fileConfig.parser === 'text') {
      let response;
      if (fileConfig.exportMimeType) {
        // Google Doc
        response = await drive.files.export(
          { fileId: file.id, mimeType: fileConfig.exportMimeType },
          { responseType: 'text' } // Ensure text response
        );
      } else {
        // Plain text / Markdown
        response = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'text' } // Ensure text response
        );
      }
      return typeof response.data === 'string' ? response.data : ''; // Handle potential non-string responses
    }
    if (fileConfig.parser === 'pdf') {
      const response = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      const data = await pdf(response.data);
      return data.text;
    }
  } catch (error) {
    console.error(`Error getting content for file ${file.name} (${file.id}):`, error);
    return null; // Skip file on error
  }
  return null;
}

/**
 * Splits text content into LangChain Document objects with unique IDs.
 * @param {string} text - The text content.
 * @param {object} file - The file object { id, name }.
 * @returns {Array<import("langchain/document").Document>} - Array of LangChain documents.
 */
function splitText(text, file) {
  if (!text || typeof text !== 'string') {
    console.warn(`Skipping splitting for file ${file.name} due to empty or invalid text content.`);
    return [];
  }

  console.log(`Splitting text for file: ${file.name}`);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  // Create documents expects an array of texts
  const documents = splitter.createDocuments(
    [text],
    [
      {
        source: file.id, // Use file ID as source
        name: file.name, // Keep original file name
      },
    ]
  );

  // Assign unique ID to each chunk's metadata
  documents.forEach((doc, index) => {
    doc.metadata.id = `${file.id}_chunk_${index}`;
  });

  console.log(`Created ${documents.length} chunks for file: ${file.name}`);
  return documents;
}

/**
 * Generates embeddings for text chunks in batches.
 * @param {Array<import("langchain/document").Document>} chunks - Array of LangChain documents.
 * @param {VertexAIEmbeddings} embeddingsClient - Initialized Vertex AI Embeddings client.
 * @returns {Promise<Array<{id: string, embedding: number[], metadata: object, pageContent: string}>>} - Array of chunks with embeddings.
 */
async function embedChunks(chunks, embeddingsClient) {
  console.log(`Generating embeddings for ${chunks.length} chunks...`);
  const embeddedChunks = [];
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchTexts = batch.map((chunk) => chunk.pageContent);

    try {
      console.log(`Embedding batch ${i / EMBEDDING_BATCH_SIZE + 1} (${batch.length} chunks)...`);
      const batchEmbeddings = await embeddingsClient.embedDocuments(batchTexts);

      if (batchEmbeddings.length !== batch.length) {
        throw new Error('Mismatch between number of texts and embeddings returned.');
      }

      batch.forEach((chunk, index) => {
        embeddedChunks.push({
          id: chunk.metadata.id, // The unique ID we assigned
          embedding: batchEmbeddings[index],
          metadata: chunk.metadata,
          pageContent: chunk.pageContent,
        });
      });
      console.log(`Batch ${i / EMBEDDING_BATCH_SIZE + 1} embedded successfully.`);
    } catch (error) {
      console.error(`Error embedding batch starting at index ${i}:`, error);
      // Decide whether to skip the batch or stop the process
      console.warn(`Skipping embedding for batch starting at index ${i}.`);
    }
  }
  console.log(`Generated embeddings for ${embeddedChunks.length} out of ${chunks.length} chunks.`);
  return embeddedChunks;
}

/**
 * Upserts vectors into Vertex AI Vector Search index in batches.
 * @param {Array<{id: string, embedding: number[]}>} embeddedChunks - Chunks with IDs and embeddings.
 * @param {object} config - Application configuration.
 * @param {IndexEndpointServiceClient} indexEndpointClient - Initialized Vector Search client.
 */
async function upsertVectors(embeddedChunks, config, indexEndpointClient) {
  console.log(`Upserting ${embeddedChunks.length} vectors into Vertex AI Vector Search...`);
  const indexEndpoint = indexEndpointClient.indexEndpointPath(
    config.gcpProjectId,
    config.gcpRegion,
    config.vertexAiIndexEndpointId
  );

  let upsertedCount = 0;
  for (let i = 0; i < embeddedChunks.length; i += UPSERT_BATCH_SIZE) {
    const batch = embeddedChunks.slice(i, i + UPSERT_BATCH_SIZE);
    const datapoints = batch.map((chunk) => ({
      datapointId: chunk.id,
      featureVector: chunk.embedding,
    }));

    const request = {
      indexEndpoint,
      datapoints,
    };

    try {
      console.log(`Upserting batch ${i / UPSERT_BATCH_SIZE + 1} (${batch.length} vectors)...`);
      const [response] = await indexEndpointClient.upsertDatapoints(request);
      console.log(`Batch ${i / UPSERT_BATCH_SIZE + 1} upserted successfully.`);
      upsertedCount += batch.length;
    } catch (error) {
      console.error(`Error upserting batch starting at index ${i}:`, error.message);
      console.warn(`Skipping upsert for batch starting at index ${i}.`);
    }
  }
  console.log(`Successfully upserted ${upsertedCount} out of ${embeddedChunks.length} vectors.`);
}

// --- Main Ingestion Logic --- //
async function runIngestion() {
  console.log('Starting runbook ingestion process...');
  let config;
  try {
    config = await getConfig();
  } catch (e) {
    console.error('Failed to load configuration. Exiting.', e);
    throw e;
  }

  // Validate essential configuration
  const requiredConfig = [
    'driveServiceAccountCredentials',
    'googleDriveFolderId',
    'vertexAiIndexId',
    'vertexAiIndexEndpointId',
    'gcpProjectId',
    'gcpRegion',
    'vertexAiEmbeddingModelName',
  ];
  const missingConfig = requiredConfig.filter((key) => !config[key]);
  if (missingConfig.length > 0) {
    throw new Error(`Missing required configuration keys: ${missingConfig.join(', ')}`);
  }

  // Authenticate Google Drive Client using SA Key from config
  let driveClient;
  try {
    const driveAuth = new GoogleAuth({
      credentials: config.driveServiceAccountCredentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    driveClient = google.drive({ version: 'v3', auth: driveAuth });
    console.log('Google Drive client authenticated successfully.');
  } catch (error) {
    console.error('Failed to authenticate Google Drive client:', error);
    throw error;
  }

  // Initialize Vertex AI Clients
  let embeddingsClient;
  let indexEndpointClient;
  try {
    embeddingsClient = new VertexAIEmbeddings({
      modelName: config.vertexAiEmbeddingModelName,
    });
    console.log('Vertex AI Embeddings client initialized.');

    const clientOptions = {
      apiEndpoint: `${config.gcpRegion}-aiplatform.googleapis.com`,
    };
    indexEndpointClient = new IndexEndpointServiceClient(clientOptions);
    console.log('Vertex AI Vector Search client initialized.');
  } catch (error) {
    console.error('Failed to initialize Vertex AI clients:', error);
    throw error;
  }

  // --- Processing Steps --- //
  const allChunks = [];
  let filesProcessed = 0;

  try {
    // 1. List files
    const files = await listDriveFiles(driveClient, config.googleDriveFolderId);

    // 2. Process each file
    for (const file of files) {
      const content = await getFileContent(driveClient, file);
      if (content) {
        const chunks = splitText(content, file);
        if (chunks.length > 0) {
          allChunks.push(...chunks);
          filesProcessed++;
        }
      } else {
        console.warn(`Skipped processing file ${file.name} due to content retrieval/parsing issues.`);
      }
    }
    console.log(`Successfully processed ${filesProcessed} files, generated ${allChunks.length} initial chunks.`);

    if (allChunks.length > 0) {
      // 3. Embed chunks
      const embeddedChunks = await embedChunks(allChunks, embeddingsClient);

      if (embeddedChunks.length > 0) {
        // 4. Upsert vectors
        await upsertVectors(embeddedChunks, config, indexEndpointClient);
        console.log('Ingestion process completed successfully.');
        return {
          filesProcessed,
          chunksGenerated: allChunks.length,
          chunksEmbedded: embeddedChunks.length
        };
      } else {
        console.log('No chunks were successfully embedded. Ingestion finished without upserting.');
        return {
          filesProcessed,
          chunksGenerated: allChunks.length,
          chunksEmbedded: 0,
          status: 'No chunks embedded'
        };
      }
    } else {
      console.log('No text chunks were generated from the files. Ingestion finished.');
      return {
        filesProcessed,
        chunksGenerated: 0,
        status: 'No chunks generated'
      };
    }
  } catch (error) {
    console.error('An error occurred during the ingestion process:', error);
    throw error;
  }
}

// --- Define Cloud Function --- //
functions.http('runbookIngestionHttp', async (req, res) => {
  console.log('Received trigger for runbook ingestion function.');
  
  try {
    const result = await runIngestion();
    const summary = `Ingestion completed successfully. Processed ${result.filesProcessed} files, generated ${result.chunksGenerated} chunks, embedded ${result.chunksEmbedded || 0} chunks.`;
    console.log(summary);
    res.status(200).send({
      status: 'success',
      message: summary,
      result
    });
  } catch (error) {
    console.error('Runbook ingestion failed:', error);
    res.status(500).send({
      status: 'error',
      message: `Ingestion failed: ${error.message}`
    });
  }
}); 