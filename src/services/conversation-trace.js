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

function buildMemoryRefs(recalledMemoryEvents = [], limit = 5) {
    if (!Array.isArray(recalledMemoryEvents)) {
        return [];
    }

    return recalledMemoryEvents
        .slice(0, limit)
        .map((item) => ({
            id: item.id || null,
            event_type: item.event_type || null,
            title: item.title || null,
            rerank_score: Number.isFinite(Number(item.rerank_score))
                ? Number(item.rerank_score)
                : null,
            final_score: Number.isFinite(Number(item.final_score))
                ? Number(item.final_score)
                : null,
            memory_ranking_version: item.memory_ranking_version || null,
            memory_retrieval_strategy: item.memory_retrieval_strategy || null
        }))
        .filter((item) => item.id || item.title);
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
    const recalledMemoryEvents = Array.isArray(context.recalledMemoryEvents) ? context.recalledMemoryEvents : [];
    const memoryRankingVersion = context.memoryRankingVersion
        || recalledMemoryEvents[0]?.memory_ranking_version
        || null;
    const memoryRetrievalStrategy = context.memoryRetrievalStrategy
        || recalledMemoryEvents[0]?.memory_retrieval_strategy
        || null;
    const recalledMemoryInPrompt = Boolean(
        (context.recalledMemoryBlock && String(context.recalledMemoryBlock).trim())
        || recalledMemoryEvents.length > 0
    );
    const generationMeta = typeof aiService?.getLastGenerationMeta === 'function'
        ? aiService.getLastGenerationMeta()
        : null;

    return {
        trace_id: traceId || createTraceId(),
        generation: {
            provider: aiService?.provider || null,
            model: aiService?.model || null,
            finish_reason: generationMeta?.finish_reason || null,
            finish_message: generationMeta?.finish_message || null,
            response_id: generationMeta?.response_id || null,
            output_length: generationMeta?.output_length || null,
            request_attempts: generationMeta?.request_attempts || 1,
            retried_for_incomplete_output: Boolean(generationMeta?.retried_for_incomplete_output),
            usage: generationMeta?.usage || null,
            profile_memory_present: Boolean(context.profileMemory && String(context.profileMemory).trim()),
            recent_message_count: recentMessages.length,
            knowledge_count: relevantKnowledge.length,
            recalled_memory_count: recalledMemoryEvents.length,
            recalled_memory_in_prompt: recalledMemoryInPrompt,
            memory_ranking_version: memoryRankingVersion,
            memory_retrieval_strategy: memoryRetrievalStrategy
        },
        knowledge_refs: buildKnowledgeRefs(relevantKnowledge),
        memory_refs: buildMemoryRefs(recalledMemoryEvents),
        memory_update: {
            mode: 'async_llm_patch_v2',
            status: 'scheduled'
        }
    };
}

module.exports = {
    createTraceId,
    buildUserMessageMetadata,
    buildAssistantMessageMetadata,
    buildMemoryRefs
};
