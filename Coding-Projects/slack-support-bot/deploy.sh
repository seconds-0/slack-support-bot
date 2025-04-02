#!/bin/bash
# Deploy script for Slack On-Call Support Bot

# Variables (Replace these with your actual values)
PROJECT_ID="YOUR_GCP_PROJECT_ID"
REGION="YOUR_GCP_REGION"
SERVICE_NAME="oncall-bot-service"
IMAGE_NAME="oncall-bot-image"
AR_REPO_NAME="oncall-bot-repo"
RUN_SA_EMAIL="oncall-bot-runner@${PROJECT_ID}.iam.gserviceaccount.com"

# Build Image using Cloud Build and push to Artifact Registry
echo "Building and pushing Docker image to Artifact Registry..."
gcloud builds submit --tag "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO_NAME}/${IMAGE_NAME}:latest" .

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO_NAME}/${IMAGE_NAME}:latest" \
    --platform managed \
    --region "${REGION}" \
    --service-account="${RUN_SA_EMAIL}" \
    --allow-unauthenticated \
    --port=8080 \
    --set-secrets=SLACK_BOT_TOKEN=SLACK_BOT_TOKEN:latest,SLACK_SIGNING_SECRET=SLACK_SIGNING_SECRET:latest,TICKET_CHANNEL_ID=TICKET_CHANNEL_ID:latest,GCP_PROJECT_ID=GCP_PROJECT_ID:latest,GCP_REGION=GCP_REGION:latest,VERTEX_AI_INDEX_ID=VERTEX_AI_INDEX_ID:latest,VERTEX_AI_INDEX_ENDPOINT_ID=VERTEX_AI_INDEX_ENDPOINT_ID:latest,DRIVE_SERVICE_ACCOUNT_KEY=DRIVE_SERVICE_ACCOUNT_KEY:latest,PERSONALITY_USER_ID=PERSONALITY_USER_ID:latest \
    --set-env-vars=NODE_ENV=production \
    --cpu=1 \
    --memory=1Gi \
    --min-instances=0 \
    --max-instances=5 \
    --timeout=300s

# Get the service URL
echo "Deployment complete. Getting service URL..."
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)')
echo "Service URL: ${SERVICE_URL}"
echo ""
echo "IMPORTANT: If using HTTP mode for Slack, update the following URLs in your Slack App configuration:"
echo "- Event Subscriptions Request URL: ${SERVICE_URL}/slack/events"
echo "- Interactivity & Shortcuts Request URL: ${SERVICE_URL}/slack/events" 