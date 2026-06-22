const MemoryEvent = require('../models/memory-event');
const MemoryEmbeddingService = require('./memory-embedding-service');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMORY_RANKING_VERSION = 'v1-rule-based';

function normalizeLimit(value, fallback = 5, max = 20) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(1, Math.min(parsed, max));
}

function normalizeScore(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(0, Math.min(1, Number(parsed.toFixed(3))));
}

function extractCjkTerms(segment, maxItems = 8) {
    const normalizedSegment = String(segment || '').trim().toLowerCase();
    if (!normalizedSegment) {
        return [];
    }

    const compactSegment = normalizedSegment
        .replace(/(我|你|他|她|它|我们|你们|他们|之前|现在|最近|继续|重新|还是|已经|不要|太|一下|就是|这个|那个|一个|一些|如果|因为|所以|真的|还是会|开始|时候|请|继续|一点|出来的|别人|自己|过|了|的|得|地|吗|呢|啊|吧)/gu, ' ')
        .split(/\s+/u)
        .map((item) => item.trim())
        .filter(Boolean);
    const terms = [];

    compactSegment.forEach((item) => {
        if (item.length <= 4) {
            terms.push(item);
            return;
        }

        for (let size = 2; size <= 3; size += 1) {
            for (let index = 0; index <= item.length - size; index += 1) {
                terms.push(item.slice(index, index + size));
            }
        }
    });

    return Array.from(new Set(terms.filter((item) => item.length >= 2))).slice(0, maxItems);
}

function extractQueryTerms(queryText, maxItems = 8) {
    const normalized = String(queryText || '').trim().toLowerCase();
    if (!normalized) {
        return [];
    }

    const lexicalTerms = normalized
        .split(/[^\p{L}\p{N}_-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2);
    const cjkTerms = normalized
        .split(/[^\p{Script=Han}\p{L}\p{N}_-]+/u)
        .flatMap((segment) => extractCjkTerms(segment, maxItems));

    return Array.from(new Set([
        ...lexicalTerms,
        ...cjkTerms
    ])).slice(0, maxItems);
}

function normalizeTimestamp(value) {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function buildDedupeKey(event = {}) {
    const title = String(event.title || '').trim().toLowerCase();
    const summary = String(event.summary || '').trim().toLowerCase();
    return [event.event_type || '', title, summary].join('|');
}

class MemoryRetrievalService {
    constructor({ model, embeddingService } = {}) {
        this.model = model || MemoryEvent;
        this.embeddingService = embeddingService || new MemoryEmbeddingService();
    }

    getStatus() {
        return {
            enabled: true,
            embedding: this.embeddingService.getStatus(),
            rankingVersion: MEMORY_RANKING_VERSION
        };
    }

    async buildQueryEmbedding(queryText) {
        try {
            return await this.embeddingService.embedText(queryText);
        } catch (error) {
            console.warn(`⚠️ 生成 memory retrieval 查询向量失败，将退回关键词检索: ${error.message}`);
            return null;
        }
    }

    getCandidateLimit(limit = 5) {
        const requestedLimit = normalizeLimit(limit, 5);
        return Math.min(Math.max(requestedLimit * 3, 10), 30);
    }

    buildRecencyScore(event = {}, now = new Date()) {
        const referenceTime = normalizeTimestamp(event.happened_at)
            || normalizeTimestamp(event.created_at);

        if (!referenceTime) {
            return 0.5;
        }

        const safeNow = normalizeTimestamp(now) || new Date();
        const ageMs = Math.max(0, safeNow.getTime() - referenceTime.getTime());
        const ageDays = ageMs / (24 * 60 * 60 * 1000);

        return Number(Math.exp(-ageDays / 45).toFixed(3));
    }

    getEventTypeBoost(event = {}, normalizedQueryText = '') {
        const eventType = String(event.event_type || '').trim();
        const baseBoosts = {
            commitment: 1,
            setback: 0.85,
            fear_pattern: 0.85,
            goal_progress: 0.82,
            breakthrough: 0.8,
            belief_shift: 0.78,
            preference_signal: 0.72,
            relationship_context: 0.68
        };

        if (eventType === 'preference_signal') {
            const preferenceSignals = ['喜欢', '偏好', '语气', '方式', '提醒', '说话', '风格'];
            const hitPreferenceIntent = preferenceSignals.some((fragment) => normalizedQueryText.includes(fragment));
            return hitPreferenceIntent ? 0.95 : baseBoosts.preference_signal;
        }

        return baseBoosts[eventType] ?? 0.7;
    }

    rerankEvents(events = [], { queryText = '', limit = 5, now = new Date() } = {}) {
        if (!Array.isArray(events) || events.length === 0) {
            return [];
        }

        const normalizedQueryText = String(queryText || '').trim().toLowerCase();
        const requestedLimit = normalizeLimit(limit, 5);
        const dedupeKeys = new Set();

        return events
            .map((event) => {
                const hybridScore = normalizeScore(event.final_score, 0);
                const importance = normalizeScore(event.importance, 0.5);
                const confidence = normalizeScore(event.confidence, 0.5);
                const recencyScore = this.buildRecencyScore(event, now);
                const eventTypeBoost = this.getEventTypeBoost(event, normalizedQueryText);
                const rerankScore = Number((
                    (0.55 * hybridScore)
                    + (0.15 * importance)
                    + (0.10 * recencyScore)
                    + (0.10 * confidence)
                    + (0.10 * eventTypeBoost)
                ).toFixed(4));

                return {
                    ...event,
                    recency_score: recencyScore,
                    event_type_boost: eventTypeBoost,
                    rerank_score: rerankScore,
                    memory_ranking_version: MEMORY_RANKING_VERSION,
                    memory_retrieval_strategy: event.vector_score > 0 ? 'hybrid-rerank' : 'keyword-rerank'
                };
            })
            .sort((left, right) => {
                if (right.rerank_score !== left.rerank_score) {
                    return right.rerank_score - left.rerank_score;
                }

                if ((right.final_score || 0) !== (left.final_score || 0)) {
                    return (right.final_score || 0) - (left.final_score || 0);
                }

                const leftTime = normalizeTimestamp(left.happened_at) || normalizeTimestamp(left.created_at);
                const rightTime = normalizeTimestamp(right.happened_at) || normalizeTimestamp(right.created_at);

                return (rightTime?.getTime() || 0) - (leftTime?.getTime() || 0);
            })
            .filter((event) => {
                const dedupeKey = buildDedupeKey(event);
                if (!dedupeKey || !dedupeKeys.has(dedupeKey)) {
                    dedupeKeys.add(dedupeKey);
                    return true;
                }

                return false;
            })
            .slice(0, requestedLimit)
            .map((event, index) => ({
                ...event,
                rank_position: index + 1
            }));
    }

    async recordRecall(events = [], recalledAt = new Date()) {
        const eventIds = Array.isArray(events)
            ? events
                .map((event) => String(event?.id || '').trim())
                .filter(Boolean)
            : [];

        if (eventIds.length === 0) {
            return [];
        }

        try {
            if (typeof this.model.markManyRecalled === 'function') {
                return await this.model.markManyRecalled(eventIds, recalledAt);
            }

            if (typeof this.model.markRecalled === 'function') {
                return Promise.all(eventIds.map((eventId) => this.model.markRecalled(eventId, recalledAt)));
            }
        } catch (error) {
            console.warn(`⚠️ memory_events 召回计数更新失败，不影响主链路: ${error.message}`);
        }

        return [];
    }

    async searchRelevantEvents({ userId, queryText, limit = 5, eventTypes = [], minScore } = {}) {
        const normalizedUserId = String(userId || '').trim();
        if (!UUID_PATTERN.test(normalizedUserId)) {
            throw new Error('userId 必须是有效 UUID');
        }

        const normalizedQueryText = String(queryText || '').trim();
        if (!normalizedQueryText) {
            throw new Error('queryText 不能为空');
        }

        const queryEmbedding = await this.buildQueryEmbedding(normalizedQueryText);
        const queryTerms = extractQueryTerms(normalizedQueryText);
        const vectorWeight = queryEmbedding ? 0.7 : 0;
        const keywordWeight = queryEmbedding ? 0.3 : 1;
        const effectiveMinScore = normalizeScore(minScore, queryEmbedding ? 0.15 : 0.2);
        const requestedLimit = normalizeLimit(limit, 5);

        try {
            const rows = await this.model.searchHybrid({
                userId: normalizedUserId,
                queryText: normalizedQueryText,
                queryEmbedding,
                queryTerms,
                limit: this.getCandidateLimit(requestedLimit),
                eventTypes,
                vectorWeight,
                keywordWeight,
                minScore: effectiveMinScore
            });
            const rerankedRows = this.rerankEvents(rows, {
                queryText: normalizedQueryText,
                limit: requestedLimit
            });

            await this.recordRecall(rerankedRows);
            return rerankedRows;
        } catch (error) {
            console.warn(`⚠️ memory_events 检索失败，已降级为空结果: ${error.message}`);
            return [];
        }
    }

    buildPromptBlock(events = [], limit = 5) {
        return this.model.buildPromptBlock(events, limit);
    }
}

MemoryRetrievalService.RANKING_VERSION = MEMORY_RANKING_VERSION;

module.exports = MemoryRetrievalService;
