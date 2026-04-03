describe('KnowledgeVectorStore', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    it('应在远程 embeddings 鉴权失败时自动降级为 deterministic 向量', async () => {
        process.env.OPENAI_API_KEY = 'invalid-openai-key';
        process.env.EMBEDDING_API_KEY = '';
        process.env.EMBEDDING_DIMENSIONS = '8';

        const poolQuery = jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const initializeMock = jest.fn(async (embeddings) => ({
            addDocuments: jest.fn(async () => {
                if (embeddings.apiKey) {
                    const error = new Error('Incorrect API key provided');
                    error.status = 401;
                    error.code = 'invalid_api_key';
                    throw error;
                }
            }),
            similaritySearchWithScore: jest.fn(async () => [])
        }));

        jest.doMock('../../../src/db/connection', () => ({
            db: {
                pool: {
                    query: poolQuery
                }
            }
        }));
        jest.doMock('@langchain/community/vectorstores/pgvector', () => ({
            PGVectorStore: {
                initialize: initializeMock
            }
        }));
        jest.doMock('@langchain/openai', () => ({
            OpenAIEmbeddings: class MockOpenAIEmbeddings {
                constructor(options = {}) {
                    this.apiKey = options.apiKey;
                }

                async embedQuery() {
                    return [0.1, 0.2];
                }
            }
        }));

        const knowledgeVectorStore = require('../../../src/services/rag/knowledge-vector-store');

        const ids = await knowledgeVectorStore.addKnowledgeBatch([{
            id: '11111111-1111-4111-8111-111111111111',
            content: 'fallback test content',
            source: 'unit-test'
        }]);

        expect(ids).toEqual(['11111111-1111-4111-8111-111111111111']);
        expect(knowledgeVectorStore.getStatus()).toMatchObject({
            mode: 'deterministic',
            provider: 'local',
            degraded: true
        });
        expect(initializeMock).toHaveBeenCalledTimes(2);
        expect(poolQuery).toHaveBeenCalledTimes(3);
    });
});
