// 项目配置文件
require('dotenv').config();
const { resolveAIConfig } = require('./config/ai-config');

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
    
    // Notion配置 - 兼容新旧变量名
    notion: {
        // 旧变量名（保持向后兼容）
        token: process.env.NOTION_TOKEN,
        parentPageId: process.env.NOTION_PARENT_PAGE_ID,
        databaseId: process.env.NOTION_DATABASE_ID,
        // 新变量名（符合OpenClaw Notion Skill规范）
        apiKey: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN,
        skillDatabaseId: process.env.NOTION_DATABASE_ID
    },
    
    // AI模型配置 - 统一收敛为 OpenAI-compatible 配置
    ai: resolveAIConfig(process.env),
    
    // Knowledge RAG 向量配置
    // EMBEDDING_API_KEY 现在是可选项；未配置时会在 knowledge RAG 中走本地 deterministic fallback
    embedding: {
        provider: process.env.EMBEDDING_PROVIDER || 'openai',
        apiKey: process.env.EMBEDDING_API_KEY,
        baseURL: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS) || 768
    },


    // Redis 配置（BullMQ 持久化队列）
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || null
    },

    // Webhook 配置（Phase 2：Telegram Webhook 模式）
    webhook: {
        enabled: process.env.WEBHOOK_ENABLED === 'true',
        port: parseInt(process.env.WEBHOOK_PORT) || 3002,
        secretToken: process.env.WEBHOOK_SECRET_TOKEN || ''
    },

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
const aiConfig = config.ai;
if (!aiConfig.apiKey) {
    console.warn('⚠️  未配置AI API密钥');
    console.warn('💡 优先配置通用变量: AI_API_KEY / AI_BASE_URL / AI_MODEL / AI_PROVIDER_TYPE');
    console.warn('💡 兼容旧变量: AIGOCODE_* / CLAUDE_* / OPENAI_*');
}

// 验证 Knowledge RAG 配置
if (!config.embedding.apiKey) {
    console.log('ℹ️ 未配置 EMBEDDING_API_KEY，knowledge RAG 将自动回退到本地 deterministic 向量');
}

module.exports = config;
