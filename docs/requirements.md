# REQUIREMENTS: Slack On-Call Support Bot (V1)

## 1. Qualitative Goals

- **Primary Goal:** Create an LLM-powered Slack bot (`@oncall`) to provide initial support for developers during on-call incidents.
- **Core Functionality:**
  - Listen for mentions (`@oncall`) in designated Slack channels.
  - Read recent message history (including threads) for context.
  - Retrieve relevant information from company runbooks stored in Google Drive using Retrieval-Augmented Generation (RAG).
  - Leverage Google Vertex AI (Gemini for LLM, Embeddings, Vector Search) for the RAG pipeline.
  - Synthesize answers based on Slack history and runbook context.
  - Respond in Slack with the synthesized answer, mimicking a specific user's writing style (personality injection).
  - Provide a button to "Log Incident".
  - "Log Incident" action posts a formatted message summarizing the context to a designated Slack channel (acting as a Slack List).
- **Operational Goals:**
  - Host the bot service reliably on Google Cloud Run.
  - Automate the ingestion of runbook updates from Google Drive into Vertex AI Vector Search.
  - Minimize complexity and prioritize speed for V1 spin-up where possible, while meeting core functionality requirements.
  - Securely manage all credentials and API keys using Google Secret Manager.

## 2. Summary of Work

This project involves building a Node.js application that integrates with Slack, Google Drive, and Google Vertex AI. It consists of two main parts:

1.  **Real-time Bot Service:** A Cloud Run service handling Slack events (`app_mention`, button interactions). It retrieves context, queries the RAG pipeline (Vector Search + Gemini), applies personality, and responds to users or logs incidents.
2.  **Runbook Ingestion Pipeline:** A separate process (likely a Cloud Function or Cloud Run Job triggered periodically) that scans a specified Google Drive folder, extracts text from runbooks, generates embeddings using Vertex AI, and upserts them into a Vertex AI Vector Search index.

## 3. Application Structure

### 3.1. Proposed File Structure

```plaintext
.
├── Documentation/
│   ├── REQUIREMENTS.md    # This file
│   ├── STYLE_GUIDE.md     # AI coding standards
│   ├── CONFIGURATION_GUIDE.md # Human GCP setup steps
│   └── Plans/             # Individual work plans go here
│       └── PLAN-XX-Description.md
├── src/
│   ├── app.js             # Main Slack Bolt application setup and event listeners
│   ├── slack/             # Slack specific logic (event handlers, interaction handlers)
│   │   ├── events.js
│   │   └── interactions.js
│   ├── rag/               # RAG pipeline logic
│   │   ├── retriever.js     # Interacting with Vertex AI Vector Search
│   │   └── generator.js     # Interacting with Gemini, prompt formatting, personality
│   ├── utils/             # Shared utility functions (e.g., text processing, error handling)
│   └── config/            # Loading configuration and secrets
│       └── index.js
├── scripts/
│   └── ingest.js          # Runbook ingestion pipeline script
├── .env.example           # Example environment variables for local dev
├── .gitignore
├── Dockerfile             # For Cloud Run deployment
├── package.json
└── package-lock.json
Use code with caution.
Markdown
3.2. High-Level Dataflow
Real-time Interaction:

User @mentions Bot -> Slack Event -> Cloud Run (app.js -> src/slack/events.js)

Fetch Slack History (Slack API)

Extract Query -> src/rag/retriever.js

Get Query Embedding (Vertex AI Embeddings) -> Query Vertex AI Vector Search

Receive Relevant Chunks -> src/rag/generator.js

Format Prompt (Query + History + Chunks + Personality Rules) -> Call Vertex AI Gemini

Receive LLM Response -> src/slack/events.js -> Post to Slack (Slack API)

User clicks "Log Incident" -> Slack Interaction -> Cloud Run (app.js -> src/slack/interactions.js)

Format Ticket -> Post to designated Slack Channel (Slack API)

Runbook Ingestion (Periodic):

Scheduler Trigger -> Ingestion Service (scripts/ingest.js)

Authenticate (Drive SA) -> List/Download Files (Drive API)

Parse Text -> Chunk Text

Get Chunk Embeddings (Vertex AI Embeddings)

Upsert Chunks + Embeddings (Vertex AI Vector Search API)

4. Order of Action Plan Execution
The following Work Plans should be executed sequentially:

PLAN-01-ProjectSetup.md: Initialize Node.js project, basic dependencies, directory structure.

PLAN-02-SecretsConfig.md: Implement secret loading from Google Secret Manager and .env for local dev.

PLAN-03-SlackAppBase.md: Basic Slack Bolt app setup, verify connection, simple @mention listener.

PLAN-04-DriveIngestion.md: Implement the runbook ingestion script (scripts/ingest.js) - Drive access, parsing, chunking, embedding, Vector Search upsert.

PLAN-05-VectorSearchRetriever.md: Implement the RAG retriever logic (src/rag/retriever.js) to query Vertex AI Vector Search.

PLAN-06-GeminiGenerator.md: Implement the RAG generator logic (src/rag/generator.js) including basic prompt formatting and calling Gemini (without history/personality yet).

PLAN-07-RAGIntegration.md: Integrate the retriever and generator into the main Slack event handler. Test basic RAG response.

PLAN-08-ContextHistory.md: Enhance the Slack event handler and RAG prompt to include recent Slack message history.

PLAN-09-PersonalityLayer.md: Implement the personality injection by modifying the prompt with style rules and examples.

PLAN-10-TicketingAction.md: Implement the "Log Incident" button interaction handler (src/slack/interactions.js) to post messages to the designated channel.

PLAN-11-DockerCloudRun.md: Create Dockerfile and scripts/config for deploying the bot service to Cloud Run.

PLAN-12-IngestionDeployment.md: Plan deployment strategy for the ingestion script (e.g., Cloud Function + Scheduler, Cloud Run Job).

PLAN-13-TestingRefinement.md: End-to-end testing, prompt refinement, error handling improvements.
```
