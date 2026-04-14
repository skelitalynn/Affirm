jest.mock('../../../src/db/connection', () => ({
    db: {
        query: jest.fn()
    }
}));

jest.mock('../../../src/services/rag/provider', () => ({
    isConfigured: jest.fn(),
    upsertKnowledge: jest.fn(),
    deleteKnowledge: jest.fn(),
    searchKnowledge: jest.fn()
}));

jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    randomUUID: jest.fn()
}));

const { db } = require('../../../src/db/connection');
const ragProvider = require('../../../src/services/rag/provider');
const { randomUUID } = require('crypto');
const Knowledge = require('../../../src/models/knowledge');

describe('Knowledge Model', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ragProvider.isConfigured.mockReturnValue(true);
    });

    describe('createBatch()', () => {
        it('应返回详细的批量执行结果（含部分失败）', async () => {
            randomUUID
                .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
                .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');

            db.query
                .mockResolvedValueOnce({
                    rows: [{
                        id: '11111111-1111-4111-8111-111111111111',
                        user_id: null,
                        content: 'a',
                        source: 'user_input',
                        metadata: {}
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: '22222222-2222-4222-8222-222222222222',
                        user_id: null,
                        content: 'c',
                        source: 'user_input',
                        metadata: {}
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: '11111111-1111-4111-8111-111111111111',
                        user_id: null,
                        content: 'a',
                        source: 'user_input',
                        metadata: { rag_sync: { status: 'synced' } }
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: '22222222-2222-4222-8222-222222222222',
                        user_id: null,
                        content: 'c',
                        source: 'user_input',
                        metadata: { rag_sync: { status: 'synced' } }
                    }]
                });
            ragProvider.upsertKnowledge.mockResolvedValue({ count: 2 });

            const result = await Knowledge.createBatch(
                [
                    { content: 'a' },
                    { content: 'b', user_id: 'invalid-uuid' },
                    { content: 'c' }
                ],
                { detailed: true }
            );

            expect(result.total).toBe(3);
            expect(result.successCount).toBe(2);
            expect(result.pendingCount).toBe(0);
            expect(result.failureCount).toBe(1);
            expect(result.successfulItems).toHaveLength(2);
            expect(result.failedItems).toHaveLength(1);
            expect(result.failedItems[0].error).toBe('User ID 必须是有效 UUID');
            expect(ragProvider.upsertKnowledge).toHaveBeenCalledTimes(1);
        });
    });

    describe('semanticSearch()', () => {
        it('应通过 Haystack 搜索并按阈值过滤', async () => {
            ragProvider.searchKnowledge.mockResolvedValue([
                {
                    id: '11111111-1111-4111-8111-111111111111',
                    content: 'match',
                    metadata: { source: 'kb', user_id: 'user-1' },
                    similarity: 0.91
                },
                {
                    id: '22222222-2222-4222-8222-222222222222',
                    content: 'low score',
                    metadata: { source: 'kb', user_id: 'user-1' },
                    similarity: 0.52
                }
            ]);
            db.query.mockResolvedValue({
                rows: [{
                    id: '11111111-1111-4111-8111-111111111111',
                    content: 'match',
                    source: 'kb',
                    user_id: 'user-1'
                }]
            });

            const rows = await Knowledge.semanticSearch('test query', 'user-1', 5, 0.6);

            expect(ragProvider.searchKnowledge).toHaveBeenCalledWith('test query', {
                userId: 'user-1',
                limit: 5,
                similarityThreshold: 0.6
            });
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE id = ANY($1::uuid[])'),
                [['11111111-1111-4111-8111-111111111111']]
            );
            expect(rows).toEqual([
                {
                    id: '11111111-1111-4111-8111-111111111111',
                    content: 'match',
                    source: 'kb',
                    user_id: 'user-1',
                    similarity: 0.91
                }
            ]);
        });

        it('检索失败时应直接返回空数组', async () => {
            ragProvider.searchKnowledge.mockRejectedValue(new Error('haystack offline'));

            const rows = await Knowledge.semanticSearch('test query', 'user-1', 5, 0.6);

            expect(rows).toEqual([]);
            expect(db.query).not.toHaveBeenCalled();
        });
    });

    describe('update()', () => {
        it('更新内容后应重新同步到 Haystack', async () => {
            db.query
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'k1',
                        content: 'old content',
                        source: 'admin',
                        user_id: '11111111-1111-4111-8111-111111111111',
                        metadata: { created_by: 'admin' }
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'k1',
                        content: 'updated content',
                        source: 'admin',
                        user_id: '11111111-1111-4111-8111-111111111111',
                        metadata: { created_by: 'admin', rag_sync: { status: 'pending' } }
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'k1',
                        content: 'updated content',
                        source: 'admin',
                        user_id: '11111111-1111-4111-8111-111111111111',
                        metadata: { created_by: 'admin', rag_sync: { status: 'synced' } }
                    }]
                });
            ragProvider.upsertKnowledge.mockResolvedValue({ count: 1 });

            const row = await Knowledge.update('k1', { content: 'updated content' });

            expect(ragProvider.upsertKnowledge).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: 'k1',
                    content: 'updated content',
                    metadata: expect.objectContaining({
                        source: 'admin',
                        scope: 'user',
                        user_id: '11111111-1111-4111-8111-111111111111'
                    })
                })
            ]);
            expect(db.query).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('embedding = NULL'),
                expect.arrayContaining([
                    '11111111-1111-4111-8111-111111111111',
                    'updated content',
                    'admin',
                    expect.any(String),
                    'k1'
                ])
            );
            expect(row.metadata.rag_sync.status).toBe('synced');
        });
    });

    describe('create()', () => {
        it('应写入本地并同步到 Haystack', async () => {
            randomUUID.mockReturnValue('11111111-1111-4111-8111-111111111111');
            db.query
                .mockResolvedValueOnce({
                    rows: [{
                        id: '11111111-1111-4111-8111-111111111111',
                        user_id: null,
                        content: 'admin knowledge content',
                        source: 'admin',
                        metadata: { rag_sync: { status: 'pending' } }
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: '11111111-1111-4111-8111-111111111111',
                        user_id: null,
                        content: 'admin knowledge content',
                        source: 'admin',
                        metadata: { rag_sync: { status: 'synced' } }
                    }]
                });
            ragProvider.upsertKnowledge.mockResolvedValue({ count: 1 });

            const row = await Knowledge.create({
                content: 'admin knowledge content',
                source: 'admin'
            });

            expect(ragProvider.upsertKnowledge).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: '11111111-1111-4111-8111-111111111111',
                    content: 'admin knowledge content',
                    metadata: expect.objectContaining({
                        source: 'admin',
                        scope: 'global'
                    })
                })
            ]);
            expect(row.id).toBe('11111111-1111-4111-8111-111111111111');
            expect(row.metadata.rag_sync.status).toBe('synced');
        });

        it('Haystack 未配置时应保留 pending 状态', async () => {
            randomUUID.mockReturnValue('11111111-1111-4111-8111-111111111111');
            ragProvider.isConfigured.mockReturnValue(false);
            db.query
                .mockResolvedValueOnce({
                    rows: [{
                        id: '11111111-1111-4111-8111-111111111111',
                        user_id: null,
                        content: 'admin knowledge content',
                        source: 'admin',
                        metadata: { rag_sync: { status: 'pending' } }
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        id: '11111111-1111-4111-8111-111111111111',
                        user_id: null,
                        content: 'admin knowledge content',
                        source: 'admin',
                        metadata: {
                            rag_sync: {
                                status: 'pending',
                                last_error: 'Haystack 未配置'
                            }
                        }
                    }]
                });

            const row = await Knowledge.create({
                content: 'admin knowledge content',
                source: 'admin'
            });

            expect(ragProvider.upsertKnowledge).not.toHaveBeenCalled();
            expect(row.metadata.rag_sync.status).toBe('pending');
        });
    });
});
