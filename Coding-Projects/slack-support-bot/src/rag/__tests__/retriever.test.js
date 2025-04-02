const { jest } = require('@jest/globals');
const { initializeRetriever } = require('../retriever');

// Mock external dependencies
jest.mock('../../config');
jest.mock('@langchain/google-vertexai', () => {
  return {
    VertexAIEmbeddings: jest.fn().mockImplementation(() => ({
      // Mock for embeddings client
    })),
    VertexAIVectorStore: jest.fn().mockImplementation(() => ({
      // Mock for vector store
      asRetriever: jest.fn().mockReturnValue({
        // Mock for retriever instance
        getRelevantDocuments: jest.fn().mockResolvedValue([
          { pageContent: 'Mock document content 1', metadata: { source: 'doc1' } },
          { pageContent: 'Mock document content 2', metadata: { source: 'doc2' } },
        ]),
      }),
    })),
  };
});

describe('Retriever Module', () => {
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
  });

  test('initializeRetriever should create and return a retriever instance', async () => {
    // Act
    const retriever = await initializeRetriever();
    
    // Assert
    expect(retriever).toBeDefined();
    expect(retriever.getRelevantDocuments).toBeDefined();
  });

  test('initializeRetriever should cache the retriever instance', async () => {
    // Act
    const retriever1 = await initializeRetriever();
    const retriever2 = await initializeRetriever();
    
    // Assert
    expect(retriever1).toBe(retriever2); // Should be the same instance
  });

  test('getRelevantDocuments should return matching documents', async () => {
    // Arrange
    const retriever = await initializeRetriever();
    const query = 'test query';
    
    // Act
    const docs = await retriever.getRelevantDocuments(query);
    
    // Assert
    expect(docs).toHaveLength(2);
    expect(docs[0].pageContent).toBe('Mock document content 1');
    expect(docs[1].pageContent).toBe('Mock document content 2');
  });
});
