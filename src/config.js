// 项目配置文件
require('dotenv').config();

const config = {
    // 数据库配置
    database: {
        url: process.env.DB_URL,
        pool: {
            max: 20,
            min: 5,
            idleTimeoutMillis: 30000
        }
    },
    
    // Telegram配置
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',
        adminIds: process.env.TELEGRAM_ADMIN_IDS ? process.env.TELEGRAM_ADMIN_IDS.split(',') : [],
        contextLimit: parseInt(process.env.TELEGRAM_CONTEXT_LIMIT) || 20,
        historyLimit: parseInt(process.env.TELEGRAM_HISTORY_LIMIT) || 10,
        typingDelayMs: parseInt(process.env.TELEGRAM_TYPING_DELAY_MS) || 500
    },
    
    // Notion配置
    notion: {
        token: process.env.NOTION_TOKEN,
        parentPageId: process.env.NOTION_PARENT_PAGE_ID,
        databaseId: process.env.NOTION_DATABASE_ID
    },
    
    // AI模型配置 - 支持DeepSeek和Claude（通过OpenAI兼容接口）
    ai: (() => {
        const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();

        if (provider === 'claude') {
            // Claude 通过 AiGoCode 的 OpenAI 兼容接口
            const apiKey = process.env.CLAUDE_API_KEY || process.env.OPENAI_API_KEY;
            const baseURL = process.env.CLAUDE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.aigocode.com/v1';
            const model = process.env.CLAUDE_MODEL || process.env.MODEL_NAME || 'claude-sonnet-4-5-latest';

            return {
                provider: 'claude',
                apiKey,
                baseURL,
                model,
                temperature: 0.7,
                maxTokens: 1000
            };
        }

        // 默认使用 DeepSeek
        const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY; // 兼容现有配置
        const baseURL = process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
        const model = process.env.MODEL_NAME || 'deepseek-reasoner';

        return {
            provider: 'deepseek',
            apiKey,
            baseURL,
            model,
            temperature: 0.7,
            maxTokens: 1000
        };
    })(),
    
    // 应用配置
    app: {
        port: process.env.PORT || 3000,
        timezone: process.env.TIMEZONE || 'Asia/Shanghai',
        logLevel: process.env.LOG_LEVEL || 'info',
        nodeEnv: process.env.NODE_ENV || 'development'
    },
    
    // 安全配置
    security: {
        jwtSecret: process.env.JWT_SECRET,
        encryptionKey: process.env.ENCRYPTION_KEY,
        corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000']
    }
};

// 验证必要配置
const requiredEnvVars = ['DB_URL', 'TELEGRAM_BOT_TOKEN'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName] || process.env[varName].includes('请填写')) {
        console.warn(`⚠️  环境变量 ${varName} 未正确配置`);
    }
});

// 验证AI配置
if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.CLAUDE_API_KEY) {
    console.warn('⚠️  未配置AI API密钥 (需要DEEPSEEK_API_KEY或OPENAI_API_KEY或CLAUDE_API_KEY)');
}

module.exports = config;
