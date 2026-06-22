// 项目配置文件
require('dotenv').config({ override: true });

if (process.env.JEST_WORKER_ID) {
    process.env.NODE_ENV = 'test';
}

function deepFreeze(target) {
    if (!target || typeof target !== 'object' || Object.isFrozen(target)) {
        return target;
    }

    Object.freeze(target);

    Object.getOwnPropertyNames(target).forEach((key) => {
        deepFreeze(target[key]);
    });

    return target;
}

function parseGeminiEndpoint(rawBaseURL) {
    const defaultBaseURL = 'https://api.aigocode.com';
    const defaultApiVersion = 'v1beta';
    const normalized = typeof rawBaseURL === 'string'
        ? rawBaseURL.trim().replace(/\/+$/, '')
        : '';

    if (!normalized) {
        return {
            baseURL: defaultBaseURL,
            apiVersion: defaultApiVersion
        };
    }

    const match = normalized.match(/^(https?:\/\/.+?)\/(v[0-9][a-z0-9.-]*)$/i);
    if (match) {
        return {
            baseURL: match[1],
            apiVersion: match[2]
        };
    }

    return {
        baseURL: normalized,
        apiVersion: defaultApiVersion
    };
}

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
        templatePageId: process.env.NOTION_TEMPLATE_PAGE_ID || '',
        // 新变量名（符合OpenClaw Notion Skill规范）
        apiKey: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN,
        skillDatabaseId: process.env.NOTION_DATABASE_ID
    },
    
    // AI模型配置 - 支持多提供商，无降级逻辑
    ai: (() => {
        const supportedProviders = ['claude', 'openai', 'gemini'];
        const providerAliases = {
            aigocode: 'claude',
            google: 'gemini'
        };
        const requestedProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
        const normalizedRequestedProvider = providerAliases[requestedProvider] || requestedProvider;
        const geminiEndpoint = parseGeminiEndpoint(process.env.GEMINI_BASE_URL);
        const provider = supportedProviders.includes(normalizedRequestedProvider)
            ? normalizedRequestedProvider
            : (
                process.env.CLAUDE_API_KEY ? 'claude'
                    : process.env.OPENAI_API_KEY ? 'openai'
                        : process.env.GEMINI_API_KEY ? 'gemini'
                            : 'openai'
            );
        
        // 提供商配置映射
        const providerConfigs = {
            claude: {
                apiKey: process.env.CLAUDE_API_KEY || process.env.OPENAI_API_KEY,
                baseURL: process.env.CLAUDE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.aigocode.com/v1',
                defaultModel: 'claude-sonnet-4-6'
            },
            openai: {
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                defaultModel: 'gpt-4'
            },
            gemini: {
                apiKey: process.env.GEMINI_API_KEY,
                baseURL: geminiEndpoint.baseURL,
                apiVersion: geminiEndpoint.apiVersion,
                defaultModel: 'gemini-3-flash-preview'
            }
            // 未来可以添加更多提供商，如gemini
        };
        
        if (requestedProvider && !supportedProviders.includes(normalizedRequestedProvider)) {
            console.warn(`⚠️  不支持的AI提供商: ${requestedProvider}，将自动切换到 ${provider}`);
        }

        // 获取当前提供商的配置
        const providerConfig = providerConfigs[provider];
        
        // 确定模型名称：优先使用AI_MODEL，然后使用provider特定的MODEL，最后使用默认
        let model;
        if (process.env.AI_MODEL) {
            model = process.env.AI_MODEL;
        } else if (provider === 'claude' && process.env.CLAUDE_MODEL) {
            model = process.env.CLAUDE_MODEL;
        } else if (provider === 'openai' && process.env.OPENAI_MODEL) {
            model = process.env.OPENAI_MODEL;
        } else if (provider === 'gemini' && process.env.GEMINI_MODEL) {
            model = process.env.GEMINI_MODEL;
        } else if (process.env.MODEL_NAME) {
            model = process.env.MODEL_NAME; // 向后兼容
        } else {
            model = providerConfig.defaultModel;
        }
        
        return {
            provider: provider,
            apiKey: providerConfig.apiKey,
            baseURL: providerConfig.baseURL,
            apiVersion: providerConfig.apiVersion || null,
            model: model,
            thinkingBudget: provider === 'gemini'
                ? Math.max(0, parseInt(process.env.GEMINI_THINKING_BUDGET ?? '0', 10) || 0)
                : null,
            temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
            maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1000
        };
    })(),
    
    // Legacy embedding配置
    // 闭环 v1 完成后，主链路的 knowledge RAG 由 Haystack 侧车负责
    // 这里保留旧配置，仅用于迁移期兼容
    embedding: {
        provider: process.env.EMBEDDING_PROVIDER || 'openai',
        apiKey: process.env.EMBEDDING_API_KEY,
        baseURL: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS) || 768,
        sharedApiKey: process.env.OPENAI_API_KEY || '',
        sharedBaseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    },

    haystack: {
        baseURL: process.env.HAYSTACK_BASE_URL ? process.env.HAYSTACK_BASE_URL.trim().replace(/\/+$/, '') : '',
        apiKey: process.env.HAYSTACK_API_KEY || '',
        timeoutMs: parseInt(process.env.HAYSTACK_TIMEOUT_MS) || 10000,
        healthPath: process.env.HAYSTACK_HEALTH_PATH || '/health',
        searchPath: process.env.HAYSTACK_SEARCH_PATH || '/knowledge/search',
        upsertPath: process.env.HAYSTACK_UPSERT_PATH || '/knowledge/upsert',
        deletePath: process.env.HAYSTACK_DELETE_PATH || '/knowledge/delete'
    },

    memory: {
        enabled: process.env.MEMORY_V2_ENABLED !== 'false',
        recordJobs: process.env.MEMORY_V2_RECORD_JOBS !== 'false',
        contextMessages: parseInt(process.env.MEMORY_V2_CONTEXT_MESSAGES) || 8
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

    admin: {
        port: parseInt(process.env.ADMIN_PORT) || 3001,
        password: process.env.ADMIN_PASSWORD || ''
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
    console.warn('💡 请根据AI_PROVIDER配置相应的API密钥:');
    console.warn('   - claude: CLAUDE_API_KEY');
    console.warn('   - openai: OPENAI_API_KEY');
    console.warn('   - gemini: GEMINI_API_KEY');
}

// 验证 Haystack 配置
if (!config.haystack.baseURL) {
    console.log('ℹ️ 未配置 HAYSTACK_BASE_URL，知识检索将降级为空结果');
}

if (!config.memory.enabled) {
    console.log('ℹ️ MEMORY_V2_ENABLED=false，长期记忆异步整理已关闭');
}

// 提示 legacy embedding 配置状态
if (!config.embedding.apiKey) {
    console.log('ℹ️ 未配置 EMBEDDING_API_KEY；如仍使用旧本地知识链路，将回退到 deterministic 向量');
}

module.exports = deepFreeze(config);
