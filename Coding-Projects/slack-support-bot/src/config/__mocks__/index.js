// Mock config module
const mockConfig = {
  slackBotToken: 'xoxb-mock-token',
  slackSigningSecret: 'mock-signing-secret',
  ticketChannelId: 'C0123MOCKCH',
  gcpProjectId: 'mock-project-id',
  gcpRegion: 'us-central1',
  vertexAiIndexId: 'mock-index-id',
  vertexAiIndexEndpointId: 'mock-endpoint-id',
  vertexAiLlmModelName: 'gemini-1.0-pro',
  vertexAiEmbeddingModelName: 'textembedding-gecko',
  driveServiceAccountKey: 'mock-key-json',
  personalityUserId: 'U0105MOCKID',
  googleDriveFolderId: 'mock-folder-id',
};

const getConfig = jest.fn().mockResolvedValue(mockConfig);

module.exports = {
  getConfig,
  mockConfig,
};
