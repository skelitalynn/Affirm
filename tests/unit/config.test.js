describe('config.ai Gemini provider', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        jest.resetModules();
        jest.dontMock('dotenv');
        process.env = { ...originalEnv };
    });

    it('应解析 GEMINI_BASE_URL 中的 v1beta 端点', () => {
        jest.doMock('dotenv', () => ({
            config: jest.fn()
        }));
        process.env.DB_URL = 'postgresql://test:test@localhost:5432/affirm_test';
        process.env.TELEGRAM_BOT_TOKEN = 'telegram-test-token';
        process.env.AI_PROVIDER = 'gemini';
        process.env.GEMINI_API_KEY = 'gemini-test-key';
        process.env.GEMINI_BASE_URL = 'https://api.aigocode.com/v1beta';
        process.env.GEMINI_MODEL = 'gemini-3-flash-preview';
        delete process.env.AI_MODEL;

        const config = require('../../src/config');

        expect(config.ai).toMatchObject({
            provider: 'gemini',
            apiKey: 'gemini-test-key',
            baseURL: 'https://api.aigocode.com',
            apiVersion: 'v1beta',
            model: 'gemini-3-flash-preview',
            thinkingBudget: 0
        });
    });

    it('应优先使用 AI_MODEL 作为全局模型覆盖项', () => {
        jest.doMock('dotenv', () => ({
            config: jest.fn()
        }));
        process.env.DB_URL = 'postgresql://test:test@localhost:5432/affirm_test';
        process.env.TELEGRAM_BOT_TOKEN = 'telegram-test-token';
        process.env.AI_PROVIDER = 'gemini';
        process.env.GEMINI_API_KEY = 'gemini-test-key';
        process.env.GEMINI_BASE_URL = 'https://api.aigocode.com/v1beta';
        process.env.GEMINI_MODEL = 'gemini-3-flash-preview';
        process.env.AI_MODEL = 'gemini-3.1-pro-preview';

        const config = require('../../src/config');

        expect(config.ai.provider).toBe('gemini');
        expect(config.ai.model).toBe('gemini-3.1-pro-preview');
    });

    it('应支持显式配置 GEMINI_THINKING_BUDGET', () => {
        jest.doMock('dotenv', () => ({
            config: jest.fn()
        }));
        process.env.DB_URL = 'postgresql://test:test@localhost:5432/affirm_test';
        process.env.TELEGRAM_BOT_TOKEN = 'telegram-test-token';
        process.env.AI_PROVIDER = 'gemini';
        process.env.GEMINI_API_KEY = 'gemini-test-key';
        process.env.GEMINI_BASE_URL = 'https://api.aigocode.com/v1beta';
        process.env.GEMINI_MODEL = 'gemini-3-flash-preview';
        process.env.GEMINI_THINKING_BUDGET = '32';
        delete process.env.AI_MODEL;

        const config = require('../../src/config');

        expect(config.ai.thinkingBudget).toBe(32);
    });
});
