const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Cache for the loaded configuration
let config = null;

// List of secret names expected in Secret Manager (must match names in GCP)
// GCP_PROJECT_ID and GCP_REGION are often set as environment variables directly in Cloud Run,
// but can be included here if managed via Secret Manager as well.
const productionSecretNames = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'TICKET_CHANNEL_ID',
  'VERTEX_AI_INDEX_ID',
  'VERTEX_AI_INDEX_ENDPOINT_ID',
  'VERTEX_AI_EMBEDDING_MODEL_NAME',
  'VERTEX_AI_LLM_MODEL_NAME',
  'GOOGLE_DRIVE_FOLDER_ID',
  'DRIVE_SERVICE_ACCOUNT_KEY', // Expecting the JSON key content as the secret value
  'PERSONALITY_USER_ID',
  'TICKETING_CHANNEL_ID',
];

// List of environment variables expected in development (.env file)
const developmentEnvVars = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'TICKET_CHANNEL_ID',
  'GCP_PROJECT_ID',
  'GCP_REGION',
  'VERTEX_AI_INDEX_ID',
  'VERTEX_AI_INDEX_ENDPOINT_ID',
  'VERTEX_AI_EMBEDDING_MODEL_NAME',
  'VERTEX_AI_LLM_MODEL_NAME',
  'GOOGLE_DRIVE_FOLDER_ID',
  'PERSONALITY_USER_ID',
  'TICKETING_CHANNEL_ID',
  // Optional: Path to local SA key file
  // 'DRIVE_SERVICE_ACCOUNT_KEY_PATH',
];

// Helper function to convert snake_case or UPPER_SNAKE_CASE to camelCase
function toCamelCase(str) {
  return str
    .toLowerCase()
    .replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace('-', '').replace('_', '')
    );
}

async function loadConfigInternal() {
  const loadedConfig = {};

  if (process.env.NODE_ENV === 'production') {
    console.log(
      'NODE_ENV=production detected. Loading secrets from Google Secret Manager...'
    );
    const secretClient = new SecretManagerServiceClient();

    // Get Project ID - Prefer env var, fallback to client discovery
    const projectId =
      process.env.GCP_PROJECT_ID || (await secretClient.getProjectId());
    if (!projectId) {
      throw new Error(
        'GCP Project ID not found. Set GCP_PROJECT_ID env var or ensure client can auto-detect.'
      );
    }
    loadedConfig.gcpProjectId = projectId;

    // Get Region - Required from env var in production
    if (!process.env.GCP_REGION) {
      throw new Error(
        'GCP_REGION environment variable is required in production.'
      );
    }
    loadedConfig.gcpRegion = process.env.GCP_REGION;

    console.log(`Fetching secrets from Project ID: ${projectId}`);

    try {
      const accessPromises = productionSecretNames.map(async (secretName) => {
        const secretVersionName = `projects/${projectId}/secrets/${secretName}/versions/latest`;
        try {
          const [version] = await secretClient.accessSecretVersion({
            name: secretVersionName,
          });
          const payload = version.payload.data.toString('utf8');
          const camelCaseKey = toCamelCase(secretName);

          // Special handling for the Drive SA key JSON
          if (secretName === 'DRIVE_SERVICE_ACCOUNT_KEY') {
            try {
              loadedConfig.driveServiceAccountCredentials = JSON.parse(payload);
            } catch (parseError) {
              console.error(
                `Failed to parse JSON for secret: ${secretName}`,
                parseError
              );
              throw new Error(
                `Secret ${secretName} does not contain valid JSON.`
              );
            }
          } else {
            loadedConfig[camelCaseKey] = payload;
          }
          console.log(`Successfully fetched secret: ${secretName}`);
        } catch (error) {
          console.error(`Failed to access secret: ${secretName}`, error);
          // Throw error immediately if a required secret is missing/inaccessible
          throw new Error(`Failed to load required secret: ${secretName}`);
        }
      });

      await Promise.all(accessPromises);
      console.log('All secrets fetched successfully from Secret Manager.');
    } catch (error) {
      console.error('Error fetching secrets from Secret Manager:', error);
      throw error; // Re-throw to be caught by getConfig
    }
  } else {
    console.log('Loading configuration from .env file for development...');
    dotenv.config();

    // Check for required variables first
    const requiredDevVars = [
      'SLACK_BOT_TOKEN',
      'SLACK_SIGNING_SECRET',
      'TICKET_CHANNEL_ID',
      'GCP_PROJECT_ID', // Required even in dev for client libs
      'GCP_REGION', // Required even in dev for client libs
      'VERTEX_AI_INDEX_ID',
      'VERTEX_AI_INDEX_ENDPOINT_ID',
      'VERTEX_AI_EMBEDDING_MODEL_NAME',
      'VERTEX_AI_LLM_MODEL_NAME',
      'GOOGLE_DRIVE_FOLDER_ID',
      'PERSONALITY_USER_ID',
      'TICKETING_CHANNEL_ID',
    ];

    const missingVars = [];
    requiredDevVars.forEach((varName) => {
      if (!process.env[varName]) {
        missingVars.push(varName);
      }
    });

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables in .env file: ${missingVars.join(', ')}`
      );
    }

    // Load all expected vars
    developmentEnvVars.forEach((varName) => {
      if (process.env[varName]) {
        loadedConfig[toCamelCase(varName)] = process.env[varName];
      }
    });

    // Special handling for local Drive SA key path
    if (process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH) {
      const keyPath = path.resolve(process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH);
      console.log(`Attempting to load Drive SA Key from: ${keyPath}`);
      try {
        const keyFileContent = fs.readFileSync(keyPath, 'utf8');
        loadedConfig.driveServiceAccountCredentials =
          JSON.parse(keyFileContent);
        console.log('Successfully loaded and parsed Drive SA Key from file.');
      } catch (error) {
        console.error(
          `FATAL: Failed to read or parse Drive SA Key from path: ${keyPath}`,
          error
        );
        throw new Error(
          `Could not load Drive SA key from ${process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH}. Check the path and JSON validity.`
        );
      }
    } else {
      // In development, if the path is not provided, it might be okay for some flows,
      // but ingestion will fail. Log a warning.
      console.warn(
        'DRIVE_SERVICE_ACCOUNT_KEY_PATH is not set in .env. Drive features requiring SA key will fail.'
      );
    }

    console.log(
      'Configuration loaded from .env file. Loaded keys:',
      Object.keys(loadedConfig).join(', ') // Don't log values!
    );
  }

  return loadedConfig;
}

async function getConfig() {
  if (!config) {
    try {
      console.log('Loading application configuration...');
      config = await loadConfigInternal();
      console.log('Configuration loaded successfully.');
      // Optional: Freeze the config object to prevent modifications
      // Object.freeze(config);
    } catch (error) {
      console.error('FATAL: Failed to load configuration:', error);
      // Exit the process if configuration loading fails catastrophically
      process.exit(1);
    }
  }
  return config;
}

module.exports = { getConfig }; // Export the async function
