const {
    buildAssistantMessageMetadata,
    buildMemoryRefs
} = require('../../../src/services/conversation-trace');

describe('conversation-trace', () => {
    it('buildMemoryRefs() 应提取可追踪的历史召回信息', () => {
        const refs = buildMemoryRefs([
            {
                id: 'event-1',
                event_type: 'commitment',
                title: '开始晨间复盘',
                final_score: 0.82,
                rerank_score: 0.88,
                memory_ranking_version: 'v1-rule-based',
                memory_retrieval_strategy: 'hybrid-rerank'
            },
            {
                id: null,
                title: '',
                final_score: 0.4
            }
        ]);

        expect(refs).toEqual([{
            id: 'event-1',
            event_type: 'commitment',
            title: '开始晨间复盘',
            rerank_score: 0.88,
            final_score: 0.82,
            memory_ranking_version: 'v1-rule-based',
            memory_retrieval_strategy: 'hybrid-rerank'
        }]);
    });

    it('buildAssistantMessageMetadata() 应写入 recalled memory 统计与引用', () => {
        const metadata = buildAssistantMessageMetadata({
            traceId: 'trace-1',
            context: {
                profileMemory: 'summary',
                recalledMemoryBlock: '1. 开始晨间复盘\n摘要: 用户承诺连续 7 天晨间复盘',
                recentMessages: [{ id: 'msg-1' }, { id: 'msg-2' }],
                relevantKnowledge: [{ id: 'knowledge-1', similarity: 0.73 }],
                recalledMemoryEvents: [{
                    id: 'event-1',
                    event_type: 'commitment',
                    title: '开始晨间复盘',
                    final_score: 0.82,
                    rerank_score: 0.88,
                    memory_ranking_version: 'v1-rule-based',
                    memory_retrieval_strategy: 'hybrid-rerank'
                }]
            },
            aiService: {
                provider: 'openai',
                model: 'gpt-test'
            }
        });

        expect(metadata.generation).toEqual(expect.objectContaining({
            provider: 'openai',
            model: 'gpt-test',
            profile_memory_present: true,
            recent_message_count: 2,
            knowledge_count: 1,
            recalled_memory_count: 1,
            recalled_memory_in_prompt: true,
            memory_ranking_version: 'v1-rule-based',
            memory_retrieval_strategy: 'hybrid-rerank'
        }));
        expect(metadata.memory_refs).toEqual([{
            id: 'event-1',
            event_type: 'commitment',
            title: '开始晨间复盘',
            rerank_score: 0.88,
            final_score: 0.82,
            memory_ranking_version: 'v1-rule-based',
            memory_retrieval_strategy: 'hybrid-rerank'
        }]);
    });

    it('buildAssistantMessageMetadata() 应在无显式 block 时仍记录 recalled memory 已注入，并支持上下文覆盖 ranking 信息', () => {
        const metadata = buildAssistantMessageMetadata({
            traceId: 'trace-2',
            context: {
                recalledMemoryEvents: [{
                    id: 'event-2',
                    event_type: 'preference_signal',
                    title: '偏好温柔提醒',
                    final_score: 0.66,
                    rerank_score: 0.71,
                    memory_ranking_version: 'v1-rule-based',
                    memory_retrieval_strategy: 'keyword-rerank'
                }],
                memoryRankingVersion: 'v2-eval',
                memoryRetrievalStrategy: 'hybrid-rerank'
            }
        });

        expect(metadata.generation).toEqual(expect.objectContaining({
            recalled_memory_count: 1,
            recalled_memory_in_prompt: true,
            memory_ranking_version: 'v2-eval',
            memory_retrieval_strategy: 'hybrid-rerank'
        }));
        expect(metadata.memory_refs).toEqual([{
            id: 'event-2',
            event_type: 'preference_signal',
            title: '偏好温柔提醒',
            rerank_score: 0.71,
            final_score: 0.66,
            memory_ranking_version: 'v1-rule-based',
            memory_retrieval_strategy: 'keyword-rerank'
        }]);
    });
});
