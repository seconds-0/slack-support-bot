# Cloud Run Optimization Guide

Based on end-to-end testing and monitoring of the Slack On-Call Support Bot, this document provides recommendations for optimizing Cloud Run resources and configurations.

## Resource Allocation Recommendations

### Bot Service

| Resource      | Recommended Value | Explanation                                                                  |
| ------------- | ----------------- | ---------------------------------------------------------------------------- |
| CPU           | 1                 | Sufficient for most queries; LLM processing is offloaded to Vertex AI        |
| Memory        | 1Gi               | Adequate for handling multiple concurrent sessions with history processing   |
| Concurrency   | 50                | Balance between responsiveness and cost efficiency                           |
| Min Instances | 1                 | Keeps one warm instance to prevent cold starts during critical support needs |
| Max Instances | 5                 | Handles peak loads while preventing runaway costs                            |
| Timeout       | 300s              | Long enough for complex RAG pipelines while preventing stuck requests        |

### Ingestion Function/Job

| Resource      | Recommended Value | Explanation                                                     |
| ------------- | ----------------- | --------------------------------------------------------------- |
| CPU           | 1                 | Document processing is more CPU-intensive than the main service |
| Memory        | 2Gi               | Larger memory for batch processing of documents and embeddings  |
| Timeout       | 1800s (30 mins)   | Allow sufficient time for processing large document sets        |
| Concurrency   | 1                 | Only needs to process one run at a time                         |
| Min Instances | 0                 | Can scale to zero when not in use (typically runs on schedule)  |
| Max Instances | 1                 | Only one instance needed even during processing                 |

## Optimized Deployment Commands

### Bot Service

```bash
gcloud run deploy "oncall-bot-service" \
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
    --min-instances=1 \
    --max-instances=5 \
    --concurrency=50 \
    --timeout=300s
```

### Ingestion Function

```bash
gcloud functions deploy "oncall-runbook-ingestion" \
    --gen2 \
    --runtime nodejs18 \
    --region "${REGION}" \
    --source ./functions/ingestion \
    --entry-point runbookIngestionHttp \
    --trigger-http \
    --no-allow-unauthenticated \
    --timeout=1800s \
    --memory=2048Mi \
    --run-service-account "${INGESTION_SA_EMAIL}" \
    --set-secrets=DRIVE_SERVICE_ACCOUNT_KEY=DRIVE_SERVICE_ACCOUNT_KEY:latest,VERTEX_AI_INDEX_ID=VERTEX_AI_INDEX_ID:latest,VERTEX_AI_INDEX_ENDPOINT_ID=VERTEX_AI_INDEX_ENDPOINT_ID:latest,VERTEX_AI_EMBEDDING_MODEL_NAME=VERTEX_AI_EMBEDDING_MODEL_NAME:latest,GOOGLE_DRIVE_FOLDER_ID=GOOGLE_DRIVE_FOLDER_ID:latest \
    --set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION}
```

## Performance Monitoring Recommendations

After deployment, monitor the following metrics to validate and further refine resource allocations:

### Bot Service Metrics to Monitor

1. **CPU Utilization**: Should average <50% in normal operation
2. **Memory Usage**: Should remain <80% of allocated memory
3. **Request Latency**: P95 should be <5s (excluding external API calls)
4. **Instance Count**: Should remain at min instances except during peak periods
5. **Concurrent Requests**: Watch for patterns to optimize concurrency setting

### Ingestion Function Metrics to Monitor

1. **CPU Utilization**: May spike to near 100% during intensive document processing
2. **Memory Usage**: Should remain <90% even during large batch processing
3. **Execution Time**: Ensure runs complete well within the timeout limit
4. **Error Rate**: Should be <1% of invocations

## Cost Optimization Tips

1. **Adjust Min Instances**: During off-hours or weekends, consider scaling the bot service to 0 min instances if immediate response time isn't critical
2. **Schedule-Based Autoscaling**: If your load follows a predictable pattern, consider Cloud Scheduler to update min instances on a schedule
3. **Monitor Cold Starts**: If cold starts cause issues, increase min instances or consider using CPU always allocated

## Troubleshooting Common Issues

1. **Memory Exhaustion**: If you see OOM errors, consider increasing memory allocation
2. **Timeouts**: If requests are timing out, check external API dependencies or increase the timeout limit
3. **Instance Churn**: If instances are scaling up and down rapidly, consider adjusting concurrency and min instances
4. **High Latency**: Look for slow dependencies, network issues, or increase CPU allocation

## Next Steps

After implementing these optimizations, continue to monitor performance metrics over a 2-week period to identify further refinement opportunities. Review Cloud Run billing reports to ensure costs align with expectations.
