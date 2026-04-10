const { randomUUID } = require('crypto');

function buildKnowledgeRefs(relevantKnowledge = [], limit = 5) {
    if (!Array.isArray(relevantKnowledge)) {
        return [];
    }

    return relevantKnowledge
        .slice(0, limit)
        .map((item) => ({
            id: item.id || null,
            source: item.source || item.metadata?.source || null,
            similarity: Number.isFinite(Number(item.similarity))
                ? Number(item.similarity)
                : null
        }))
        .filter((item) => item.id || item.source);
}

function createTraceId() {
    return randomUUID();
}

function buildUserMessageMetadata({ traceId, username } = {}) {
    return {
        trace_id: traceId || createTraceId(),
        channel: 'telegram',
        ingest: {
            source: 'telegram_user_message',
            username: username || null
        }
    };
}

function buildAssistantMessageMetadata({ traceId, context = {}, aiService = null } = {}) {
    const recentMessages = Array.isArray(context.recentMessages) ? context.recentMessages : [];
    const relevantKnowledge = Array.isArray(context.relevantKnowledge) ? context.relevantKnowledge : [];

    return {
        trace_id: traceId || createTraceId(),
        generation: {
            provider: aiService?.provider || null,
            model: aiService?.model || null,
            profile_memory_present: Boolean(context.profileMemory && String(context.profileMemory).trim()),
            recent_message_count: recentMessages.length,
            knowledge_count: relevantKnowledge.length
        },
        knowledge_refs: buildKnowledgeRefs(relevantKnowledge),
        memory_update: {
            mode: 'async_llm_patch_v2',
            status: 'scheduled'
        }
    };
}

module.exports = {
    createTraceId,
    buildUserMessageMetadata,
    buildAssistantMessageMetadata
};
