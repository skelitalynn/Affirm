jest.mock('../../../src/models/memory-event', () => ({
    create: jest.fn(),
    buildSearchText: jest.fn((candidate) => `${candidate.title}\n${candidate.summary}`),
    buildPromptBlock: jest.fn(() => 'prompt block')
}));

const MemoryEvent = require('../../../src/models/memory-event');
const MemoryEventService = require('../../../src/services/memory-event-service');

describe('MemoryEventService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('saveCandidates() 应过滤无效候选并写入有效事件', async () => {
        MemoryEvent.create
            .mockResolvedValueOnce({ id: 'event-1' })
            .mockResolvedValueOnce({ id: 'event-2' });
        const embeddingService = {
            embedTexts: jest.fn().mockResolvedValue([
                [0.11, 0.22],
                [0.33, 0.44]
            ])
        };

        const service = new MemoryEventService({ embeddingService });
        const rows = await service.saveCandidates({
            userId: '11111111-1111-4111-8111-111111111111',
            sourceMessageIds: ['22222222-2222-4222-8222-222222222222'],
            metadata: { trace_id: 'trace-1' },
            candidates: [
                {
                    event_type: 'commitment',
                    title: '开始晨间复盘',
                    summary: '用户承诺连续 7 天晨间复盘',
                    importance: 0.9,
                    confidence: 0.8
                },
                {
                    event_type: 'setback',
                    title: '情绪失控',
                    summary: '这次只是当天一次性情绪波动',
                    importance: 0.2,
                    confidence: 0.2
                },
                {
                    event_type: 'preference_signal',
                    title: '偏好更直接的反馈',
                    summary: '用户明确说希望建议更直接',
                    keywords: ['直接反馈'],
                    importance: 0.6,
                    confidence: 0.9
                },
                {
                    event_type: '',
                    title: '无效候选',
                    summary: '不会写入'
                }
            ]
        });

        expect(MemoryEvent.create).toHaveBeenCalledTimes(2);
        expect(MemoryEvent.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                user_id: '11111111-1111-4111-8111-111111111111',
                event_type: 'commitment',
                embedding: [0.11, 0.22],
                source_message_ids: ['22222222-2222-4222-8222-222222222222'],
                metadata: { trace_id: 'trace-1' }
            })
        );
        expect(embeddingService.embedTexts).toHaveBeenCalledWith([
            '开始晨间复盘\n用户承诺连续 7 天晨间复盘',
            '偏好更直接的反馈\n用户明确说希望建议更直接'
        ]);
        expect(rows).toEqual([{ id: 'event-1' }, { id: 'event-2' }]);
    });

    it('saveCandidates() 应在 embedding 失败时继续写入无向量事件', async () => {
        MemoryEvent.create.mockResolvedValue({ id: 'event-1' });
        const embeddingService = {
            embedTexts: jest.fn().mockRejectedValue(new Error('embedding failed'))
        };

        const service = new MemoryEventService({ embeddingService });
        const rows = await service.saveCandidates({
            userId: '11111111-1111-4111-8111-111111111111',
            candidates: [
                {
                    event_type: 'commitment',
                    title: '开始晨间复盘',
                    summary: '用户承诺连续 7 天晨间复盘',
                    importance: 0.9,
                    confidence: 0.8
                }
            ]
        });

        expect(MemoryEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            embedding: null
        }));
        expect(rows).toEqual([{ id: 'event-1' }]);
    });

    it('saveCandidates() 应优先使用候选自带 source_message_ids 并合并 metadata', async () => {
        MemoryEvent.create.mockResolvedValue({ id: 'event-3' });
        const embeddingService = {
            embedTexts: jest.fn().mockResolvedValue([[0.55, 0.77]])
        };

        const service = new MemoryEventService({ embeddingService });
        const rows = await service.saveCandidates({
            userId: '11111111-1111-4111-8111-111111111111',
            sourceMessageIds: ['22222222-2222-4222-8222-222222222222'],
            metadata: { trace_id: 'trace-3', source: 'memory-service' },
            candidates: [
                {
                    event_type: 'commitment',
                    title: '开始晨间复盘',
                    summary: '用户承诺连续 7 天晨间复盘',
                    source_message_ids: ['33333333-3333-4333-8333-333333333333'],
                    metadata: { fixture_id: 'candidate-1' },
                    importance: 0.9,
                    confidence: 0.8
                }
            ]
        });

        expect(MemoryEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            source_message_ids: ['33333333-3333-4333-8333-333333333333'],
            metadata: {
                trace_id: 'trace-3',
                source: 'memory-service',
                fixture_id: 'candidate-1'
            },
            embedding: [0.55, 0.77]
        }));
        expect(rows).toEqual([{ id: 'event-3' }]);
    });

    it('buildPromptBlock() 应复用模型的格式化能力', () => {
        const service = new MemoryEventService();
        const block = service.buildPromptBlock([{ id: 'event-1' }], 3);

        expect(MemoryEvent.buildPromptBlock).toHaveBeenCalledWith([{ id: 'event-1' }], 3);
        expect(block).toBe('prompt block');
    });
});
