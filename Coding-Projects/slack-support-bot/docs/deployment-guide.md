# Step-by-Step Deployment Guide for Slack Support Bot

This guide will walk you through the complete process of deploying the Slack Support Bot to Google Cloud Platform and connecting it to your Slack workspace.

## Prerequisites

1. Google Cloud Platform account with billing enabled
2. Slack workspace with admin privileges
3. Git installed on your local machine
4. Google Cloud CLI (`gcloud`) installed and configured
5. Docker installed locally (for testing)

## Step 1: Set Up Google Cloud Project

1. **Create a new GCP project**:
   ```bash
   gcloud projects create [PROJECT_ID] --name="Slack Support Bot"
   ```

2. **Set the project as your default**:
   ```bash
   gcloud config set project [PROJECT_ID]
   ```

3. **Enable required APIs**:
   ```bash
   gcloud services enable \
     cloudbuild.googleapis.com \
     artifactregistry.googleapis.com \
     run.googleapis.com \
     secretmanager.googleapis.com \
     aiplatform.googleapis.com \
     cloudscheduler.googleapis.com \
     cloudfunctions.googleapis.com \
     drive.googleapis.com
   ```

## Step 2: Create Service Accounts

1. **Create a service account for Cloud Run**:
   ```bash
   gcloud iam service-accounts create slack-bot-sa \
     --display-name="Slack Bot Service Account"
   ```

2. **Create a service account for document ingestion**:
   ```bash
   gcloud iam service-accounts create ingestion-sa \
     --display-name="Document Ingestion Service Account"
   ```

3. **Assign required roles to the Cloud Run service account**:
   ```bash
   gcloud projects add-iam-policy-binding [PROJECT_ID] \
     --member="serviceAccount:slack-bot-sa@[PROJECT_ID].iam.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"

   gcloud projects add-iam-policy-binding [PROJECT_ID] \
     --member="serviceAccount:slack-bot-sa@[PROJECT_ID].iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```

4. **Assign required roles to the ingestion service account**:
   ```bash
   gcloud projects add-iam-policy-binding [PROJECT_ID] \
     --member="serviceAccount:ingestion-sa@[PROJECT_ID].iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"

   gcloud projects add-iam-policy-binding [PROJECT_ID] \
     --member="serviceAccount:ingestion-sa@[PROJECT_ID].iam.gserviceaccount.com" \
     --role="roles/storage.admin"
   ```

5. **Create and download a key for the ingestion service account**:
   ```bash
   gcloud iam service-accounts keys create ingestion-sa-key.json \
     --iam-account=ingestion-sa@[PROJECT_ID].iam.gserviceaccount.com
   ```

## Step 3: Create Vertex AI Vector Search Index

1. **Create a Cloud Storage bucket for document embeddings**:
   ```bash
   gsutil mb -l [REGION] gs://[PROJECT_ID]-embeddings
   ```

2. **Create a Vertex AI Vector Search index**:
   ```bash
   # Note: This step can be completed in the Google Cloud Console
   # 1. Navigate to Vertex AI > Vector Search > Create Index
   # 2. Choose the following settings:
   #    - Name: support-docs-index
   #    - Region: [REGION]
   #    - Embedding dimension: 768 (for textembedding-gecko)
   #    - Embedding type: Floating point
   #    - Distance measure: Cosine
   #    - Shards: 1
   # 3. Create the index
   ```

3. **Create an endpoint for the index**:
   ```bash
   # In the Google Cloud Console:
   # 1. Navigate to the index you created
   # 2. Click "Create Endpoint"
   # 3. Choose a name and deploy the endpoint
   # 4. Note the Index ID and Endpoint ID for configuration
   ```

## Step 4: Create Google Drive Service Account

1. **Enable the Google Drive API** in your project

2. **Create a service account for Drive access**:
   ```bash
   gcloud iam service-accounts create drive-reader-sa \
     --display-name="Drive Reader Service Account"
   ```

3. **Create and download a key**:
   ```bash
   gcloud iam service-accounts keys create drive-sa-key.json \
     --iam-account=drive-reader-sa@[PROJECT_ID].iam.gserviceaccount.com
   ```

4. **Share your Google Drive folder** with the service account email address:
   - Go to your Google Drive folder containing documentation
   - Click "Share" and add the service account email address (drive-reader-sa@[PROJECT_ID].iam.gserviceaccount.com)
   - Grant "Viewer" permissions
   - Note the folder ID from the URL (everything after `folders/` in the URL)

## Step 5: Create a Slack App

1. **Create a new Slack app**:
   - Go to https://api.slack.com/apps
   - Click "Create New App"
   - Choose "From scratch"
   - Name your app (e.g., "Support Bot") and select your workspace
   - Click "Create App"

2. **Configure Bot Token Scopes**:
   - In the app settings, navigate to "OAuth & Permissions"
   - Under "Scopes" > "Bot Token Scopes", add the following:
     - `app_mentions:read`
     - `channels:history`
     - `channels:read`
     - `chat:write`
     - `users:read`
     - `reactions:write`
     - `im:history`
     - `groups:history`
     - `mpim:history`
   - Click "Save Changes"

3. **Install the app to your workspace**:
   - Scroll up to "OAuth Tokens for Your Workspace"
   - Click "Install to Workspace"
   - Authorize the app
   - Copy the "Bot User OAuth Token" (it starts with `xoxb-`)

4. **Enable Events API**:
   - Navigate to "Event Subscriptions"
   - Toggle "Enable Events" to On
   - Under "Subscribe to bot events", add `app_mention`
   - Note: You'll set the Request URL after deploying the app

5. **Enable Interactive Components**:
   - Navigate to "Interactivity & Shortcuts"
   - Toggle "Interactivity" to On
   - Note: You'll set the Request URL after deploying the app

6. **Get your Signing Secret**:
   - Navigate to "Basic Information"
   - Under "App Credentials", find "Signing Secret" and copy it

## Step 6: Store Secrets in Secret Manager

1. **Create secrets for all required values**:
   ```bash
   # Create secrets
   gcloud secrets create SLACK_BOT_TOKEN --replication-policy="automatic"
   gcloud secrets create SLACK_SIGNING_SECRET --replication-policy="automatic"
   gcloud secrets create TICKET_CHANNEL_ID --replication-policy="automatic"
   gcloud secrets create VERTEX_AI_INDEX_ID --replication-policy="automatic"
   gcloud secrets create VERTEX_AI_INDEX_ENDPOINT_ID --replication-policy="automatic"
   gcloud secrets create VERTEX_AI_EMBEDDING_MODEL_NAME --replication-policy="automatic"
   gcloud secrets create VERTEX_AI_LLM_MODEL_NAME --replication-policy="automatic"
   gcloud secrets create GOOGLE_DRIVE_FOLDER_ID --replication-policy="automatic"
   gcloud secrets create DRIVE_SERVICE_ACCOUNT_KEY --replication-policy="automatic"
   gcloud secrets create PERSONALITY_USER_ID --replication-policy="automatic"
   gcloud secrets create TICKETING_CHANNEL_ID --replication-policy="automatic"
   ```

2. **Set secret values**:
   ```bash
   # Bot token
   echo -n "xoxb-your-bot-token" | gcloud secrets versions add SLACK_BOT_TOKEN --data-file=-
   
   # Signing secret
   echo -n "your-signing-secret" | gcloud secrets versions add SLACK_SIGNING_SECRET --data-file=-
   
   # Channel IDs
   echo -n "C012345ABCDE" | gcloud secrets versions add TICKET_CHANNEL_ID --data-file=-
   echo -n "C012345ABCDE" | gcloud secrets versions add TICKETING_CHANNEL_ID --data-file=-
   
   # Vertex AI configuration
   echo -n "1234567890" | gcloud secrets versions add VERTEX_AI_INDEX_ID --data-file=-
   echo -n "9876543210" | gcloud secrets versions add VERTEX_AI_INDEX_ENDPOINT_ID --data-file=-
   echo -n "textembedding-gecko@latest" | gcloud secrets versions add VERTEX_AI_EMBEDDING_MODEL_NAME --data-file=-
   echo -n "gemini-1.0-pro" | gcloud secrets versions add VERTEX_AI_LLM_MODEL_NAME --data-file=-
   
   # Drive configuration
   echo -n "your-drive-folder-id" | gcloud secrets versions add GOOGLE_DRIVE_FOLDER_ID --data-file=-
   
   # Personality user ID
   echo -n "U012345ABCDE" | gcloud secrets versions add PERSONALITY_USER_ID --data-file=-
   
   # Drive service account key (from file)
   gcloud secrets versions add DRIVE_SERVICE_ACCOUNT_KEY --data-file=drive-sa-key.json
   ```

## Step 7: Deploy the Main Bot to Cloud Run

1. **Update the deploy.sh script** with your project-specific values:
   - Open `deploy.sh`
   - Replace the placeholders with your values:
     - `PROJECT_ID`: Your Google Cloud Project ID
     - `REGION`: Your preferred GCP region
     - `SERVICE_NAME`: Name for your Cloud Run service
     - `IMAGE_NAME`: Name for your Docker image
     - `AR_REPO_NAME`: Your Artifact Registry repository name
     - `RUN_SA_EMAIL`: Service account email for Cloud Run

2. **Run the deployment script**:
   ```bash
   ./deploy.sh
   ```

3. **Note the deployed URL**:
   - The script will output the URL of your deployed service
   - Note this URL for configuring your Slack app

## Step 8: Update Slack App with Deployed URL

1. **Set the Request URL for Events**:
   - Go to your Slack App's configuration page
   - Navigate to "Event Subscriptions"
   - Set the Request URL to: `https://your-service-url/slack/events`
   - Verify the URL works (Slack will send a challenge)

2. **Set the Request URL for Interactive Components**:
   - Navigate to "Interactivity & Shortcuts"
   - Set the Request URL to: `https://your-service-url/slack/events`

## Step 9: Deploy the Ingestion Function

1. **Update the ingestion deploy script**:
   - Navigate to the ingestion function directory: `cd functions/ingestion`
   - Edit `deploy.sh` to set your GCP-specific variables:
     - `PROJECT_ID`: Your Google Cloud Project ID
     - `REGION`: Your preferred GCP region
     - `INGESTION_SA_EMAIL`: Service account email for the Cloud Function

2. **Run the deployment script**:
   ```bash
   ./deploy.sh
   ```

3. **Test the ingestion process**:
   ```bash
   gcloud scheduler jobs run trigger-runbook-ingestion-func
   ```

## Step 10: Test and Verify

1. **Verify bot functionality**:
   - Go to a Slack channel where the bot is present
   - Mention the bot: `@SupportBot Hello!`
   - The bot should respond using the RAG pipeline

2. **Test the incident logging feature**:
   - Click the "Log Incident" button in a bot response
   - Verify a ticket is created in the designated ticketing channel

3. **Check ingestion logs**:
   - In the Google Cloud Console, navigate to Cloud Functions
   - Select your ingestion function
   - Click "Logs" to view the latest ingestion logs

## Troubleshooting

### Bot Not Responding
- Check Cloud Run logs for errors
- Verify the bot is in the channel you're messaging
- Confirm the Event Subscriptions are properly configured

### RAG Pipeline Issues
- Check that the Vertex AI index is properly set up
- Verify document ingestion has run successfully
- Check permissions for the service accounts

### Ingestion Function Failures
- Check Cloud Function logs for detailed error messages
- Verify the Drive folder is shared with the service account
- Check that all required secrets are properly set up

## Maintenance

### Updating the Bot
1. Make changes to the codebase
2. Run the deployment script again to rebuild and deploy

### Adding New Documentation
1. Add new documents to the shared Google Drive folder
2. Run the ingestion function manually or wait for the scheduled run

### Monitoring
- Set up Cloud Monitoring alerts for the Cloud Run service
- Regularly check Cloud Function logs for ingestion issues
- Monitor Vertex AI resource usage and quotas