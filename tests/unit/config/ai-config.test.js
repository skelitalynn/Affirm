const { resolveAIConfig, normalizeProviderType } = require('../../../src/config/ai-config');

describe('AI config resolver', () => {
    it('应优先读取通用字段', () => {
        const config = resolveAIConfig({
            AI_PROVIDER_TYPE: 'openai-compatible',
            AI_API_KEY: 'generic-key',
            AI_BASE_URL: 'https://proxy.example.com/v1',
            AI_MODEL: 'proxy-model',
            AIGOCODE_API_KEY: 'legacy-key'
        });

        expect(config).toMatchObject({
            providerType: 'openai-compatible',
            provider: 'openai-compatible',
            apiKey: 'generic-key',
            baseURL: 'https://proxy.example.com/v1',
            model: 'proxy-model'
        });
    });

    it('应兼容旧品牌字段并收敛为 openai-compatible', () => {
        const config = resolveAIConfig({
            AI_PROVIDER: 'aigocode',
            CLAUDE_API_KEY: 'legacy-key',
            CLAUDE_BASE_URL: 'https://api.aigocode.com',
            CLAUDE_MODEL: 'claude-sonnet-4-6'
        });

        expect(config).toMatchObject({
            providerType: 'openai-compatible',
            apiKey: 'legacy-key',
            baseURL: 'https://api.aigocode.com',
            model: 'claude-sonnet-4-6'
        });
    });

    it('只使用 OPENAI_* 时不应误配到其他兼容别名的 base url', () => {
        const config = resolveAIConfig({
            OPENAI_API_KEY: 'openai-key',
            OPENAI_BASE_URL: 'https://api.openai.com/v1',
            OPENAI_MODEL: 'gpt-4.1',
            CLAUDE_BASE_URL: 'https://api.aigocode.com'
        });

        expect(config).toMatchObject({
            apiKey: 'openai-key',
            baseURL: 'https://api.openai.com/v1',
            model: 'gpt-4.1'
        });
    });

    it('normalizeProviderType 应将历史品牌别名映射为协议类型', () => {
        expect(normalizeProviderType('aigocode')).toBe('openai-compatible');
        expect(normalizeProviderType('claude')).toBe('openai-compatible');
        expect(normalizeProviderType('deepseek')).toBe('openai-compatible');
        expect(normalizeProviderType('openai')).toBe('openai-compatible');
    });
});
