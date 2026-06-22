const MemoryEvent = require('../models/memory-event');
const MemoryEmbeddingService = require('./memory-embedding-service');

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

class MemoryEventService {
    constructor({ model, embeddingService } = {}) {
        this.model = model || MemoryEvent;
        this.embeddingService = embeddingService || new MemoryEmbeddingService();
    }

    prepareCandidate(candidate = {}, options = {}) {
        if (!isPlainObject(candidate)) {
            return null;
        }

        const defaultSourceMessageIds = Array.isArray(options.defaultSourceMessageIds)
            ? options.defaultSourceMessageIds
            : [];
        const baseMetadata = isPlainObject(options.baseMetadata) ? options.baseMetadata : {};
        const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
        const summary = typeof candidate.summary === 'string' ? candidate.summary.trim() : '';
        const detail = typeof candidate.detail === 'string' ? candidate.detail.trim() : '';
        const eventType = typeof candidate.event_type === 'string' ? candidate.event_type.trim() : '';

        if (!eventType || !title || !summary) {
            return null;
        }

        return {
            event_type: eventType,
            title,
            summary,
            detail,
            keywords: Array.isArray(candidate.keywords) ? candidate.keywords : [],
            source_message_ids: Array.isArray(candidate.source_message_ids) && candidate.source_message_ids.length > 0
                ? candidate.source_message_ids
                : defaultSourceMessageIds,
            importance: candidate.importance,
            confidence: candidate.confidence,
            happened_at: candidate.happened_at || null,
            metadata: {
                ...baseMetadata,
                ...(isPlainObject(candidate.metadata) ? candidate.metadata : {})
            }
        };
    }

    shouldPersistCandidate(candidate) {
        if (!candidate) {
            return false;
        }

        const importance = Number(candidate.importance);
        const confidence = Number(candidate.confidence);
        const hasNarrative = Boolean(candidate.summary || candidate.detail);
        const hasSignalStrength = (!Number.isFinite(importance) || importance >= 0.35)
            && (!Number.isFinite(confidence) || confidence >= 0.35);

        return Boolean(candidate.event_type && candidate.title && hasNarrative && hasSignalStrength);
    }

    async attachEmbeddings(candidates = []) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return [];
        }

        const texts = candidates.map((candidate) => this.model.buildSearchText(candidate));
        try {
            const embeddings = await this.embeddingService.embedTexts(texts);
            return candidates.map((candidate, index) => ({
                ...candidate,
                embedding: Array.isArray(embeddings[index]) ? embeddings[index] : null
            }));
        } catch (error) {
            console.warn(`⚠️ 生成 memory_event embeddings 失败，将写入无向量事件: ${error.message}`);
            return candidates.map((candidate) => ({
                ...candidate,
                embedding: null
            }));
        }
    }

    async saveCandidates({ userId, candidates = [], sourceMessageIds = [], metadata = {} } = {}) {
        const createdEvents = [];
        const preparedCandidates = [];

        for (const rawCandidate of candidates) {
            const candidate = this.prepareCandidate(rawCandidate, {
                defaultSourceMessageIds: sourceMessageIds,
                baseMetadata: metadata
            });

            if (!this.shouldPersistCandidate(candidate)) {
                continue;
            }
            preparedCandidates.push(candidate);
        }

        const candidatesWithEmbeddings = await this.attachEmbeddings(preparedCandidates);
        for (const candidate of candidatesWithEmbeddings) {
            const created = await this.model.create({
                user_id: userId,
                ...candidate
            });
            createdEvents.push(created);
        }

        return createdEvents;
    }

    buildPromptBlock(events = [], limit = 5) {
        return this.model.buildPromptBlock(events, limit);
    }
}

module.exports = MemoryEventService;
