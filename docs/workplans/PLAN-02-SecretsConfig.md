# Work Plan: Configuration and Secrets Loading

- **Task ID**: `PLAN-02-SecretsConfig`
- **Problem Statement**: Implement robust logic to load application configuration and sensitive secrets. The system must prioritize loading from Google Secret Manager when running in a production environment (specifically on Cloud Run) and fall back to using a local `.env` file for development purposes. This ensures secure handling of credentials while maintaining ease of local development.
- **Components Involved**:
  - `src/config/index.js` (New file to house the logic)
  - `@google-cloud/secret-manager` (SDK for accessing Secret Manager)
  - `dotenv` (Library for loading `.env` files)
  - `process.env` (Node.js environment variables)
  - `.env` file (Local development, gitignored)
  - `.env.example` (Template for `.env`)
- **Dependencies**:
  - `PLAN-01-ProjectSetup` completed (Dependencies installed, file structure exists).
  * GCP Project configured with Secret Manager API enabled.
  * Secrets created in Google Secret Manager (as per `CONFIGURATION_GUIDE.md`).
  * Appropriate IAM permissions (`Secret Manager Secret Accessor`) granted to the service account that will run the code (Cloud Run SA in production, potentially user credentials or a local SA key for local testing).
- **Implementation Checklist**:

  - \[ ] Create the configuration file: `src/config/index.js`.
  - \[ ] Import necessary modules: `SecretManagerServiceClient` from `@google-cloud/secret-manager`, `config` from `dotenv`.
  - \[ ] Define an asynchronous function `loadConfig()` responsible for loading and returning the configuration object.
  - \[ ] Inside `loadConfig()`:
    - \[ ] Determine the environment: Check `process.env.NODE_ENV === 'production'`.
    - \[ ] **If Production (`NODE_ENV === 'production'`):**
      - \[ ] Log message indicating production mode secret loading.
      - \[ ] Initialize `SecretManagerServiceClient`.
      - \[ ] Get `GCP_PROJECT_ID`: Read from `process.env.GCP_PROJECT_ID` (set during Cloud Run deployment) or attempt to get it from the client (`await secretClient.getProjectId()`).
      - \[ ] Define an array `secretNames` containing the exact names of all secrets stored in Secret Manager (e.g., `SLACK_BOT_TOKEN`, `GCP_REGION`, `DRIVE_SERVICE_ACCOUNT_KEY`, etc. - match `CONFIGURATION_GUIDE.md`).
      - \[ ] Create an empty `config` object.
      - \[ ] Use `Promise.all()` to fetch all secrets concurrently for efficiency. Iterate through `secretNames`:
        - \[ ] Construct the full secret version name: `projects/${projectId}/secrets/${secretName}/versions/latest`.
        - \[ ] Call `secretClient.accessSecretVersion({ name: secretVersionName })`.
        - \[ ] Decode the payload: `version.payload.data.toString('utf8')`.
        - \[ ] Store the decoded value in the `config` object using a consistent key (e.g., camelCase like `slackBotToken`).
      - \[ ] **Crucially:** Add specific error handling within the loop or after `Promise.all()` to check if _any_ secret failed to load. If a required secret is missing, throw an informative error to prevent the application from starting with incomplete configuration. Log which secret failed.
      - \[ ] **Special Handling for `DRIVE_SERVICE_ACCOUNT_KEY`:** Parse the fetched JSON string into an object: `config.driveServiceAccountCredentials = JSON.parse(config.driveServiceAccountKey);`. Wrap this in a try-catch block in case the secret content is not valid JSON.
      - \[ ] Log success message (without logging secret values).
      - \[ ] Return the populated `config` object.
    - \[ ] **Else (Development/Other Environment):**
      - \[ ] Log message indicating development mode `.env` loading.
      - \[ ] Call `dotenv.config()`. Check for potential errors during loading.
      - \[ ] Create an empty `config` object.
      - \[ ] Define expected environment variables based on `.env.example`.
      - \[ ] Read each expected variable from `process.env` and store it in the `config` object (e.g., `config.slackBotToken = process.env.SLACK_BOT_TOKEN`).
      - \[ ] Add checks for _required_ variables in development (e.g., `SLACK_BOT_TOKEN`). Throw an error or log a strong warning if missing.
      - \[ ] **Special Handling for `DRIVE_SERVICE_ACCOUNT_KEY_PATH`:** If `process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH` is set:
        - \[ ] Try to `require()` the JSON file specified by the path.
        - \[ ] Store the resulting object in `config.driveServiceAccountCredentials`.
        - \[ ] Wrap file reading/parsing in a try-catch block with informative error messages.
      - \[ ] Log success message (listing loaded keys, not values).
      - \[ ] Return the populated `config` object.
  - \[ ] In `src/config/index.js`, call `loadConfig()` and export the resulting promise or handle the async loading appropriately so other modules can reliably get the config. A common pattern is to export a promise that resolves with the config, or an async initialization function to be called at app startup. Let's choose exporting an async function `getConfig()` that caches the result.

    ```javascript
    // src/config/index.js
    const {
      SecretManagerServiceClient,
    } = require('@google-cloud/secret-manager');
    const dotenv = require('dotenv');
    const fs = require('fs'); // For local key reading
    const path = require('path'); // For local key reading

    let config = null; // Cache

    async function loadConfigInternal() {
      // ... implementation described above ...
      // return the populated config object
    }

    async function getConfig() {
      if (!config) {
        try {
          console.log('Loading application configuration...');
          config = await loadConfigInternal();
          console.log('Configuration loaded successfully.');
        } catch (error) {
          console.error('FATAL: Failed to load configuration:', error);
          // Depending on severity, you might want to exit
          process.exit(1); // Exit if config fails to load
        }
      }
      return config;
    }

    module.exports = { getConfig }; // Export the async function
    ```

  - \[ ] Ensure `.env` is listed in `.gitignore`.
  - \[ ] Update `.env.example` to accurately reflect all variables needed, including `NODE_ENV` and potentially `DRIVE_SERVICE_ACCOUNT_KEY_PATH` for local use.

- **Verification Steps**:
  1.  **Local `.env` Test:**
      - Create a `.env` file with sample (non-real, if preferred) values for all required variables, including a path to a dummy JSON file for `DRIVE_SERVICE_ACCOUNT_KEY_PATH`.
      - Create a temporary test script (e.g., `test-config.js`) that imports `getConfig` from `src/config/index.js` and calls it.
      - Run `node test-config.js`. Verify that it logs "development mode" loading and success.
      - Inspect the returned config object (via `console.log`) to ensure all values from `.env` are correctly loaded and the SA key JSON is parsed.
      - Test missing required variables in `.env` and verify an appropriate error is thrown or logged.
      - Test an invalid path for `DRIVE_SERVICE_ACCOUNT_KEY_PATH` and verify the error is caught.
  2.  **Simulated Production Test (Requires GCP Auth Locally):**
      - Ensure you are authenticated to GCP locally (e.g., via `gcloud auth application-default login`).
      - Ensure the necessary secrets exist in Secret Manager for your project.
      - Temporarily set `NODE_ENV=production` in your terminal (`export NODE_ENV=production` on Linux/macOS or `set NODE_ENV=production` on Windows).
      - Run `node test-config.js` again. Verify it logs "production mode" loading.
      - Verify the config object is populated with values fetched from Secret Manager.
      - Test by temporarily disabling access or deleting a secret and verify the error handling catches it.
      - Unset `NODE_ENV`.
  3.  Review the code for clarity, error handling, and secure handling (no logging of secrets).
- **Decision Authority**:
  - AI **can** choose specific variable names within the `config` object (e.g., `slackBotToken` vs `SLACK_BOT_TOKEN`), but should aim for consistency (camelCase preferred).
  - AI **can** implement the caching mechanism for the config object.
  - AI **must** ensure required secrets/variables cause a failure if missing in production. For development, warnings might be acceptable for non-critical variables, but core ones (like Slack tokens) should likely still cause failure.
  - AI **cannot** change the list of required secrets without user confirmation.
- **Questions/Uncertainties**:
  - _Blocking_: None.
  - _Non-blocking_: Exact error handling strategy for missing non-critical dev variables (Warn vs Error - Assume Error for required, Warn for optional). How to best structure the async export (Assuming cached `getConfig()` function is good).
- **Acceptable Tradeoffs**:
  - Initial version might not perform complex validation on secret _values_, only check for presence.
  - Error messages can be improved iteratively.
- **Status**: Not Started
- **Notes**:
  - The choice to exit the process on config load failure (`process.exit(1)`) is a common pattern for critical configuration, ensuring the app doesn't run in a broken state.
  - Fetching secrets concurrently with `Promise.all` is important for startup performance.
  - Parsing the SA key JSON immediately after fetching prevents potential issues later.
