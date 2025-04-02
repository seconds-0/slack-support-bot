# Work Plan: Dockerize Application for Cloud Run Deployment

- **Task ID**: `PLAN-11-DockerCloudRun`
- **Problem Statement**: Create a `Dockerfile` to containerize the Node.js application, including all necessary dependencies and runtime configurations. Define appropriate build steps and runtime commands. Ensure the container is configured correctly to run on Google Cloud Run, respecting its conventions (port, environment variables).
- **Components Involved**:
  - `Dockerfile` (New file)
  - `.dockerignore` (New file - optional but recommended)
  - `package.json`, `package-lock.json` (Used during build)
  - `src/` directory and contents (Copied into image)
  - `scripts/` directory and contents (Copied into image, if needed at runtime - likely not)
  - `src/config/style-examples.json` (Copied into image)
  - Google Cloud Build (Used by `gcloud run deploy` or `gcloud builds submit`)
  - Google Artifact Registry (To store the built image)
  - Google Cloud Run (Target deployment platform)
- **Dependencies**:
  - All previous implementation plans (`PLAN-01` to `PLAN-10`) completed and tested locally.
  - Docker installed locally for building/testing the image (optional but highly recommended).
  - Google Cloud SDK (`gcloud`) installed for deployment commands.
  - Artifact Registry repository created (as per `CONFIGURATION_GUIDE.md`).
  - Cloud Build API enabled.
- **Implementation Checklist**:

  - \[ ] **Create `.dockerignore` file:** Prevent unnecessary files from being copied into the build context, speeding up builds and reducing image size.
    ```gitignore
    .git
    .gitignore
    .env
    *.env.*
    node_modules
    npm-debug.log*
    yarn-debug.log*
    yarn-error.log*
    lerna-debug.log*
    README.md
    Documentation/
    # Keep scripts/fetch-style-examples.js out unless needed at runtime
    scripts/fetch-style-examples.js
    *.local
    .DS_Store
    Thumbs.db
    .vscode/
    .idea/
    # Add any other local config or temporary files
    ```
    _(Note: Excluding `Documentation` and the fetch script)_
  - \[ ] **Create `Dockerfile`:** Define the build stages and runtime environment.

    ```dockerfile
    # ---- Base Stage ----
    # Use an official Node.js LTS version matching development environment (e.g., 18)
    # Use slim variant for smaller image size
    FROM node:18-slim AS base
    WORKDIR /usr/src/app

    # ---- Dependencies Stage ----
    FROM base AS dependencies
    # Copy only package files
    COPY package*.json ./
    # Install production dependencies only
    RUN npm ci --only=production --ignore-scripts
    # If you have build scripts needed for production (e.g., TypeScript compile), run them here

    # ---- Runtime Stage ----
    FROM base AS runtime
    WORKDIR /usr/src/app
    # Copy installed production dependencies from the dependencies stage
    COPY --from=dependencies /usr/src/app/node_modules ./node_modules
    # Copy application code (src, config files, potentially scripts if needed at runtime)
    # Ensure style-examples.json is copied
    COPY src ./src
    COPY scripts ./scripts # Copy scripts folder if ingest.js needs to be run from the same image later, otherwise omit
    # Ensure style-examples.json is copied from src/config/
    # COPY src/config/style-examples.json ./src/config/style-examples.json # Already copied by COPY src ./src

    # Set environment variables
    ENV NODE_ENV=production
    ENV PORT=8080 # Google Cloud Run expects port 8080 by default

    # Expose the port the app runs on
    EXPOSE 8080

    # Define the command to run the application
    # Assumes src/app.js is the entry point
    CMD [ "node", "src/app.js" ]

    ```

    _(Notes: Uses multi-stage build for smaller final image. Uses `npm ci` for faster, reliable installs based on `package-lock.json`. Installs production deps only. Sets `NODE_ENV` and `PORT`.)_

  - \[ ] **Local Docker Build Test (Optional but Recommended):**
    - \[ ] Build the image locally: `docker build -t oncall-bot-local .`
    - \[ ] Run the container locally, mapping the port and potentially passing dummy env vars if needed (though production mode relies on Secret Manager): `docker run -p 8080:8080 -e GCP_PROJECT_ID=dummy oncall-bot-local` (This will likely fail on secret loading but tests if the container starts).
    - \[ ] Verify the container starts and logs indicate it's trying to run in production mode and listening on port 8080. Check for obvious errors like missing files.
  - \[ ] **Prepare `gcloud` Deployment Command:** Draft the command needed to build using Cloud Build and deploy to Cloud Run. Store this command perhaps in a `README` or a deployment script.

    ```bash
    # Example gcloud deployment command (replace placeholders)

    # Variables (Set these in your shell or script)
    PROJECT_ID="YOUR_GCP_PROJECT_ID"
    REGION="YOUR_GCP_REGION"
    SERVICE_NAME="oncall-bot-service" # Choose a name for the Cloud Run service
    IMAGE_NAME="oncall-bot-image" # Choose a name for the Docker image
    AR_REPO_NAME="oncall-bot-repo" # Your Artifact Registry repo name
    RUN_SA_EMAIL="oncall-bot-runner@${PROJECT_ID}.iam.gserviceaccount.com" # Your Cloud Run SA

    # Build Image using Cloud Build and push to Artifact Registry
    gcloud builds submit --tag "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO_NAME}/${IMAGE_NAME}:latest" .

    # Deploy to Cloud Run
    gcloud run deploy "${SERVICE_NAME}" \
        --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO_NAME}/${IMAGE_NAME}:latest" \
        --platform managed \
        --region "${REGION}" \
        --service-account="${RUN_SA_EMAIL}" \
        --allow-unauthenticated \ # Required for Slack HTTP Event Subscriptions/Interactions
        # --no-allow-unauthenticated \ # Use if using Socket Mode only
        --port=8080 \
        --set-secrets=SLACK_BOT_TOKEN=SLACK_BOT_TOKEN:latest,SLACK_SIGNING_SECRET=SLACK_SIGNING_SECRET:latest,TICKET_CHANNEL_ID=TICKET_CHANNEL_ID:latest,GCP_PROJECT_ID=GCP_PROJECT_ID:latest,GCP_REGION=GCP_REGION:latest,VERTEX_AI_INDEX_ID=VERTEX_AI_INDEX_ID:latest,VERTEX_AI_INDEX_ENDPOINT_ID=VERTEX_AI_INDEX_ENDPOINT_ID:latest,DRIVE_SERVICE_ACCOUNT_KEY=DRIVE_SERVICE_ACCOUNT_KEY:latest,PERSONALITY_USER_ID=PERSONALITY_USER_ID:latest \ # Map ALL required secrets
        # If using Socket Mode, map SLACK_APP_TOKEN instead of SLACK_SIGNING_SECRET
        # --set-secrets=SLACK_APP_TOKEN=SLACK_APP_TOKEN:latest \
        --set-env-vars=NODE_ENV=production \ # Explicitly set NODE_ENV
        # Add other non-secret env vars if needed (e.g., model names if not hardcoded)
        # --set-env-vars=VERTEX_AI_LLM_MODEL_NAME=gemini-1.0-pro \
        # Resource allocation (adjust based on testing)
        --cpu=1 \
        --memory=1Gi \ # Start with 1Gi, monitor RAG/history usage
        --min-instances=0 \ # Scale to zero for cost saving
        --max-instances=5 \ # Adjust max concurrency/scaling
        --timeout=300s # Increase default timeout if RAG pipeline can be slow

    # After deployment, get the service URL:
    # gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)'
    ```

  - \[ ] **Update Slack App Configuration:** _After_ the first successful deployment:
    - \[ ] Get the deployed Cloud Run service URL using the `gcloud` command above or from the GCP Console.
    - \[ ] **If using HTTP Mode:**
      - \[ ] Go to your Slack App config -> "Event Subscriptions". Paste the URL + `/slack/events` into the "Request URL" field. Save Changes (it should verify successfully).
      - \[ ] Go to "Interactivity & Shortcuts". Paste the _same_ URL + `/slack/events` into the "Request URL" field. Save Changes.
    - \[ ] **If using Socket Mode:** No URL configuration needed in Slack. Ensure the `--no-allow-unauthenticated` flag is used in `gcloud run deploy` and `SLACK_APP_TOKEN` secret is mapped.

- **Verification Steps**:
  1.  **(Local)** Verify `docker build` completes successfully.
  2.  **(Local)** Verify `docker run` starts the container without immediate crashes related to file structure or basic setup.
  3.  Execute the `gcloud builds submit` command. Verify it completes successfully in Cloud Build logs.
  4.  Verify the new image appears in your Artifact Registry repository.
  5.  Execute the `gcloud run deploy` command. Monitor the deployment progress in the console or Cloud Run UI. Verify it completes successfully.
  6.  Check Cloud Run service logs immediately after deployment. Verify the "Bolt app is running!" message appears and there are no startup errors (especially related to secret loading in production mode).
  7.  Update Slack App Request URLs (if using HTTP mode).
  8.  **End-to-End Test:** Perform the key user flows tested in previous plans (mention bot, get RAG answer, click log incident) against the _deployed Cloud Run service_. Verify all functionalities work as expected in the production environment.
  9.  Check Cloud Run metrics (request count, latency, CPU/Memory usage) after some test interactions.
- **Decision Authority**:
  - AI **can** choose the specific Node.js base image version (sticking to LTS like 18 or 20 is recommended).
  - AI **must** use multi-stage builds to optimize image size.
  - AI **must** install production dependencies only using `npm ci --only=production`.
  - AI **must** configure the container to listen on port 8080 and set `NODE_ENV=production`.
  - AI **must** correctly configure secret mapping and necessary environment variables in the `gcloud run deploy` command example.
- **Questions/Uncertainties**:
  - _Blocking_: None, assuming GCP resources (Artifact Registry, Cloud Run SA permissions) are correctly set up.
  - _Non-blocking_: Optimal CPU/Memory/Concurrency settings for Cloud Run (start with reasonable defaults, requires monitoring and tuning post-deployment). Need for specific `--ignore-scripts` flags during `npm ci`. Exact list of files to include/exclude in `.dockerignore`. Decision on whether `scripts/ingest.js` should be included in the image (likely not needed for the bot runtime, but might be if deploying ingestion as a separate Cloud Run Job using the same base image). _(Assumption: Exclude `ingest.js` from runtime image for now)_.
- **Acceptable Tradeoffs**:
  - Initial Cloud Run resource settings are estimates and may need adjustment.
  - Local Docker testing might not perfectly replicate the Cloud Run environment, especially regarding IAM permissions and secret access.
- **Status**: Completed
- **Notes**:
  - Using `npm ci` is crucial for reproducible builds in CI/CD and Docker.
  - Multi-stage builds significantly reduce the final image size by discarding build-time dependencies.
  - Mapping _all_ required secrets correctly in the `gcloud run deploy` command is critical for the application to function in Cloud Run. Double-check the list against `getConfig`.
  - Remember to configure the Slack Request URLs _after_ the first successful deployment if using HTTP mode.
  - Created .dockerignore, Dockerfile, deploy.sh script, and updated README.md with deployment instructions.
