function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }

    return '';
}

function normalizeProviderType(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (!normalized) {
        return 'openai-compatible';
    }

    const aliasMap = {
        'openai-compatible': 'openai-compatible',
        'openai_compatible': 'openai-compatible',
        openai: 'openai-compatible',
        aigocode: 'openai-compatible',
        claude: 'openai-compatible',
        deepseek: 'openai-compatible'
    };

    return aliasMap[normalized] || normalized;
}

function resolveAIConfig(env = process.env) {
    const providerType = normalizeProviderType(
        firstNonEmpty(env.AI_PROVIDER_TYPE, env.AI_PROVIDER)
    );
    const genericApiKey = firstNonEmpty(env.AI_API_KEY);
    const proxyApiKey = firstNonEmpty(env.AIGOCODE_API_KEY, env.CLAUDE_API_KEY);
    const openAiApiKey = firstNonEmpty(env.OPENAI_API_KEY);

    let apiKey = '';
    let baseURL = '';
    let model = '';

    if (genericApiKey) {
        apiKey = genericApiKey;
        baseURL = firstNonEmpty(
            env.AI_BASE_URL,
            env.AIGOCODE_BASE_URL,
            env.CLAUDE_BASE_URL,
            env.OPENAI_BASE_URL,
            'https://api.openai.com/v1'
        );
        model = firstNonEmpty(
            env.AI_MODEL,
            env.AIGOCODE_MODEL,
            env.CLAUDE_MODEL,
            env.OPENAI_MODEL,
            env.MODEL_NAME,
            'gpt-4'
        );
    } else if (proxyApiKey) {
        apiKey = proxyApiKey;
        baseURL = firstNonEmpty(
            env.AIGOCODE_BASE_URL,
            env.CLAUDE_BASE_URL,
            env.AI_BASE_URL,
            'https://api.openai.com/v1'
        );
        model = firstNonEmpty(
            env.AIGOCODE_MODEL,
            env.CLAUDE_MODEL,
            env.AI_MODEL,
            env.MODEL_NAME,
            'gpt-4'
        );
    } else if (openAiApiKey) {
        apiKey = openAiApiKey;
        baseURL = firstNonEmpty(
            env.OPENAI_BASE_URL,
            env.AI_BASE_URL,
            'https://api.openai.com/v1'
        );
        model = firstNonEmpty(
            env.OPENAI_MODEL,
            env.AI_MODEL,
            env.MODEL_NAME,
            'gpt-4'
        );
    } else {
        baseURL = firstNonEmpty(
            env.AI_BASE_URL,
            env.AIGOCODE_BASE_URL,
            env.CLAUDE_BASE_URL,
            env.OPENAI_BASE_URL,
            'https://api.openai.com/v1'
        );
        model = firstNonEmpty(
            env.AI_MODEL,
            env.AIGOCODE_MODEL,
            env.CLAUDE_MODEL,
            env.OPENAI_MODEL,
            env.MODEL_NAME,
            'gpt-4'
        );
    }

    return {
        providerType,
        // 保留 provider 字段，避免旧代码读取时报错；值已收敛为协议类型而非品牌名
        provider: providerType,
        apiKey,
        baseURL,
        model,
        temperature: parseFloat(env.AI_TEMPERATURE) || 0.7,
        maxTokens: parseInt(env.AI_MAX_TOKENS, 10) || 1000
    };
}

module.exports = {
    resolveAIConfig,
    normalizeProviderType
};
