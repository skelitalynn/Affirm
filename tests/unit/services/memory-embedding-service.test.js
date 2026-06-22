describe('MemoryEmbeddingService', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    it('应在未配置远程 embeddings 时使用 deterministic 模式', async () => {
        jest.doMock('../../../src/config', () => ({
            embedding: {
                provider: 'openai',
                apiKey: '',
                baseURL: '',
                model: 'text-embedding-3-small',
                dimensions: 8,
                sharedApiKey: '',
                sharedBaseURL: ''
            },
            ai: {
                provider: 'claude',
                apiKey: '',
                baseURL: ''
            }
        }));
        jest.doMock('@langchain/openai', () => ({
            OpenAIEmbeddings: class MockOpenAIEmbeddings {}
        }));

        const MemoryEmbeddingService = require('../../../src/services/memory-embedding-service');
        const service = new MemoryEmbeddingService();
        const vector = await service.embedText('hello world');

        expect(service.getStatus()).toMatchObject({
            mode: 'deterministic',
            provider: 'local',
            model: 'deterministic-sha256',
            dimensions: 8,
            degraded: true
        });
        expect(vector).toHaveLength(8);
        expect(vector.every((value) => Number.isFinite(value))).toBe(true);
    });

    it('应在远程 embeddings 鉴权失败时自动降级为 deterministic 向量', async () => {
        const embedQuery = jest.fn(async () => {
            const error = new Error('Incorrect API key provided');
            error.status = 401;
            error.code = 'invalid_api_key';
            throw error;
        });

        jest.doMock('../../../src/config', () => ({
            embedding: {
                provider: 'openai',
                apiKey: 'invalid-key',
                baseURL: 'https://relay.example.com/v1',
                model: 'text-embedding-3-small',
                dimensions: 8,
                sharedApiKey: '',
                sharedBaseURL: ''
            },
            ai: {
                provider: 'claude',
                apiKey: '',
                baseURL: ''
            }
        }));
        jest.doMock('@langchain/openai', () => ({
            OpenAIEmbeddings: class MockOpenAIEmbeddings {
                async embedQuery(text) {
                    return embedQuery(text);
                }

                async embedDocuments(texts) {
                    return Promise.all(texts.map((text) => embedQuery(text)));
                }
            }
        }));

        const MemoryEmbeddingService = require('../../../src/services/memory-embedding-service');
        const service = new MemoryEmbeddingService();
        const vector = await service.embedText('fallback please');

        expect(embedQuery).toHaveBeenCalledTimes(1);
        expect(service.getStatus()).toMatchObject({
            mode: 'deterministic',
            provider: 'local',
            degraded: true
        });
        expect(vector).toHaveLength(8);
        expect(vector.every((value) => Number.isFinite(value))).toBe(true);
    });
});
