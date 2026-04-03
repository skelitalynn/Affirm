const AIService = require('../../../src/services/ai');

describe('AIService', () => {
    it('generateResponse 应将 timeout 作为请求选项传递而不是请求体字段', async () => {
        const createMock = jest.fn(async () => ({
            choices: [{
                message: {
                    content: '测试回复'
                }
            }]
        }));

        const service = new AIService({
            providerType: 'openai-compatible',
            model: 'claude-sonnet-4-6',
            temperature: 0.7,
            maxTokens: 1000
        });
        service.client = {
            chat: {
                completions: {
                    create: createMock
                }
            }
        };
        service.initialized = true;

        const response = await service.generateResponse({
            user: { id: 'user-1', username: 'tester' },
            userMessage: '你好',
            recentMessages: []
        });

        expect(response).toBe('测试回复');
        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            model: 'claude-sonnet-4-6',
            temperature: 0.7,
            max_tokens: 1000,
            top_p: 0.9
        }), {
            timeout: 10000
        });
        expect(createMock.mock.calls[0][0]).not.toHaveProperty('timeout');
    });
});
