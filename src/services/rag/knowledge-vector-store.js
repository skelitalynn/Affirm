const crypto = require('crypto');
const { Document } = require('@langchain/core/documents');
const { PGVectorStore } = require('@langchain/community/vectorstores/pgvector');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { db } = require('../../db/connection');
const config = require('../../config');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

class KnowledgeVectorStore {
    constructor() {
        this.tableName = 'knowledge_chunks';
        this.columns = {
            idColumnName: 'id',
            contentColumnName: 'content',
            vectorColumnName: 'embedding',
            metadataColumnName: 'metadata'
        };
        this.dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS, 10)
            || config.embedding?.dimensions
            || 768;

        this.schemaPromise = null;
        this.storePromise = null;
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
        const sharedOpenAiKey = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : '';
        const sharedOpenAiBaseUrl = sanitizeBaseUrl(process.env.OPENAI_BASE_URL) || 'https://api.openai.com/v1';
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

        console.warn('⚠️ 未配置可用的远程 Embeddings，knowledge RAG 将退回本地 deterministic 向量');

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

    async ensureSchemaReady() {
        if (!this.schemaPromise) {
            this.schemaPromise = this.ensureSchemaReadyInternal().catch((error) => {
                this.schemaPromise = null;
                throw error;
            });
        }

        return this.schemaPromise;
    }

    async ensureSchemaReadyInternal() {
        try {
            await db.pool.query(`
                ALTER TABLE knowledge_chunks
                ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb
            `);

            await db.pool.query(`
                UPDATE knowledge_chunks
                SET metadata = jsonb_strip_nulls(
                    COALESCE(metadata, '{}'::jsonb)
                    || CASE
                        WHEN source IS NULL THEN '{}'::jsonb
                        ELSE jsonb_build_object('source', source)
                    END
                    || CASE
                        WHEN user_id IS NULL THEN '{}'::jsonb
                        ELSE jsonb_build_object('user_id', user_id::text)
                    END
                    || jsonb_build_object(
                        'scope',
                        CASE WHEN user_id IS NULL THEN 'global' ELSE 'user' END
                    )
                )
                WHERE metadata IS NULL
                   OR metadata = '{}'::jsonb
                   OR (source IS NOT NULL AND COALESCE(metadata->>'source', '') = '')
                   OR (user_id IS NOT NULL AND COALESCE(metadata->>'user_id', '') = '')
                   OR COALESCE(metadata->>'scope', '') = ''
            `);
        } catch (error) {
            if (error.code === '42P01') {
                throw new Error('knowledge_chunks 表不存在，请先执行数据库迁移');
            }

            throw error;
        }
    }

    buildMetadata(payload = {}) {
        const metadata = isPlainObject(payload.metadata) ? { ...payload.metadata } : {};
        const source = (typeof payload.source === 'string' && payload.source.trim())
            || (typeof metadata.source === 'string' && metadata.source.trim())
            || 'user_input';
        const rawUserId = payload.user_id ? String(payload.user_id).trim() : (
            typeof metadata.user_id === 'string' ? metadata.user_id.trim() : null
        );

        delete metadata.source;
        delete metadata.user_id;
        delete metadata.scope;

        if (rawUserId && !UUID_PATTERN.test(rawUserId)) {
            throw new Error('User ID 必须是有效 UUID');
        }

        return {
            ...metadata,
            source,
            ...(rawUserId ? { user_id: rawUserId } : {}),
            scope: rawUserId ? 'user' : 'global'
        };
    }

    buildDocument(payload) {
        return new Document({
            id: payload.id,
            pageContent: payload.content,
            metadata: this.buildMetadata(payload)
        });
    }

    async getStore() {
        if (!this.storePromise) {
            this.storePromise = this.initializeStore().catch((error) => {
                this.storePromise = null;
                throw error;
            });
        }

        return this.storePromise;
    }

    async initializeStore() {
        await this.ensureSchemaReady();

        const store = await PGVectorStore.initialize(this.runtime.embeddings, {
            pool: db.pool,
            tableName: this.tableName,
            columns: this.columns,
            distanceStrategy: 'cosine',
            scoreNormalization: 'similarity',
            skipInitializationCheck: true
        });

        if (store.client) {
            store.client.release();
            store.client = null;
        }

        return store;
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
        console.warn(`⚠️  远程 Embeddings 不可用，knowledge RAG 自动降级为 deterministic 向量: ${reason}`);
        this.runtime = this.createDeterministicRuntime();
        this.storePromise = null;
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
        if (!text || !String(text).trim()) {
            throw new Error('文本不能为空');
        }

        return this.withEmbeddingFallback(() => this.runtime.embeddings.embedQuery(String(text)));
    }

    toVectorSql(vector) {
        if (!Array.isArray(vector) || vector.length === 0) {
            return null;
        }

        return `[${vector.join(',')}]`;
    }

    async syncInsertedRows(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return;
        }

        await db.pool.query(`
            UPDATE knowledge_chunks
            SET source = NULLIF(COALESCE(metadata->>'source', source), ''),
                user_id = CASE
                    WHEN COALESCE(metadata->>'user_id', '') = '' THEN NULL
                    ELSE (metadata->>'user_id')::uuid
                END
            WHERE id = ANY($1::uuid[])
        `, [ids]);
    }

    async addKnowledge(payload) {
        return this.addKnowledgeBatch([payload]);
    }

    async addKnowledgeBatch(payloads = []) {
        if (!Array.isArray(payloads) || payloads.length === 0) {
            return [];
        }

        const documents = payloads.map((payload) => this.buildDocument(payload));
        const ids = payloads.map((payload) => payload.id);

        await this.withEmbeddingFallback(async () => {
            const store = await this.getStore();
            await store.addDocuments(documents, { ids });
            await this.syncInsertedRows(ids);
        });

        return ids;
    }

    async similaritySearch(queryText, options = {}) {
        const limit = Math.max(1, parseInt(options.limit, 10) || 10);
        const filter = isPlainObject(options.filter) && Object.keys(options.filter).length > 0
            ? options.filter
            : undefined;
        const results = await this.withEmbeddingFallback(async () => {
            const store = await this.getStore();
            return store.similaritySearchWithScore(queryText, limit, filter);
        });

        return results.map(([doc, similarity]) => ({
            id: doc.id,
            content: doc.pageContent,
            metadata: isPlainObject(doc.metadata) ? doc.metadata : {},
            similarity: Number(similarity)
        }));
    }
}

module.exports = new KnowledgeVectorStore();
