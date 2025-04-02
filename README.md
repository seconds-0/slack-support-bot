# Slack On-Call Support Bot

A Slack bot that uses RAG (Retrieval Augmented Generation) to provide support assistance and help log incidents.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up environment variables by copying `.env.example` to `.env` and filling in the required values:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run the application:
   ```bash
   node src/app.js
   ```

## Docker Build and Deployment

### Local Docker Testing

1. Build the Docker image:

   ```bash
   docker build -t oncall-bot-local .
   ```

2. Run the container locally:
   ```bash
   docker run -p 8080:8080 -e GCP_PROJECT_ID=dummy oncall-bot-local
   ```

### Cloud Run Deployment

1. Edit the `deploy.sh` script to set your GCP-specific variables:

   - `PROJECT_ID`: Your Google Cloud Project ID
   - `REGION`: Your preferred GCP region
   - `SERVICE_NAME`: Name for your Cloud Run service
   - `IMAGE_NAME`: Name for your Docker image
   - `AR_REPO_NAME`: Your Artifact Registry repository name
   - `RUN_SA_EMAIL`: Service account email for Cloud Run

2. Run the deployment script:

   ```bash
   ./deploy.sh
   ```

3. After deployment, update your Slack App configuration:
   - Go to your Slack App's configuration page
   - In "Event Subscriptions", set the Request URL to: `https://your-service-url/slack/events`
   - In "Interactivity & Shortcuts", set the Request URL to: `https://your-service-url/slack/events`

## Runbook Ingestion Function

The project includes a separate Cloud Function for ingesting documents from Google Drive into the Vertex AI Vector Search index.

### Deploying the Ingestion Function

1. Navigate to the ingestion function directory:

   ```bash
   cd functions/ingestion
   ```

2. Edit `deploy.sh` to set your GCP-specific variables:

   - `PROJECT_ID`: Your Google Cloud Project ID
   - `REGION`: Your preferred GCP region
   - `INGESTION_SA_EMAIL`: Service account email for the Cloud Function

3. Run the deployment script:

   ```bash
   ./deploy.sh
   ```

4. This script will:

   - Deploy the Cloud Function
   - Create a Cloud Scheduler job to run the function daily at 3 AM UTC
   - Configure the necessary IAM permissions

5. To manually trigger the ingestion process:
   ```bash
   gcloud scheduler jobs run trigger-runbook-ingestion-func
   ```

## Required Secret Configuration

The following secrets should be configured in Google Secret Manager for Cloud Run:

- `SLACK_BOT_TOKEN`: Your Slack bot token
- `SLACK_SIGNING_SECRET`: Your Slack signing secret
- `TICKET_CHANNEL_ID`: ID of the channel where tickets will be logged
- `GCP_PROJECT_ID`: Your Google Cloud Project ID
- `GCP_REGION`: Your GCP region
- `VERTEX_AI_INDEX_ID`: ID of your Vertex AI vector index
- `VERTEX_AI_INDEX_ENDPOINT_ID`: ID of your Vertex AI index endpoint
- `DRIVE_SERVICE_ACCOUNT_KEY`: JSON key for the Google Drive service account
- `PERSONALITY_USER_ID`: ID of the user whose messages are used for personality examples
- `VERTEX_AI_EMBEDDING_MODEL_NAME`: Name of the embedding model to use
- `GOOGLE_DRIVE_FOLDER_ID`: ID of the Google Drive folder containing documents to index
