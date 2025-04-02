const { jest } = require('@jest/globals');
const { registerInteractionHandlers } = require('../interactions');

describe('Slack Interactions', () => {
  // Mock Slack app and client
  const mockAck = jest.fn();
  const mockSay = jest.fn();
  const mockClient = {
    conversations: {
      replies: jest.fn().mockResolvedValue({
        messages: [{ text: 'Original question', ts: '1234.5678', user: 'U123USER' }],
      }),
    },
    chat: {
      getPermalink: jest.fn().mockResolvedValue({ permalink: 'https://slack.com/archives/mock-permalink' }),
      postMessage: jest.fn().mockResolvedValue({ ts: '1235.5678' }),
    },
  };
  
  const mockApp = {
    action: jest.fn((actionId, callback) => {
      // Store the callback for testing
      mockApp.callbacks[actionId] = callback;
      return mockApp;
    }),
    callbacks: {},
  };
  
  const mockConfig = {
    ticketingChannelId: 'C123TICKET',
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    mockApp.callbacks = {};
  });

  test('should register interaction handlers correctly', () => {
    // Act
    registerInteractionHandlers(mockApp, mockConfig);
    
    // Assert
    expect(mockApp.action).toHaveBeenCalledWith('log_incident_button', expect.any(Function));
    expect(mockApp.callbacks['log_incident_button']).toBeDefined();
  });

  test('log_incident_button should create a ticket when clicked', async () => {
    // Arrange
    registerInteractionHandlers(mockApp, mockConfig);
    const logIncidentCallback = mockApp.callbacks['log_incident_button'];
    
    // Mock event payload
    const mockBody = {
      user: { id: 'U123USER' },
      channel: { id: 'C123CHANNEL' },
      message: {
        ts: '1234.5678',
        thread_ts: '1234.5678',
        text: 'Bot response',
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Response from bot' },
          },
        ],
      },
    };
    
    // Act
    await logIncidentCallback({
      ack: mockAck,
      body: mockBody,
      client: mockClient,
      logger: { info: jest.fn(), error: jest.fn() },
    });
    
    // Assert
    expect(mockAck).toHaveBeenCalled();
    expect(mockClient.conversations.replies).toHaveBeenCalled();
    expect(mockClient.chat.getPermalink).toHaveBeenCalled();
    expect(mockClient.chat.postMessage).toHaveBeenCalledTimes(2); // Once for ticket, once for confirmation
    
    // Should post to the ticket channel
    expect(mockClient.chat.postMessage.mock.calls[0][0].channel).toBe('C123TICKET');
    
    // Should include blocks in the message
    expect(mockClient.chat.postMessage.mock.calls[0][0].blocks).toBeDefined();
    expect(mockClient.chat.postMessage.mock.calls[0][0].blocks.length).toBeGreaterThan(0);
  });
});
