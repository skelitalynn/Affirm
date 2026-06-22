jest.mock('../../../src/models/memory-event', () => ({
    searchHybrid: jest.fn(),
    markManyRecalled: jest.fn(),
    buildPromptBlock: jest.fn(() => 'prompt block')
}));

const MemoryEvent = require('../../../src/models/memory-event');
const MemoryRetrievalService = require('../../../src/services/memory-retrieval-service');

describe('MemoryRetrievalService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('getStatus() 应暴露 embedding 状态和 ranking version', () => {
        const embeddingService = {
            getStatus: jest.fn(() => ({
                mode: 'openai-compatible',
                provider: 'openai',
                model: 'text-embedding-3-small',
                degraded: false
            })),
            embedText: jest.fn()
        };

        const service = new MemoryRetrievalService({ embeddingService });

        expect(service.getStatus()).toEqual({
            enabled: true,
            embedding: {
                mode: 'openai-compatible',
                provider: 'openai',
                model: 'text-embedding-3-small',
                degraded: false
            },
            rankingVersion: 'v1-rule-based'
        });
    });

    it('searchRelevantEvents() 应使用 embedding + 关键词检索后做 rule-based rerank', async () => {
        const embeddingService = {
            getStatus: jest.fn(() => ({ mode: 'deterministic' })),
            embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
        };
        MemoryEvent.searchHybrid.mockResolvedValue([
            {
                id: 'event-old',
                event_type: 'commitment',
                title: '旧的显化日记承诺',
                final_score: 0.82,
                vector_score: 0.6,
                keyword_score: 0.8,
                importance: 0.98,
                confidence: 0.98,
                happened_at: '2025-12-01T08:00:00.000Z',
                created_at: '2025-12-01T08:00:00.000Z'
            },
            {
                id: 'event-recent',
                event_type: 'commitment',
                title: '最近重启显化日记',
                final_score: 0.82,
                vector_score: 0.61,
                keyword_score: 0.8,
                importance: 0.75,
                confidence: 0.85,
                happened_at: '2026-04-13T08:00:00.000Z',
                created_at: '2026-04-13T08:00:00.000Z'
            }
        ]);

        const service = new MemoryRetrievalService({ embeddingService });
        const rows = await service.searchRelevantEvents({
            userId: '11111111-1111-4111-8111-111111111111',
            queryText: '我最近重新开始写显化日记',
            limit: 2
        });

        expect(embeddingService.embedText).toHaveBeenCalledWith('我最近重新开始写显化日记');
        expect(MemoryEvent.searchHybrid).toHaveBeenCalledWith(expect.objectContaining({
            userId: '11111111-1111-4111-8111-111111111111',
            queryText: '我最近重新开始写显化日记',
            queryEmbedding: [0.1, 0.2, 0.3],
            vectorWeight: 0.7,
            keywordWeight: 0.3,
            minScore: 0.15,
            limit: 10
        }));
        expect(MemoryEvent.markManyRecalled).toHaveBeenCalledWith(['event-recent', 'event-old'], expect.any(Date));
        expect(rows.map((row) => row.id)).toEqual(['event-recent', 'event-old']);
        expect(rows[0]).toEqual(expect.objectContaining({
            memory_ranking_version: 'v1-rule-based',
            memory_retrieval_strategy: 'hybrid-rerank',
            rank_position: 1
        }));
        expect(rows[0].rerank_score).toBeGreaterThan(rows[1].rerank_score);
    });

    it('rerankEvents() 应按业务规则加权并去重重复事件', () => {
        const service = new MemoryRetrievalService({
            embeddingService: {
                getStatus: jest.fn(() => ({ mode: 'deterministic' })),
                embedText: jest.fn()
            }
        });

        const rows = service.rerankEvents([
            {
                id: 'duplicate-low',
                event_type: 'commitment',
                title: '开始晨间复盘',
                summary: '用户承诺连续 7 天晨间复盘',
                final_score: 0.42,
                importance: 0.5,
                confidence: 0.5,
                happened_at: '2026-04-01T08:00:00.000Z'
            },
            {
                id: 'duplicate-high',
                event_type: 'commitment',
                title: '开始晨间复盘',
                summary: '用户承诺连续 7 天晨间复盘',
                final_score: 0.62,
                importance: 0.5,
                confidence: 0.5,
                happened_at: '2026-04-12T08:00:00.000Z'
            },
            {
                id: 'preference-1',
                event_type: 'preference_signal',
                title: '偏好温柔直接的提醒方式',
                summary: '用户更喜欢温柔但直接的反馈。',
                final_score: 0.6,
                importance: 0.7,
                confidence: 0.9,
                happened_at: '2026-04-13T08:00:00.000Z'
            }
        ], {
            queryText: '提醒我时说话方式温柔一点',
            limit: 5,
            now: '2026-04-16T08:00:00.000Z'
        });

        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.id)).toEqual(['preference-1', 'duplicate-high']);
        expect(rows[0]).toEqual(expect.objectContaining({
            event_type_boost: 0.95,
            rank_position: 1
        }));
        expect(rows[1]).toEqual(expect.objectContaining({
            id: 'duplicate-high',
            rank_position: 2
        }));
    });

    it('searchRelevantEvents() 应在 embedding 失败时退回关键词检索', async () => {
        const embeddingService = {
            getStatus: jest.fn(() => ({ mode: 'deterministic' })),
            embedText: jest.fn().mockRejectedValue(new Error('embedding failed'))
        };
        MemoryEvent.searchHybrid.mockResolvedValue([{ id: 'event-2', title: '拖延模式', final_score: 0.4 }]);

        const service = new MemoryRetrievalService({ embeddingService });
        const rows = await service.searchRelevantEvents({
            userId: '11111111-1111-4111-8111-111111111111',
            queryText: '拖延模式'
        });

        expect(MemoryEvent.searchHybrid).toHaveBeenCalledWith(expect.objectContaining({
            queryEmbedding: null,
            vectorWeight: 0,
            keywordWeight: 1,
            minScore: 0.2
        }));
        expect(rows[0]).toEqual(expect.objectContaining({
            id: 'event-2',
            memory_retrieval_strategy: 'keyword-rerank'
        }));
    });

    it('searchRelevantEvents() 应在 recall 计数更新失败时仍返回检索结果', async () => {
        const embeddingService = {
            getStatus: jest.fn(() => ({ mode: 'deterministic' })),
            embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
        };
        MemoryEvent.searchHybrid.mockResolvedValue([{ id: 'event-3', title: '拖延模式', final_score: 0.7 }]);
        MemoryEvent.markManyRecalled.mockRejectedValue(new Error('update failed'));

        const service = new MemoryRetrievalService({ embeddingService });
        const rows = await service.searchRelevantEvents({
            userId: '11111111-1111-4111-8111-111111111111',
            queryText: '拖延模式'
        });

        expect(MemoryEvent.markManyRecalled).toHaveBeenCalledWith(['event-3'], expect.any(Date));
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe('event-3');
    });

    it('searchRelevantEvents() 应在 searchHybrid 失败时降级为空结果', async () => {
        const embeddingService = {
            getStatus: jest.fn(() => ({ mode: 'openai-compatible' })),
            embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
        };
        MemoryEvent.searchHybrid.mockRejectedValue(new Error('db unavailable'));

        const service = new MemoryRetrievalService({ embeddingService });
        const rows = await service.searchRelevantEvents({
            userId: '11111111-1111-4111-8111-111111111111',
            queryText: '拖延模式'
        });

        expect(rows).toEqual([]);
        expect(MemoryEvent.markManyRecalled).not.toHaveBeenCalled();
    });

    it('buildPromptBlock() 应复用模型能力', () => {
        const service = new MemoryRetrievalService({
            embeddingService: {
                getStatus: jest.fn(() => ({ mode: 'deterministic' })),
                embedText: jest.fn()
            }
        });

        const block = service.buildPromptBlock([{ id: 'event-1' }], 2);

        expect(MemoryEvent.buildPromptBlock).toHaveBeenCalledWith([{ id: 'event-1' }], 2);
        expect(block).toBe('prompt block');
    });
});
