const { jest } = require('@jest/globals');
const { generateAnswer } = require('../generator');

// Mock external dependencies
jest.mock('../../config');
jest.mock('@langchain/google-vertexai', () => {
  return {
    ChatVertexAI: jest.fn().mockImplementation(() => {
      return {
        invoke: jest.fn().mockResolvedValue('This is a mock LLM response'),
      };
    }),
  };
});

jest.mock('@langchain/core/prompts', () => {
  return {
    PromptTemplate: {
      fromTemplate: jest.fn().mockReturnValue({
        format: jest.fn().mockResolvedValue('Formatted prompt template'),
      }),
    },
  };
});

jest.mock('@langchain/core/runnables', () => {
  return {
    RunnableSequence: {
      from: jest.fn().mockImplementation((components) => {
        return {
          invoke: jest.fn().mockResolvedValue('Runnable sequence response'),
        };
      }),
    },
  };
});

describe('Generator Module', () => {
  const mockDocuments = [
    { pageContent: 'Document 1 content', metadata: { source: 'source1' } },
    { pageContent: 'Document 2 content', metadata: { source: 'source2' } },
  ];
  const mockSlackHistory = 'User: What is the process?\nBot: Let me check.';
  const mockQuestion = 'How do I restart the server?';

  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
  });

  test('generateAnswer should process documents and return an answer', async () => {
    // Act
    const answer = await generateAnswer(mockQuestion, mockDocuments, mockSlackHistory);
    
    // Assert - in this mock setup, it should return the mocked response
    expect(answer).toBe('Runnable sequence response');
  });

  test('generateAnswer should handle missing inputs gracefully', async () => {
    // Test with various invalid inputs
    const results = await Promise.all([
      generateAnswer(null, mockDocuments, mockSlackHistory),
      generateAnswer(mockQuestion, null, mockSlackHistory),
      generateAnswer(mockQuestion, mockDocuments, undefined),
    ]);
    
    // All should return an error message
    results.forEach(result => {
      expect(result).toContain('Error:');
    });
  });
});
