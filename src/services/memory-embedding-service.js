const crypto = require('crypto');
const { OpenAIEmbeddings } = require('@langchain/openai');
const config = require('../config');

function sanitizeBaseUrl(baseURL) {
    if (!baseURL || typeof baseURL !== 'string') {
        return null;
    }

    const normalized = baseURL.trim();
    if (!normalized || /^\$\{.+\}$/.test(normalized) || /deepseek/i.test(normalized)) {
        return null;
    }

    return normalized;
}

class DeterministicEmbeddings {
    constructor(dimensions) {
        this.dimensions = dimensions;
    }

    buildVector(text) {
        const digest = crypto.createHash('sha256').update(String(text || '')).digest();
        const vector = new Array(this.dimensions);
        let norm = 0;

        for (let index = 0; index < this.dimensions; index += 1) {
            const byte = digest[index % digest.length];
            const sign = index % 2 === 0 ? 1 : -1;
            const value = sign * ((byte + 1) / 255);

            vector[index] = value;
            norm += value * value;
        }

        const safeNorm = Math.sqrt(norm) || 1;
        return vector.map((value) => Number((value / safeNorm).toFixed(8)));
    }

    async embedQuery(text) {
        return this.buildVector(text);
    }

    async embedDocuments(texts) {
        return texts.map((text) => this.buildVector(text));
    }
}

class MemoryEmbeddingService {
    constructor() {
        this.dimensions = config.embedding?.dimensions || 768;
        this.runtime = this.createRuntime();
    }

    createDeterministicRuntime() {
        return {
            mode: 'deterministic',
            provider: 'local',
            model: 'deterministic-sha256',
            dimensions: this.dimensions,
            embeddings: new DeterministicEmbeddings(this.dimensions)
        };
    }

    createRuntime() {
        const embeddingConfig = config.embedding || {};
        const aiConfig = config.ai || {};
        const explicitEmbeddingKey = embeddingConfig.apiKey ? embeddingConfig.apiKey.trim() : '';
        const explicitEmbeddingBaseUrl = sanitizeBaseUrl(embeddingConfig.baseURL);
        const sharedOpenAiKey = embeddingConfig.sharedApiKey ? embeddingConfig.sharedApiKey.trim() : '';
        const sharedOpenAiBaseUrl = sanitizeBaseUrl(embeddingConfig.sharedBaseURL) || 'https://api.openai.com/v1';
        const embeddingModel = embeddingConfig.model || 'text-embedding-3-small';

        if (explicitEmbeddingKey) {
            return {
                mode: 'openai-compatible',
                provider: embeddingConfig.provider || 'openai',
                model: embeddingModel,
                dimensions: this.dimensions,
                embeddings: new OpenAIEmbeddings({
                    apiKey: explicitEmbeddingKey,
                    model: embeddingModel,
                    dimensions: this.dimensions,
                    batchSize: 50,
                    ...(explicitEmbeddingBaseUrl && {
                        configuration: {
                            baseURL: explicitEmbeddingBaseUrl
                        }
                    })
                })
            };
        }

        if (sharedOpenAiKey) {
            return {
                mode: 'openai-compatible',
                provider: 'openai-shared',
                model: embeddingModel,
                dimensions: this.dimensions,
                embeddings: new OpenAIEmbeddings({
                    apiKey: sharedOpenAiKey,
                    model: embeddingModel,
                    dimensions: this.dimensions,
                    batchSize: 50,
                    configuration: {
                        baseURL: sharedOpenAiBaseUrl
                    }
                })
            };
        }

        if (aiConfig.provider === 'openai' && aiConfig.apiKey) {
            return {
                mode: 'openai-compatible',
                provider: 'openai',
                model: embeddingModel,
                dimensions: this.dimensions,
                embeddings: new OpenAIEmbeddings({
                    apiKey: aiConfig.apiKey,
                    model: embeddingModel,
                    dimensions: this.dimensions,
                    batchSize: 50,
                    ...(sanitizeBaseUrl(aiConfig.baseURL) && {
                        configuration: {
                            baseURL: sanitizeBaseUrl(aiConfig.baseURL)
                        }
                    })
                })
            };
        }

        console.warn('⚠️ 未配置可用的远程 Embeddings，memory retrieval 将退回本地 deterministic 向量');
        return this.createDeterministicRuntime();
    }

    getStatus() {
        return {
            mode: this.runtime.mode,
            provider: this.runtime.provider,
            model: this.runtime.model,
            dimensions: this.runtime.dimensions,
            degraded: this.runtime.mode === 'deterministic'
        };
    }

    shouldFallbackToDeterministic(error) {
        if (!error || this.runtime.mode !== 'openai-compatible') {
            return false;
        }

        const fallbackCodes = new Set([
            'invalid_api_key',
            'insufficient_quota',
            'rate_limited',
            'ECONNABORTED',
            'ECONNREFUSED',
            'ECONNRESET',
            'ENETUNREACH',
            'ENOTFOUND',
            'ETIMEDOUT'
        ]);
        const fallbackStatuses = new Set([401, 403, 408, 429, 500, 502, 503, 504]);
        const rawMessage = [
            error.message,
            error.code,
            error.type,
            error.lc_error_code
        ].filter(Boolean).join(' ').toLowerCase();

        if (error.code && fallbackCodes.has(String(error.code))) {
            return true;
        }

        if (error.status && fallbackStatuses.has(Number(error.status))) {
            return true;
        }

        return [
            'incorrect api key',
            'authentication',
            'unauthorized',
            'invalid_api_key',
            'insufficient_quota',
            'rate limit',
            'fetch failed',
            'network',
            'timeout',
            'timed out',
            'econnrefused',
            'econnreset',
            'enetunreach',
            'enotfound'
        ].some((fragment) => rawMessage.includes(fragment));
    }

    fallbackToDeterministic(error) {
        if (this.runtime.mode === 'deterministic') {
            return false;
        }

        const reason = error?.message || '远程 Embeddings 不可用';
        console.warn(`⚠️  远程 Embeddings 不可用，memory retrieval 自动降级为 deterministic 向量: ${reason}`);
        this.runtime = this.createDeterministicRuntime();
        return true;
    }

    async withEmbeddingFallback(operation) {
        try {
            return await operation();
        } catch (error) {
            if (!this.shouldFallbackToDeterministic(error)) {
                throw error;
            }

            this.fallbackToDeterministic(error);
            return operation();
        }
    }

    async embedText(text) {
        const normalized = String(text || '').trim();
        if (!normalized) {
            throw new Error('文本不能为空');
        }

        return this.withEmbeddingFallback(() => this.runtime.embeddings.embedQuery(normalized));
    }

    async embedTexts(texts = []) {
        const normalizedTexts = Array.isArray(texts)
            ? texts.map((text) => String(text || '').trim()).filter(Boolean)
            : [];

        if (normalizedTexts.length === 0) {
            return [];
        }

        return this.withEmbeddingFallback(() => this.runtime.embeddings.embedDocuments(normalizedTexts));
    }
}

module.exports = MemoryEmbeddingService;
