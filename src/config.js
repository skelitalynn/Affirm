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
    
    // AI模型配置 - 支持多提供商，无降级逻辑
    ai: (() => {
        const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
        
        // 提供商配置映射
        const providerConfigs = {
            deepseek: {
                apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
                baseURL: process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
                defaultModel: 'deepseek-reasoner'
            },
            claude: {
                apiKey: process.env.CLAUDE_API_KEY || process.env.OPENAI_API_KEY,
                baseURL: process.env.CLAUDE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.aigocode.com/v1',
                defaultModel: 'claude-sonnet-4-6'
            },
            openai: {
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                defaultModel: 'gpt-4'
            }
            // 未来可以添加更多提供商，如gemini
        };
        
        // 获取当前提供商的配置
        const providerConfig = providerConfigs[provider];
        if (!providerConfig) {
            console.warn(`⚠️  不支持的AI提供商: ${provider}，默认使用deepseek`);
            return providerConfigs.deepseek;
        }
        
        // 确定模型名称：优先使用AI_MODEL，然后使用provider特定的MODEL，最后使用默认
        let model;
        if (process.env.AI_MODEL) {
            model = process.env.AI_MODEL;
        } else if (provider === 'claude' && process.env.CLAUDE_MODEL) {
            model = process.env.CLAUDE_MODEL;
        } else if (process.env.MODEL_NAME) {
            model = process.env.MODEL_NAME; // 向后兼容
        } else {
            model = providerConfig.defaultModel;
        }
        
        return {
            provider: provider,
            apiKey: providerConfig.apiKey,
            baseURL: providerConfig.baseURL,
            model: model,
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1000
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
const aiConfig = config.ai;
if (!aiConfig.apiKey) {
    console.warn('⚠️  未配置AI API密钥');
    console.warn('💡 请根据AI_PROVIDER配置相应的API密钥:');
    console.warn('   - deepseek: DEEPSEEK_API_KEY');
    console.warn('   - claude: CLAUDE_API_KEY');  
    console.warn('   - openai: OPENAI_API_KEY');
}

module.exports = config;