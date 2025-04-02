**Task ID**: `PLAN-04-DriveIngestion`

- **Problem Statement**: Implement a standalone script (`scripts/ingest.js`) that connects to Google Drive, retrieves specified runbook files (GDocs, PDFs, Text, Markdown), extracts their text content, splits the text into manageable chunks, generates vector embeddings for each chunk using Vertex AI Embeddings, and finally upserts these chunks and their embeddings into the pre-configured Vertex AI Vector Search index. This script forms the data backbone for the RAG system.
- **Components Involved**:
  - `scripts/ingest.js` (New script)
  - `src/config/index.js` (To load configuration/secrets)
  - `googleapis` (Google Drive API client)
  - `google-auth-library` (For authenticating Drive client with SA key)
  - `pdf-parse` (Library for parsing PDF text content)
  - `langchain/text_splitter` (`RecursiveCharacterTextSplitter`)
  - `@langchain/google-vertexai` (`VertexAIEmbeddings`)
  - `@google-cloud/aiplatform` (`IndexEndpointServiceClient` for Vector Search upsert)
  - Google Drive API
  - Vertex AI Embeddings API
  - Vertex AI Vector Search API
- **Dependencies**:
  - `PLAN-01-ProjectSetup` completed (Dependencies installed).
  - `PLAN-02-SecretsConfig` completed (`getConfig` available).
  - **Crucially:** `CONFIGURATION_GUIDE.md` steps completed:
    - Ingestion Service Account created, key generated and stored in Secret Manager (`DRIVE_SERVICE_ACCOUNT_KEY`).
    - Ingestion SA granted access to the target Google Drive Folder (`GOOGLE_DRIVE_FOLDER_ID` configured).
    - Vertex AI Vector Search Index (`VERTEX_AI_INDEX_ID`) created.
    - Vertex AI Index Endpoint (`VERTEX_AI_INDEX_ENDPOINT_ID`) created and the Index deployed to it.
    - All relevant secrets (`GCP_PROJECT_ID`, `GCP_REGION`, etc.) populated in Secret Manager or `.env`.
- **Implementation Checklist**:
  - \[ ] **Setup `scripts/ingest.js` Structure:**
    - \[ ] Import necessary modules (listed in Components).
    - \[ ] Import `getConfig` from `../src/config`.
    - \[ ] Define main async function `runIngestion()`.
    - \[ ] Call `runIngestion()` at the end, wrapped in a try-catch block with `process.exit(1)` on failure.
  - \[ ] **Load Configuration:**
    - \[ ] Inside `runIngestion`, call `const config = await getConfig();`.
    - \[ ] Verify required config values are present (e.g., `driveServiceAccountCredentials`, `googleDriveFolderId`, `vertexAiIndexId`, `vertexAiIndexEndpointId`, `gcpProjectId`, `gcpRegion`). Log and exit if missing.
  - \[ ] **Authenticate Clients:**
    - \[ ] **Google Drive Client:**
      ```javascript
      const driveAuth = new google.auth.GoogleAuth({
        credentials: config.driveServiceAccountCredentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      const drive = google.drive({ version: 'v3', auth: driveAuth });
      console.log('Google Drive client authenticated.');
      ```
    - \[ ] **Vertex AI Embeddings Client (LangChain):**
      ```javascript
      const embeddings = new VertexAIEmbeddings({
        modelName:
          config.vertexAiEmbeddingModelName || 'textembedding-gecko@003',
        // Credentials handled implicitly by google-auth-library via SA key if run in GCP or ADC locally
      });
      console.log('Vertex AI Embeddings client initialized.');
      ```
    - \[ ] **Vertex AI Vector Search Client (aiplatform):**
      ```javascript
      const { IndexEndpointServiceClient } =
        require('@google-cloud/aiplatform').v1;
      const clientOptions = {
        apiEndpoint: `${config.gcpRegion}-aiplatform.googleapis.com`,
        // Credentials handled implicitly
      };
      const indexEndpointClient = new IndexEndpointServiceClient(clientOptions);
      console.log('Vertex AI Vector Search client initialized.');
      ```
  - \[ ] **Define Supported Mime Types & Parsers:**
    - \[ ] Create a map or config for supported types and how to process them.
      ```javascript
      const SUPPORTED_MIME_TYPES = {
        'application/vnd.google-apps.document': {
          exportMimeType: 'text/plain',
          parser: 'text',
        },
        'text/plain': { parser: 'text' },
        'text/markdown': { parser: 'text' },
        'application/pdf': { parser: 'pdf' },
      };
      ```
  - \[ ] **Implement `listDriveFiles()`:**
    - \[ ] Function accepts `drive` client and `folderId`.
    - \[ ] Construct query `q`: `'${folderId}' in parents and (${Object.keys(SUPPORTED_MIME_TYPES).map(mt => `mimeType='${mt}'`).join(' or ')}) and trashed = false`.
    - \[ ] Use `drive.files.list` with `q`, `fields: 'nextPageToken, files(id, name, mimeType)'`, `pageSize: 100`.
    - \[ ] Implement pagination using `nextPageToken` to retrieve all files.
    - \[ ] Return an array of file objects `[{ id, name, mimeType }]`. Log the number of files found.
  - \[ ] **Implement `getFileContent(drive, file)`:**
    - \[ ] Function accepts `drive` client and a file object.
    - \[ ] Check `file.mimeType` against `SUPPORTED_MIME_TYPES`.
    - \[ ] If GDoc: Use `drive.files.export({ fileId: file.id, mimeType: config.exportMimeType })`. Return content directly.
    - \[ ] If PDF: Use `drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' })`. Parse the buffer using `pdf(buffer)` from `pdf-parse`. Return `data.text`.
    - \[ ] If TXT/MD: Use `drive.files.get({ fileId: file.id, alt: 'media' })`. Return content.
    - \[ ] Handle errors during download/parsing gracefully (log error, return null or empty string).
  - \[ ] **Implement Text Splitting:**
    - \[ ] Initialize `RecursiveCharacterTextSplitter` (use reasonable `chunkSize`, `chunkOverlap` from config or defaults).
    - \[ ] Function `splitText(text, file)` accepts text content and the file object.
    - \[ ] Call `splitter.createDocuments([text], [{ source: file.id, name: file.name }])`. Langchain handles metadata propagation.
    - \[ ] **Generate Unique IDs:** Iterate through the generated LangChain `Document` objects. Assign a unique ID to each document's metadata, e.g., `doc.metadata.id = `${file.id}_chunk_${index}`;`. This ID will be used as the vector ID.
    - \[ ] Return the array of LangChain `Document` objects, each with `pageContent` and `metadata` (including the unique `id`).
  - \[ ] **Implement Batch Embedding:**
    - \[ ] Function `embedChunks(chunks)` accepts the array of `Document` objects.
    - \[ ] Extract `pageContent` from each chunk.
    - \[ ] Call `embeddings.embedDocuments(pageContents)` potentially in batches if the list is very large (e.g., batches of 100-200). Vertex AI has limits.
    - \[ ] Map the resulting embedding vectors back to their corresponding chunk `Document` objects (ensure order is preserved or use metadata IDs). Return an array like `[{ id: metadata.id, embedding: vector, metadata: metadata, pageContent: pageContent }]`.
  - \[ ] **Implement Batch Upsert to Vector Search:**
    - \[ ] Function `upsertVectors(embeddedChunks)` accepts the array from the previous step.
    - \[ ] Construct the full Index Endpoint path: `indexEndpointClient.indexEndpointPath(config.gcpProjectId, config.gcpRegion, config.vertexAiIndexEndpointId)`.
    - \[ ] Format the `datapoints` array for the `upsertDatapoints` request: Each element needs `datapointId` (our unique chunk ID) and `featureVector` (the embedding).
    - \[ ] **Batching:** The `upsertDatapoints` API has limits on request size and number of vectors per request (check current Vertex AI limits, often around 100-1000 vectors or 10MB). Split `embeddedChunks` into smaller batches.
    - \[ ] For each batch: Create the `upsertDatapointsRequest` object and call `indexEndpointClient.upsertDatapoints(request)`.
    - \[ ] Handle potential errors (e.g., throttling). Implement basic retry logic if needed. Log success/failure for each batch.
  - \[ ] **Orchestrate in `runIngestion()`:**
    - \[ ] Call `listDriveFiles`.
    - \[ ] Loop through files:
      - \[ ] Call `getFileContent`. Skip if null/empty.
      - \[ ] Call `splitText`.
      - \[ ] Add the resulting chunks to a master list.
    - \[ ] If chunks were generated:
      - \[ ] Call `embedChunks` (passing the master list).
      - \[ ] Call `upsertVectors` (passing the embedded chunks).
    - \[ ] Log overall success or failure, number of files processed, chunks created, and vectors upserted.
- **Verification Steps**:
  1.  **Prepare Test Data:** Ensure the configured Google Drive folder contains a few sample files of different supported types (GDoc, PDF, TXT, MD) with varied content lengths.
  2.  **Run Locally:**
      - Ensure `.env` contains valid credentials (`DRIVE_SERVICE_ACCOUNT_KEY_PATH` pointing to the JSON key) and correct config (Project ID, Region, Index/Endpoint IDs, Folder ID).
      - Execute the script: `node scripts/ingest.js`.
      - Monitor console logs closely for:
        - Authentication success messages.
        - Number of files found.
        - Logs indicating successful download/parsing for each file type (or errors).
        - Number of chunks created.
        - Logs indicating successful embedding generation.
        - Logs indicating successful upsert batches to Vector Search.
        - Final summary log.
      - Handle any errors reported.
  3.  **Verify in GCP Console (Vertex AI -> Vector Search):**
      - Navigate to your Index details page.
      - Check the "Datapoint count". It should reflect the total number of chunks created and upserted. (Note: Count might take a few minutes to update after upsert).
  4.  **(Optional but Recommended) Query Manually:** Use the `gcloud ai index-endpoints query` command or the GCP Console's Query interface (if available) with a sample embedding vector to see if relevant datapoint IDs are returned. This requires generating an embedding for a test query separately.
  5.  Review script code for clarity, error handling (especially around file processing and API calls), batching logic, and efficiency.
- **Decision Authority**:
  - AI **can** choose appropriate batch sizes for embedding and upserting based on typical limits (but should make them configurable or log the chosen size).
  - AI **can** select default chunking parameters (`chunkSize`, `chunkOverlap`) but should make them easily adjustable.
  - AI **can** decide on the specific format for unique chunk IDs (ensure it includes file source info).
  - AI **must** handle API errors gracefully (log and potentially continue with other files/batches if possible, rather than crashing the whole script on a single failure).
  - AI **cannot** change the core logic of using Drive -> Chunk -> Embed -> Upsert.
- **Questions/Uncertainties**:
  - _Blocking_: None, assuming GCP setup is correct.
  - _Non-blocking_: Optimal batch sizes for Vertex AI APIs (may require testing or checking current documentation). Best retry strategy for API errors (Assume simple logging first, add retries if issues arise). Reliability of `pdf-parse` on complex PDFs. How to handle deletions (Assume not handled in V1 - requires separate logic or full index rebuild).
- **Acceptable Tradeoffs**:
  - V1 may not handle updates/deletions efficiently (relies on upsert overwriting based on stable chunk IDs or requires periodic full re-indexing).
  * Error handling for individual file processing can be basic (log and skip) to prevent one bad file from stopping the whole process.
  * Performance optimization (e.g., parallel file processing) is out of scope for V1.
  * Only basic text extraction from PDFs (no complex layout/table handling).
- **Status**: Not Started
- **Notes**:
  - This script is critical and potentially long-running. Robust logging is essential.
  - Consider making chunk size, overlap, and batch sizes configurable via environment variables.
  - The unique chunk ID generation is vital for potential future updates/deletions. Format `fileId_chunk_index` is a reasonable start.
  - Ensure the correct `apiEndpoint` is used for the `IndexEndpointServiceClient` based on the configured `gcpRegion`.
