#!/bin/bash
# Deploy script for Runbook Ingestion Cloud Function and Scheduler Job

# Variables (Replace these with your actual values)
PROJECT_ID="YOUR_GCP_PROJECT_ID"
REGION="YOUR_GCP_REGION"
FUNCTION_NAME="oncall-runbook-ingestion"
INGESTION_SA_EMAIL="oncall-runbook-ingester@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_JOB_NAME="trigger-runbook-ingestion-func"
SCHEDULE="0 3 * * *" # 3 AM Daily (UTC)
TIMEZONE="Etc/UTC"

# Deploy the Cloud Function
echo "Deploying Cloud Function..."
gcloud functions deploy "${FUNCTION_NAME}" \
  --gen2 \
  --runtime nodejs18 \
  --region "${REGION}" \
  --source . \
  --entry-point runbookIngestionHttp \
  --trigger-http \
  --no-allow-unauthenticated \
  --timeout=1800s \
  --memory=1024Mi \
  --run-service-account "${INGESTION_SA_EMAIL}" \
  --set-secrets=DRIVE_SERVICE_ACCOUNT_KEY=DRIVE_SERVICE_ACCOUNT_KEY:latest,VERTEX_AI_INDEX_ID=VERTEX_AI_INDEX_ID:latest,VERTEX_AI_INDEX_ENDPOINT_ID=VERTEX_AI_INDEX_ENDPOINT_ID:latest,VERTEX_AI_EMBEDDING_MODEL_NAME=VERTEX_AI_EMBEDDING_MODEL_NAME:latest,GOOGLE_DRIVE_FOLDER_ID=GOOGLE_DRIVE_FOLDER_ID:latest \
  --set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION}

# Get the function URL
FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} --region=${REGION} --format='value(serviceConfig.uri)')
echo "Function deployed successfully at URL: ${FUNCTION_URL}"

# Test the function (optional, requires authentication)
echo "Testing the function (requires authentication)..."
echo "To test manually, run:"
echo "curl -m 70 -X POST \"${FUNCTION_URL}\" \\"
echo "  -H \"Authorization: Bearer \$(gcloud auth print-identity-token)\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{}'"

# Create Cloud Scheduler Job
echo "Creating Cloud Scheduler Job..."
gcloud scheduler jobs create http "${SCHEDULER_JOB_NAME}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIMEZONE}" \
    --uri="${FUNCTION_URL}" \
    --http-method=POST \
    --oidc-service-account-email="${INGESTION_SA_EMAIL}" \
    --oidc-token-audience="${FUNCTION_URL}"

# Grant invoker role to the SA
echo "Granting function invoker role to the service account..."
gcloud functions add-iam-policy-binding ${FUNCTION_NAME} \
    --region=${REGION} \
    --member="serviceAccount:${INGESTION_SA_EMAIL}" \
    --role='roles/cloudfunctions.invoker'

echo "Deployment complete!"
echo "You can manually trigger the scheduler job with:"
echo "gcloud scheduler jobs run ${SCHEDULER_JOB_NAME}" 