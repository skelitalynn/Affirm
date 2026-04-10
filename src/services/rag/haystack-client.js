const fallbackFetch = require('node-fetch');
const config = require('../../config');

const fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : fallbackFetch;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    return [];
}

function sanitizeBaseUrl(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }

    return value.trim().replace(/\/+$/, '');
}

function normalizeErrorMessage(status, payload, fallbackMessage) {
    if (isPlainObject(payload)) {
        if (typeof payload.error === 'string' && payload.error.trim()) {
            return payload.error.trim();
        }

        if (typeof payload.message === 'string' && payload.message.trim()) {
            return payload.message.trim();
        }
    }

    return fallbackMessage || `Haystack request failed with status ${status}`;
}

class HaystackClient {
    constructor() {
        this.config = config.haystack || {};
    }

    isConfigured() {
        return Boolean(sanitizeBaseUrl(this.config.baseURL));
    }

    buildUrl(pathname = '') {
        const baseURL = sanitizeBaseUrl(this.config.baseURL);
        const path = String(pathname || '').startsWith('/') ? pathname : `/${pathname}`;
        return `${baseURL}${path}`;
    }

    async request(pathname, options = {}) {
        if (!this.isConfigured()) {
            throw new Error('Haystack 未配置，请先设置 HAYSTACK_BASE_URL');
        }

        const method = options.method || 'GET';
        const timeoutMs = Math.max(1000, parseInt(options.timeoutMs, 10) || this.config.timeoutMs || 10000);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const headers = {
            Accept: 'application/json',
            ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
            ...(isPlainObject(options.headers) ? options.headers : {})
        };

        try {
            const response = await fetchImpl(this.buildUrl(pathname), {
                method,
                headers,
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                signal: controller.signal
            });
            const rawText = await response.text();
            let payload = {};

            if (rawText) {
                try {
                    payload = JSON.parse(rawText);
                } catch {
                    payload = { raw: rawText };
                }
            }

            if (!response.ok) {
                throw new Error(normalizeErrorMessage(response.status, payload));
            }

            return payload;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`Haystack 请求超时（>${timeoutMs}ms）`);
            }

            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    async healthCheck() {
        if (!this.isConfigured()) {
            return {
                configured: false,
                healthy: false,
                message: 'Haystack 未配置'
            };
        }

        try {
            const payload = await this.request(this.config.healthPath || '/health', {
                method: 'GET'
            });

            return {
                configured: true,
                healthy: true,
                payload
            };
        } catch (error) {
            return {
                configured: true,
                healthy: false,
                message: error.message
            };
        }
    }

    async upsertKnowledge(documents = []) {
        if (!Array.isArray(documents) || documents.length === 0) {
            return { count: 0 };
        }

        return this.request(this.config.upsertPath || '/knowledge/upsert', {
            method: 'POST',
            body: { documents }
        });
    }

    async deleteKnowledge(ids = []) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return { count: 0 };
        }

        return this.request(this.config.deletePath || '/knowledge/delete', {
            method: 'POST',
            body: { ids }
        });
    }

    normalizeSearchResults(payload) {
        const rawResults = Array.isArray(payload)
            ? payload
            : (
                payload.results
                || payload.documents
                || payload.items
                || payload.data
                || []
            );

        return toArray(rawResults)
            .map((item) => {
                const metadata = isPlainObject(item.metadata)
                    ? item.metadata
                    : (isPlainObject(item.meta) ? item.meta : {});
                const id = item.id || item.document_id || metadata.chunk_id || metadata.document_id || null;
                const content = item.content || item.pageContent || item.text || item.document?.content || '';
                const similarity = Number(
                    item.similarity
                    ?? item.score
                    ?? item.rank_score
                    ?? item.document?.score
                    ?? 0
                );

                return {
                    id,
                    content: String(content || ''),
                    source: metadata.source || null,
                    user_id: metadata.user_id || null,
                    metadata,
                    similarity: Number.isFinite(similarity) ? similarity : 0
                };
            })
            .filter((item) => item.id && item.content);
    }

    async searchKnowledge(queryText, options = {}) {
        const limit = Math.max(1, parseInt(options.limit, 10) || 5);
        const similarityThreshold = Number.isFinite(Number(options.similarityThreshold))
            ? Number(options.similarityThreshold)
            : 0;
        const userId = options.userId ? String(options.userId).trim() : null;

        const payload = await this.request(this.config.searchPath || '/knowledge/search', {
            method: 'POST',
            body: {
                query: String(queryText || ''),
                limit,
                similarity_threshold: similarityThreshold,
                user_id: userId,
                scopes: userId ? ['global', 'user'] : ['global'],
                filters: userId
                    ? {
                        operator: 'OR',
                        conditions: [
                            {
                                field: 'scope',
                                operator: '==',
                                value: 'global'
                            },
                            {
                                operator: 'AND',
                                conditions: [
                                    {
                                        field: 'scope',
                                        operator: '==',
                                        value: 'user'
                                    },
                                    {
                                        field: 'user_id',
                                        operator: '==',
                                        value: userId
                                    }
                                ]
                            }
                        ]
                    }
                    : {
                        field: 'scope',
                        operator: '==',
                        value: 'global'
                    }
            }
        });

        return this.normalizeSearchResults(payload);
    }
}

module.exports = new HaystackClient();
