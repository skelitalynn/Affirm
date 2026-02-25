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
        adminIds: process.env.TELEGRAM_ADMIN_IDS ? process.env.TELEGRAM_ADMIN_IDS.split(',') : []
    },
    
    // Notion配置
    notion: {
        token: process.env.NOTION_TOKEN,
        parentPageId: process.env.NOTION_PARENT_PAGE_ID,
        databaseId: process.env.NOTION_DATABASE_ID
    },
    
    // AI模型配置
    ai: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.MODEL_NAME || 'gpt-5.3-codex',
        temperature: 0.7,
        maxTokens: 1000
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
const requiredEnvVars = ['DB_URL', 'TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName] || process.env[varName].includes('请填写')) {
        console.warn(`⚠️  环境变量 ${varName} 未正确配置`);
    }
});

module.exports = config;
