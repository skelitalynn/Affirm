jest.mock('../../../src/db/connection', () => ({
    db: {
        query: jest.fn()
    }
}));

jest.mock('../../../src/services/rag/knowledge-vector-store', () => ({
    addKnowledge: jest.fn(),
    addKnowledgeBatch: jest.fn(),
    similaritySearch: jest.fn(),
    embedText: jest.fn(),
    toVectorSql: jest.fn(),
    buildMetadata: jest.fn()
}));

jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    randomUUID: jest.fn()
}));

const { db } = require('../../../src/db/connection');
const knowledgeVectorStore = require('../../../src/services/rag/knowledge-vector-store');
const { randomUUID } = require('crypto');
const Knowledge = require('../../../src/models/knowledge');

describe('Knowledge Model', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createBatch()', () => {
        it('应返回详细的批量执行结果（含部分失败）', async () => {
            randomUUID
                .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
                .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
            knowledgeVectorStore.addKnowledgeBatch.mockResolvedValue([
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222'
            ]);
            db.query.mockResolvedValue({
                rows: [
                    { id: '11111111-1111-4111-8111-111111111111', content: 'a' },
                    { id: '22222222-2222-4222-8222-222222222222', content: 'c' }
                ]
            });

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
            expect(result.failureCount).toBe(1);
            expect(result.successfulItems).toHaveLength(2);
            expect(result.failedItems).toHaveLength(1);
            expect(result.failedItems[0].error).toBe('User ID 必须是有效 UUID');
        });
    });

    describe('semanticSearch()', () => {
        it('应通过 LangChain vector store 搜索并按阈值过滤', async () => {
            knowledgeVectorStore.similaritySearch.mockResolvedValue([
                {
                    id: 'k1',
                    content: 'match',
                    metadata: { source: 'kb', user_id: 'user-1' },
                    similarity: 0.91
                },
                {
                    id: 'k2',
                    content: 'low score',
                    metadata: { source: 'kb', user_id: 'user-1' },
                    similarity: 0.52
                }
            ]);
            db.query.mockResolvedValue({
                rows: [{ id: 'k1', content: 'match', source: 'kb', user_id: 'user-1' }]
            });

            const rows = await Knowledge.semanticSearch('test query', 'user-1', 5, 0.6);

            expect(knowledgeVectorStore.similaritySearch).toHaveBeenCalledWith('test query', {
                limit: 5,
                filter: { user_id: 'user-1' }
            });
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE id = ANY($1::uuid[])'),
                [['k1']]
            );
            expect(rows).toEqual([
                {
                    id: 'k1',
                    content: 'match',
                    source: 'kb',
                    user_id: 'user-1',
                    similarity: 0.91
                }
            ]);
        });

        it('检索失败时应直接返回空数组', async () => {
            knowledgeVectorStore.similaritySearch.mockRejectedValue(new Error('vector store offline'));

            const rows = await Knowledge.semanticSearch('test query', 'user-1', 5, 0.6);

            expect(rows).toEqual([]);
            expect(db.query).not.toHaveBeenCalled();
        });
    });

    describe('update()', () => {
        it('更新内容时应重建 metadata 并重算 embedding', async () => {
            knowledgeVectorStore.buildMetadata.mockReturnValue({
                source: 'admin',
                user_id: '11111111-1111-4111-8111-111111111111',
                scope: 'user',
                created_by: 'admin'
            });
            knowledgeVectorStore.embedText.mockResolvedValue([0.3, 0.4]);
            knowledgeVectorStore.toVectorSql.mockReturnValue('[0.3,0.4]');

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
                    rows: [{ id: 'k1', content: 'updated content' }]
                });

            await Knowledge.update('k1', { content: 'updated content' });

            expect(knowledgeVectorStore.buildMetadata).toHaveBeenCalledWith({
                user_id: '11111111-1111-4111-8111-111111111111',
                source: 'admin',
                metadata: { created_by: 'admin' }
            });
            expect(knowledgeVectorStore.embedText).toHaveBeenCalledWith('updated content');
            expect(knowledgeVectorStore.toVectorSql).toHaveBeenCalledWith([0.3, 0.4]);
            expect(db.query).toHaveBeenLastCalledWith(
                expect.stringContaining('embedding = $3::vector'),
                ['updated content', JSON.stringify({
                    source: 'admin',
                    user_id: '11111111-1111-4111-8111-111111111111',
                    scope: 'user',
                    created_by: 'admin'
                }), '[0.3,0.4]', 'k1']
            );
        });
    });

    describe('create()', () => {
        it('应通过 LangChain vector store 写入单条知识', async () => {
            randomUUID.mockReturnValue('11111111-1111-4111-8111-111111111111');
            knowledgeVectorStore.addKnowledge.mockResolvedValue();
            db.query.mockResolvedValue({
                rows: [{
                    id: '11111111-1111-4111-8111-111111111111',
                    content: 'admin knowledge content',
                    source: 'admin'
                }]
            });

            const row = await Knowledge.create({
                content: 'admin knowledge content',
                source: 'admin'
            });

            expect(knowledgeVectorStore.addKnowledge).toHaveBeenCalledWith({
                id: '11111111-1111-4111-8111-111111111111',
                user_id: null,
                content: 'admin knowledge content',
                source: 'admin',
                metadata: {}
            });
            expect(row.id).toBe('11111111-1111-4111-8111-111111111111');
        });
    });
});
