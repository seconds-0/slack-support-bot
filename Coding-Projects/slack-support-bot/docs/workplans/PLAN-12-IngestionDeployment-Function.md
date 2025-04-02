# Work Plan: Deploy Runbook Ingestion Script via Cloud Function

- **Task ID**: `PLAN-12-IngestionDeployment-Function`
- **Problem Statement**: Define and implement a deployment strategy for the runbook ingestion logic (originally in `scripts/ingest.js`) as a Google Cloud Function (Gen 2 recommended). This function will be triggered periodically by Cloud Scheduler to keep the Vertex AI Vector Search index updated.
- **Components Involved**:
  - Ingestion logic (adapted from `scripts/ingest.js`)
  - Cloud Functions framework (Node.js runtime)
  - `package.json` (Dependencies for the function)
  - Google Cloud Functions (Gen 2 HTTP Function recommended)
  - Google Cloud Scheduler (To trigger the function)
  - IAM (Ensuring the Function's runtime SA has Ingestion permissions)
  - Google Secret Manager (Accessing secrets)
- **Dependencies**:
  - `PLAN-04-DriveIngestion` logic defined (will be adapted).
  - `PLAN-02-SecretsConfig` logic defined (will be adapted for Function context).
  - Ingestion Service Account (`oncall-runbook-ingester@...`) created with necessary permissions (Drive read, Vertex AI User, Secret Accessor).
  - Required secrets stored in Secret Manager.
  - Cloud Functions API and Cloud Scheduler API enabled.
  - Cloud Build API enabled (Functions use it for deployment).

## Implementation Checklist (Using Option A: Cloud Function)

- \[ ] **Adapt Ingestion Logic for Cloud Functions:**

  - **Create Function Entry Point:** Create a new file, e.g., `functions/ingestion/index.js`. The core logic from `scripts/ingest.js` will move here.
  - **Export HTTP Function:** Wrap the ingestion logic within an exported Node.js function suitable for Google Cloud Functions (HTTP Trigger).

    ```javascript
    // functions/ingestion/index.js
    const functions = require('@google-cloud/functions-framework');
    const { getConfig } = require('../../src/config'); // Adapt path as needed
    // ... import other necessary ingestion dependencies (googleapis, VertexAIEmbeddings, etc.) ...
    // ... include or import the core ingestion functions (listDriveFiles, processFile, etc.) ...

    functions.http('runbookIngestionHttp', async (req, res) => {
      console.log('Received trigger for runbook ingestion.');
      try {
        const config = await getConfig(); // Load config (ensure this works in Func env)

        // --- Re-implement or call core ingestion steps ---
        // 1. Authenticate clients (Drive, Embeddings, Vector Search) using Ingestion SA
        //    (Should happen automatically via Function's runtime SA if configured)
        // 2. List Drive files
        // 3. Process files (download, parse, chunk)
        // 4. Embed chunks
        // 5. Upsert vectors to Vertex AI Search
        // --- End core ingestion steps ---

        const summary = `Ingestion completed successfully.`; // Add details: files processed, chunks upserted
        console.log(summary);
        res.status(200).send(summary);
      } catch (error) {
        console.error('Runbook ingestion failed:', error);
        res.status(500).send(`Ingestion failed: ${error.message}`);
      }
    });
    ```

  - **Adapt Configuration Loading:** Ensure `getConfig()` works within the Cloud Functions environment. It should detect `NODE_ENV=production` (set automatically) and use Secret Manager. The Function's runtime service account needs Secret Accessor permissions.
  - **Package Dependencies:** Create a separate `package.json` inside the `functions/ingestion/` directory listing _only_ the dependencies needed for the ingestion function (googleapis, langchain, vertexai clients, pdf-parse, etc.). This keeps the function deployment package small. Copy relevant dependencies from the main `package.json`.

- \[ ] **Configure Function Deployment (`gcloud`):**

  - Define the deployment command.

    ```bash
    # Example gcloud command to deploy the function

    FUNCTION_NAME="oncall-runbook-ingestion"
    # Use the dedicated Ingestion Service Account for runtime
    INGESTION_SA_EMAIL="oncall-runbook-ingester@${PROJECT_ID}.iam.gserviceaccount.com"

    gcloud functions deploy "${FUNCTION_NAME}" \
      --gen2 \
      --runtime nodejs18 \ # Or nodejs20
      --region "${REGION}" \
      --source ./functions/ingestion \ # Directory containing function code and package.json
      --entry-point runbookIngestionHttp \
      --trigger-http \
      --no-allow-unauthenticated \ # Secure by default, trigger via Scheduler with auth
      --timeout=1800s \ # Set timeout (e.g., 1800s = 30 min) - likely much less needed
      --memory=1024Mi \ # Adjust memory (512Mi might be enough)
      # Assign the Ingestion Service Account
      --run-service-account "${INGESTION_SA_EMAIL}" \
      # Mount secrets needed by the ingest function
      # Secrets are available as env vars OR mounted files in Gen 2
      # Using env vars is often simpler for this pattern:
      --set-secrets=DRIVE_SERVICE_ACCOUNT_KEY=DRIVE_SERVICE_ACCOUNT_KEY:latest,GCP_PROJECT_ID=GCP_PROJECT_ID:latest,GCP_REGION=GCP_REGION:latest,VERTEX_AI_INDEX_ID=VERTEX_AI_INDEX_ID:latest,VERTEX_AI_INDEX_ENDPOINT_ID=VERTEX_AI_INDEX_ENDPOINT_ID:latest,GOOGLE_DRIVE_FOLDER_ID=GOOGLE_DRIVE_FOLDER_ID:latest \
      # Set necessary non-secret env vars
      --set-env-vars=NODE_ENV=production
      # --set-env-vars=VERTEX_AI_EMBEDDING_MODEL_NAME=... # Add if needed
    ```

  - _(Note: Gen 2 functions run on Cloud Run infrastructure, hence similar flags. `--set-secrets` makes secrets available as env vars inside the function)_

- \[ ] **Deploy the Cloud Function:**
  - Run the `gcloud functions deploy` command from the project root directory (or adjust `--source` path).
  - Verify successful deployment in the terminal output or GCP Console. Note the HTTP Trigger URL.
- \[ ] **Manual Function Trigger Test:**

  - Trigger the function manually to test. Since it requires authentication, the easiest way is often using `gcloud`:

    ```bash
    # Get an identity token for the Ingestion SA (or another SA authorized to invoke)
    gcloud auth print-identity-token

    # Get the function URL
    FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} --region=${REGION} --format='value(url)')

    # Invoke using curl with the token
    curl -m 70 -X POST "${FUNCTION_URL}" \
      -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
      -H "Content-Type: application/json" \
      -d '{}'
    ```

  - Alternatively, use the "Test Function" feature in the GCP Console, ensuring you test _with authentication_ using an appropriate service account.
  - Monitor the execution logs in Cloud Logging. Verify successful completion and check the Vector Search index datapoint count. Debug any errors.

- \[ ] **Create Cloud Scheduler Job:**

  - Use `gcloud` CLI (or Console).
  - Define the schedule (e.g., `0 3 * * *` = 3 AM daily).
  - Configure the target to invoke the **Cloud Function HTTP endpoint** using **OIDC authentication**.

    ```bash
    SCHEDULER_JOB_NAME="trigger-runbook-ingestion-func"
    SCHEDULE="0 3 * * *" # Example: 3 AM Daily UTC
    TIMEZONE="Etc/UTC"
    FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} --region=${REGION} --format='value(serviceConfig.uri)') # Get the HTTPS trigger URL

    # Use the Ingestion SA (or another dedicated SA) to invoke the function
    INVOKER_SA_EMAIL="${INGESTION_SA_EMAIL}"

    gcloud scheduler jobs create http "${SCHEDULER_JOB_NAME}" \
        --schedule="${SCHEDULE}" \
        --time-zone="${TIMEZONE}" \
        --uri="${FUNCTION_URL}" \
        --http-method POST \
        # Use OIDC token for authentication
        --oidc-service-account-email "${INVOKER_SA_EMAIL}" \
        # The audience is typically the function URL for OIDC
        --oidc-token-audience="${FUNCTION_URL}"

    # Grant necessary invoker role (roles/cloudfunctions.invoker) to the SA
    gcloud functions add-iam-policy-binding ${FUNCTION_NAME} \
        --region=${REGION} \
        --member="serviceAccount:${INVOKER_SA_EMAIL}" \
        --role='roles/cloudfunctions.invoker'
    ```

  - _(Note: OIDC auth is generally preferred for invoking Cloud Functions/Run services from Scheduler)_

- \[ ] **Manual Scheduler Trigger Test:**

  - Trigger the Cloud Scheduler job manually (`gcloud scheduler jobs run ${SCHEDULER_JOB_NAME}` or via Console).
  - Verify this successfully triggers the Cloud Function execution (check Function logs).

- **Verification Steps**:
  1.  Confirm the Cloud Function resource (`oncall-runbook-ingestion`) is created and deployed successfully in GCP.
  2.  Verify manual authenticated invocation of the Function (via `gcloud` test or `curl` with token) completes successfully and updates the Vector Search index (check datapoint count, review logs).
  3.  Confirm the Cloud Scheduler Job resource (`trigger-runbook-ingestion-func`) is created.
  4.  Verify manual triggering of the Scheduler job successfully invokes the Cloud Function.
  5.  Check IAM permissions (`roles/cloudfunctions.invoker`) are correctly granted to the invoking service account.
  6.  Monitor the first scheduled run to ensure the automation works.
  7.  Review function code (`functions/ingestion/index.js`) and its `package.json` for correctness and dependency isolation.
- **Decision Authority**:
  - AI **must** implement using Cloud Functions (Gen 2) and Cloud Scheduler with HTTP/OIDC trigger.
  - AI **must** adapt the core ingestion logic into the function structure.
  - AI **can** choose resource allocation (Memory, Timeout) for the function, starting reasonably (e.g., 512Mi-1Gi, 10-30min timeout).
  - AI **must** ensure the function uses the correct runtime service account (`Ingestion SA`).
  - AI **must** configure secrets correctly for the function environment.
- **Questions/Uncertainties**:
  - _Blocking_: None, assuming previous plans and GCP setup are correct.
  - _Non-blocking_: Exact memory/timeout needs (monitor and adjust). Ensuring `getConfig` correctly picks up secrets passed as environment variables in the Function context. Best way to structure shared code between the main bot and the function (e.g., keep config logic separate). _(Assumption: Adapt config loading, share core types/utils if necessary)_.
- **Acceptable Tradeoffs**:
  - Requires maintaining a separate `package.json` for the function to optimize deployment size.
  - Potential cold starts for the function if run very infrequently (though usually acceptable for nightly jobs).
- **Status**: Completed
- **Notes**:
  - This approach leverages serverless execution, suitable for the specified workload size.
  - Ensure the Function's runtime Service Account (`--run-service-account`) has _all_ permissions needed for ingestion (Secret Accessor, Drive Read, Vertex AI User).
  - Using OIDC authentication from Scheduler to Function is secure and standard practice.
  - Remember to place the function code in a dedicated directory (`functions/ingestion/`) with its own `package.json`.
  - Implemented the Cloud Function in `functions/ingestion/index.js` with a dedicated `package.json` and deployment script.
