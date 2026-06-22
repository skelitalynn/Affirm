const mockQuery = jest.fn();
const mockTransaction = jest.fn(async (callback) => callback({ query: mockQuery }));

jest.mock('../../../src/db/connection', () => ({
    db: {
        query: mockQuery,
        transaction: mockTransaction
    }
}));

const { db } = require('../../../src/db/connection');
const MemoryEvent = require('../../../src/models/memory-event');

describe('MemoryEvent Model', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const sourceMessageId = '22222222-2222-4222-8222-222222222222';
    const sourceId = '33333333-3333-4333-8333-333333333333';
    const targetId = '44444444-4444-4444-8444-444444444444';
    const targetMessageId = '55555555-5555-4555-8555-555555555555';

    beforeEach(() => {
        jest.clearAllMocks();
        db.transaction.mockImplementation(async (callback) => callback({ query: db.query }));
    });

    it('create() 应规范化事件内容并写入数据库治理默认值', async () => {
        db.query.mockResolvedValue({
            rows: [{
                id: 'event-1',
                user_id: userId,
                event_type: 'commitment',
                title: '开始晨间复盘',
                summary: '用户承诺连续 7 天做晨间复盘',
                status: 'active',
                review_status: 'pending'
            }]
        });

        const row = await MemoryEvent.create({
            user_id: userId,
            event_type: 'commitment',
            title: ' 开始晨间复盘 ',
            summary: ' 用户承诺连续 7 天做晨间复盘 ',
            detail: '她说想先从 10 分钟开始。',
            keywords: ['晨间复盘', '习惯', '习惯'],
            source_message_ids: [sourceMessageId, sourceMessageId],
            importance: 0.92,
            confidence: 0.8,
            metadata: { trace_id: 'trace-1' }
        });

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO memory_events'),
            expect.arrayContaining([
                userId,
                'commitment',
                '开始晨间复盘',
                '用户承诺连续 7 天做晨间复盘',
                '她说想先从 10 分钟开始。',
                ['晨间复盘', '习惯'],
                [sourceMessageId],
                0.92,
                0.8,
                'active',
                'pending',
                JSON.stringify({ trace_id: 'trace-1' })
            ])
        );
        expect(row.status).toBe('active');
        expect(row.review_status).toBe('pending');
    });

    it('findByUserId() 应支持按用户读取最近事件', async () => {
        db.query.mockResolvedValue({
            rows: [{ id: 'event-1' }, { id: 'event-2' }]
        });

        const rows = await MemoryEvent.findByUserId(
            userId,
            {
                eventType: 'breakthrough',
                status: 'active',
                limit: 5,
                offset: 2
            }
        );

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('status = $3'),
            [userId, 'breakthrough', 'active', 5, 2]
        );
        expect(rows).toHaveLength(2);
    });

    it('markRecalled() 应更新召回次数和最后召回时间', async () => {
        db.query.mockResolvedValue({
            rows: [{
                id: 'event-1',
                recall_count: 3
            }]
        });

        const row = await MemoryEvent.markRecalled('event-1', '2026-04-15T08:00:00.000Z');

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('recall_count = recall_count + 1'),
            ['2026-04-15T08:00:00.000Z', 'event-1']
        );
        expect(row.recall_count).toBe(3);
    });

    it('markManyRecalled() 应批量更新召回次数和最后召回时间', async () => {
        db.query.mockResolvedValue({
            rows: [{ id: 'event-1' }, { id: 'event-2' }]
        });

        const rows = await MemoryEvent.markManyRecalled([
            userId,
            sourceMessageId
        ], '2026-04-15T08:30:00.000Z');

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('WHERE id = ANY($2::uuid[])'),
            [
                '2026-04-15T08:30:00.000Z',
                [userId, sourceMessageId]
            ]
        );
        expect(rows).toEqual([{ id: 'event-1' }, { id: 'event-2' }]);
    });

    it('searchHybrid() 应只检索 active 且未合并的 memory_events', async () => {
        db.query.mockResolvedValue({
            rows: [{
                id: 'event-1',
                final_score: 0.71
            }]
        });

        const rows = await MemoryEvent.searchHybrid({
            userId,
            queryText: '晨间复盘 承诺',
            queryEmbedding: [0.1, 0.2, 0.3],
            queryTerms: ['晨间复盘', '承诺'],
            limit: 4,
            eventTypes: ['commitment'],
            vectorWeight: 0.7,
            keywordWeight: 0.3,
            minScore: 0.15
        });

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("AND me.status = 'active'"),
            [
                userId,
                '[0.1,0.2,0.3]',
                '晨间复盘 承诺',
                ['晨间复盘', '承诺'],
                0.7,
                0.3,
                0.15,
                ['commitment'],
                4
            ]
        );
        expect(db.query.mock.calls[0][0]).toContain('me.merged_into_event_id IS NULL');
        expect(rows).toEqual([{ id: 'event-1', final_score: 0.71 }]);
    });

    it('mergeInto() 应标记 source 为 merged 并更新 canonical event 元数据', async () => {
        db.query
            .mockResolvedValueOnce({
                rows: [{
                    id: sourceId,
                    user_id: userId,
                    keywords: ['重复', '晨间复盘'],
                    source_message_ids: [sourceMessageId],
                    importance: 0.8,
                    confidence: 0.85,
                    status: 'active',
                    metadata: {}
                }]
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: targetId,
                    user_id: userId,
                    keywords: ['晨间复盘'],
                    source_message_ids: [targetMessageId],
                    importance: 0.92,
                    confidence: 0.78,
                    status: 'active',
                    metadata: {
                        governance: {
                            merged_from_event_ids: ['66666666-6666-4666-8666-666666666666']
                        }
                    }
                }]
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: targetId,
                    keywords: ['晨间复盘', '重复'],
                    source_message_ids: [targetMessageId, sourceMessageId],
                    importance: 0.92,
                    confidence: 0.85,
                    metadata: {
                        governance: {
                            merged_from_event_ids: ['66666666-6666-4666-8666-666666666666', sourceId]
                        }
                    }
                }]
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: sourceId,
                    status: 'merged',
                    review_status: 'verified',
                    merged_into_event_id: targetId
                }]
            });

        const result = await MemoryEvent.mergeInto(sourceId, targetId, {
            actor: 'admin',
            reason: 'duplicate_event'
        });

        expect(db.transaction).toHaveBeenCalled();
        expect(db.query).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('FOR UPDATE'),
            [sourceId]
        );
        expect(db.query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('FOR UPDATE'),
            [targetId]
        );
        expect(db.query.mock.calls[2][1][0]).toEqual(['晨间复盘', '重复']);
        expect(db.query.mock.calls[2][1][1]).toEqual([targetMessageId, sourceMessageId]);
        expect(result.target.metadata.governance.merged_from_event_ids).toEqual([
            '66666666-6666-4666-8666-666666666666',
            sourceId
        ]);
        expect(result.source.status).toBe('merged');
        expect(result.source.merged_into_event_id).toBe(targetId);
    });

    it('buildSearchText() 应组合标题、摘要、详情和关键词', () => {
        const text = MemoryEvent.buildSearchText({
            title: '开始晨间复盘',
            summary: '用户承诺连续 7 天晨间复盘',
            detail: '先从 10 分钟开始。',
            keywords: ['晨间复盘', '习惯']
        });

        expect(text).toContain('开始晨间复盘');
        expect(text).toContain('用户承诺连续 7 天晨间复盘');
        expect(text).toContain('先从 10 分钟开始。');
        expect(text).toContain('晨间复盘 习惯');
    });
});
