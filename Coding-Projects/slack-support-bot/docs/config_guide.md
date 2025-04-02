# Configuration Guide: GCP & Slack Setup (for Human User)

This guide provides step-by-step instructions for configuring the necessary Google Cloud Platform (GCP) services and Slack application settings required _before_ the AI can fully deploy and run the On-Call Support Bot.

**Prerequisites:**

- A Google Cloud Platform Account with Billing Enabled.
- Permissions to create projects, enable APIs, manage IAM, Vertex AI, Secret Manager, and Cloud Run within your GCP organization/account.
- A Slack Workspace where you have permissions to create and manage applications.

**Estimated Time:** 1-2 hours (excluding index deployment wait time).

**IMPORTANT:** Note down all generated IDs, names, and service account emails as you proceed. You will need to provide these to the AI developer (by adding them to Google Secret Manager).

## 1. GCP Project Setup

1.  **Select or Create Project:**
    - Go to the GCP Console: [https://console.cloud.google.com/](https://console.cloud.google.com/)
    - Select an existing project from the top dropdown or click "Create Project".
    - If creating, give it a descriptive name (e.g., `oncall-bot-project`) and select your billing account.
    - **Note:** Record your **Project ID**.
2.  **Ensure Billing is Enabled:** Navigate to "Billing" in the left-hand menu and confirm the project is linked to an active billing account.

## 2. Enable Necessary GCP APIs

1.  Navigate to "APIs & Services" -> "Library".
2.  Search for and **Enable** each of the following APIs for your project:
    - `Cloud Run Admin API`
    - `Secret Manager API`
    - `Vertex AI API`
    - `Google Drive API`
    - `Cloud Logging API`
    - `Cloud Monitoring API`
    - `IAM Service Account Credentials API`
    - `Cloud Storage API`
    - `Artifact Registry API`
    - `Cloud Build API` (Usually enabled by default, needed for Cloud Run builds)
    - `Cloud Scheduler API` (If using Scheduler for ingestion)
    - `Cloud Functions API` (If using Functions for ingestion)

## 3. Configure IAM Service Accounts

You need two distinct service accounts: one for the Cloud Run service (less privileged) and one for the ingestion script (more privileged for Drive and Vector Search updates).

1.  **Create Cloud Run Service Account:**
    - Navigate to "IAM & Admin" -> "Service Accounts".
    - Click "+ CREATE SERVICE ACCOUNT".
    - **Name:** `oncall-bot-runner` (or similar).
    - **Service account ID:** Note the auto-generated email (e.g., `oncall-bot-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com`).
    - Click "CREATE AND CONTINUE".
    - **Grant Roles:** Add the following roles:
      - `Secret Manager Secret Accessor`
      - `Vertex AI User`
      - `Logs Writer`
      - `Monitoring Metric Writer`
      - (Optional, good practice) `Service Account User` (allows this SA to act as itself)
    - Click "CONTINUE", then "DONE".
    - **Note:** Record the **Cloud Run SA Email**.
2.  **Create Ingestion Service Account:**
    - Click "+ CREATE SERVICE ACCOUNT" again.
    - **Name:** `oncall-runbook-ingester` (or similar).
    - **Service account ID:** Note the auto-generated email (e.g., `oncall-runbook-ingester@YOUR_PROJECT_ID.iam.gserviceaccount.com`).
    - Click "CREATE AND CONTINUE".
    - **Grant Roles:** Add the following roles:
      - `Secret Manager Secret Accessor` (To read its own key if needed, or other configs)
      - `Vertex AI User`
      - `Google Drive Activity API Viewer` (May be needed for change detection - check necessity)
      - `Cloud Storage Object Admin` (If using GCS for temp files during parsing)
      - _(Optional but common)_ `Logs Writer`
    - Click "CONTINUE", then "DONE".
    - **Grant Drive Access Separately:** You need to explicitly share your Google Drive runbook folder with this SA's email address (see Step 5).
    - **Create & Download Key:**
      - Find the `oncall-runbook-ingester` SA in the list.
      - Click on its email address.
      - Go to the "KEYS" tab.
      - Click "ADD KEY" -> "Create new key".
      - Choose **JSON** format.
      - Click "CREATE". A JSON key file will download. **KEEP THIS FILE SECURE.** You will add its contents to Secret Manager later.
    - **Note:** Record the **Ingestion SA Email**.

## 4. Configure Google Secret Manager

Store all sensitive information here. The AI will configure the application to read from these secrets.

1.  Navigate to "Security" -> "Secret Manager".
2.  Click "+ CREATE SECRET" for each item below:
    - **Name:** `SLACK_BOT_TOKEN` -> **Secret value:** Paste your Slack Bot Token (from Step 6).
    - **Name:** `SLACK_SIGNING_SECRET` -> **Secret value:** Paste your Slack Signing Secret (from Step 6).
    - **Name:** `TICKET_CHANNEL_ID` -> **Secret value:** Paste the Slack Channel ID for logging incidents (e.g., `C0XXXXXXXXX`).
    - **Name:** `GCP_PROJECT_ID` -> **Secret value:** Paste your GCP Project ID.
    - **Name:** `GCP_REGION` -> **Secret value:** Enter the GCP region you'll deploy to (e.g., `us-central1`).
    - **Name:** `VERTEX_AI_INDEX_ID` -> **Secret value:** (Leave blank for now, update after Step 7).
    - **Name:** `VERTEX_AI_INDEX_ENDPOINT_ID` -> **Secret value:** (Leave blank for now, update after Step 7).
    - **Name:** `GOOGLE_DRIVE_FOLDER_ID` -> **Secret value:** Paste the ID of your runbooks folder (from Step 5).
    - **Name:** `DRIVE_SERVICE_ACCOUNT_KEY` -> **Secret value:** Open the JSON key file you downloaded for the `oncall-runbook-ingester` SA, copy its **entire content**, and paste it here.
    - **Name:** `PERSONALITY_USER_ID` -> **Secret value:** Your Slack User ID (e.g., U0XXXXXXXXX) for fetching style examples.
3.  Ensure the **Cloud Run SA** (`oncall-bot-runner@...`) and **Ingestion SA** (`oncall-runbook-ingester@...`) have the `Secret Manager Secret Accessor` role granted (done in Step 3).

## 5. Prepare Google Drive

1.  **Create/Identify Folder:** Create a new folder in Google Drive or identify the existing one containing your runbooks.
2.  **Get Folder ID:** Open the folder in your browser. The ID is the last part of the URL (e.g., `https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID`).
3.  **Share Folder:**
    - Right-click the folder -> "Share" -> "Share".
    - In the "Add people and groups" field, paste the **email address of the Ingestion Service Account** (`oncall-runbook-ingester@...`).
    - Grant it at least **Viewer** access (Editor might be needed if the script needs to organize files, but start with Viewer).
    - Uncheck "Notify people".
    - Click "Share".
4.  **Update Secret Manager:** Add the obtained `GOOGLE_DRIVE_FOLDER_ID` to the corresponding secret in Secret Manager.

## 6. Configure Vertex AI Vector Search

This is the most complex part and involves waiting time.

1.  **Navigate:** Go to "Vertex AI" -> "Vector Search" (you might find it under "Matching Engine" initially).
2.  **Create Index:**
    - Click "CREATE INDEX".
    - **Name:** `oncall-runbook-index`.
    - **Description:** (Optional).
    - **Region:** Choose the _same region_ you noted for `GCP_REGION`.
    - **Dimensions:** Enter `768` (for `textembedding-gecko@003`). Verify this if using a different embedding model.
    - **Approximate nearest neighbors count:** Start with `10`.
    - **Distance measure:** `DOT_PRODUCT` (commonly used with Gecko embeddings).
    - **Update method:** `Batch update`.
    - **Filtering:** (Leave defaults unless needed).
    - Click "CREATE". Index creation takes a few minutes.
    - Once created, find it in the list and **Note:** Record the **Index ID** (it's a long number). Example: `projects/YOUR_PROJECT_NUM/locations/YOUR_REGION/indexes/YOUR_INDEX_ID_NUM`. You only need `YOUR_INDEX_ID_NUM`.
3.  **Create Index Endpoint:**
    - Go to the "INDEX ENDPOINTS" tab.
    - Click "CREATE INDEX ENDPOINT".
    - **Name:** `oncall-runbook-endpoint`.
    - **Description:** (Optional).
    - **Region:** Choose the _same region_ again.
    - **Access:** Select "Public endpoint". (You can configure VPC peering later if needed).
    - **Enable access logging:** (Recommended).
    - Click "CREATE". Endpoint creation is usually quick.
    - Once created, find it in the list and **Note:** Record the **Index Endpoint ID** (a long number). Example: `projects/YOUR_PROJECT_NUM/locations/YOUR_REGION/indexEndpoints/YOUR_ENDPOINT_ID_NUM`. You only need `YOUR_ENDPOINT_ID_NUM`.
4.  **Deploy Index to Endpoint:**
    - Click on the name of the Index Endpoint you just created (`oncall-runbook-endpoint`).
    - Click "DEPLOY INDEX".
    - **Index:** Select `oncall-runbook-index`.
    - **Deployed index display name:** `deployed-runbooks-v1`.
    - **Machine Type:** Start small, e.g., `n1-standard-4` (check current recommendations).
    - **Autoscaling:**
      - **Min replica count:** `1`.
      - **Max replica count:** `2` (adjust based on expected load).
    - Click "DEPLOY". **This step can take 30-60 minutes or more.** You can proceed with other steps while waiting.
5.  **Update Secret Manager:** Once you have the **Index ID** and **Index Endpoint ID**, add them to the corresponding secrets (`VERTEX_AI_INDEX_ID`, `VERTEX_AI_INDEX_ENDPOINT_ID`) in Secret Manager.

## 7. Configure Artifact Registry (Optional but Recommended)

If you don't have a Docker repository set up.

1.  Navigate to "Artifact Registry".
2.  Click "CREATE REPOSITORY".
3.  **Name:** `oncall-bot-repo` (or similar).
4.  **Format:** Select `Docker`.
5.  **Mode:** `Standard`.
6.  **Location Type:** `Region`, and select the _same region_ as your other services.
7.  Click "CREATE".

## 8. Configure Slack Application

1.  Go to [https://api.slack.com/apps](https://api.slack.com/apps).
2.  Click "Create New App". Choose "From scratch".
3.  **Name:** `On Call Bot` (or similar).
4.  **Workspace:** Select your target Slack workspace. Click "Create App".
5.  **Add Scopes (Bot Token):**
    - Navigate to "OAuth & Permissions" in the left sidebar.
    - Scroll down to "Scopes" -> "Bot Token Scopes".
    - Click "Add an OAuth Scope" and add:
      - `app_mentions:read`
      - `chat:write`
      - `channels:history`
      - `groups:history` (for private channels)
      - `im:history` (for DMs if needed)
      - `mpim:history` (for group DMs if needed)
      - `users:read` (to get user info like names)
      - `files:read` (if you plan to handle screenshots later)
      - `reactions:write` (Optional, for feedback)
      - `channels:join` (If bot needs to join channels automatically)
6.  **Install App:**
    - Scroll up and click "Install to Workspace".
    - Follow the prompts to authorize the app.
    - After installation, you will see a **Bot User OAuth Token**. Copy this value.
    - **Update Secret Manager:** Add the token to the `SLACK_BOT_TOKEN` secret.
7.  **Get Signing Secret:**
    - Navigate to "Basic Information".
    - Scroll down to "App Credentials".
    - Find the **Signing Secret**. Click "Show" and copy the value.
    - **Update Secret Manager:** Add the secret to the `SLACK_SIGNING_SECRET` secret.
8.  **Enable Events:**
    - Navigate to "Event Subscriptions".
    - Toggle "Enable Events" to **On**.
    - **Request URL:** You will add the Cloud Run URL here _after_ the bot service is deployed for the first time (See `PLAN-11-DockerCloudRun.md`). Leave blank for now.
    - Expand "Subscribe to bot events".
    - Click "Add Bot User Event" and add `app_mention`.
    - Click "Save Changes" (it might show a warning about the URL).
9.  **Enable Interactivity (for Buttons):**
    - Navigate to "Interactivity & Shortcuts".
    - Toggle "Interactivity" to **On**.
    - **Request URL:** You will add the _same_ Cloud Run URL here later. Leave blank for now.
    - Click "Save Changes".
10. **(Optional) Socket Mode:** If you prefer Socket Mode over HTTP Request URLs (avoids exposing Cloud Run publicly):
    - Navigate to "Socket Mode". Enable it.
    - Generate an **App-Level Token** with `connections:write` scope. Name it (e.g., `oncall-bot-socket-token`). Copy the token starting with `xapp-...`.
    - **Create Secret:** Add this `xapp-...` token to Secret Manager as `SLACK_APP_TOKEN`.
    - You would _not_ configure Request URLs in "Event Subscriptions" or "Interactivity". The AI needs to know if Socket Mode is used (via configuration).

**Configuration Complete!** You have now set up the necessary infrastructure. You can provide the details stored in Secret Manager (like Project ID, Region, Index/Endpoint IDs) to the AI developer for use in the application code and deployment configurations. Remember to update `VERTEX_AI_INDEX_ID` and `VERTEX_AI_INDEX_ENDPOINT_ID` secrets once the Vector Search deployment finishes.
