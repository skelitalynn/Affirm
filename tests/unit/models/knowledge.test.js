jest.mock('../../../src/db/connection', () => ({
    db: {
        query: jest.fn()
    }
}));

jest.mock('../../../src/services/embedding', () => ({
    generateEmbedding: jest.fn(),
    toVectorSql: jest.fn()
}));

const { db } = require('../../../src/db/connection');
const embeddingService = require('../../../src/services/embedding');
const Knowledge = require('../../../src/models/knowledge');

describe('Knowledge Model', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createBatch()', () => {
        it('应返回详细的批量执行结果（含部分失败）', async () => {
            const createSpy = jest.spyOn(Knowledge, 'create')
                .mockResolvedValueOnce({ id: 'k1' })
                .mockRejectedValueOnce(new Error('invalid uuid'))
                .mockResolvedValueOnce({ id: 'k3' });

            const result = await Knowledge.createBatch(
                [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
                { detailed: true }
            );

            expect(result.total).toBe(3);
            expect(result.successCount).toBe(2);
            expect(result.failureCount).toBe(1);
            expect(result.successfulItems).toHaveLength(2);
            expect(result.failedItems).toHaveLength(1);
            expect(result.failedItems[0].error).toBe('invalid uuid');

            createSpy.mockRestore();
        });
    });

    describe('semanticSearch()', () => {
        it('应使用 pgvector SQL 字符串查询', async () => {
            embeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
            embeddingService.toVectorSql.mockReturnValue('[0.1,0.2]');
            db.query.mockResolvedValue({ rows: [{ id: 'k1', similarity: 0.9 }] });

            const rows = await Knowledge.semanticSearch('test query', 'user-1', 5, 0.6);

            expect(embeddingService.toVectorSql).toHaveBeenCalledWith([0.1, 0.2]);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('embedding IS NOT NULL'),
                ['[0.1,0.2]', 'user-1', 0.6, 5]
            );
            expect(rows).toHaveLength(1);
        });

        it('embedding 不可用时应直接返回空数组', async () => {
            embeddingService.generateEmbedding.mockResolvedValue(null);

            const rows = await Knowledge.semanticSearch('test query', 'user-1', 5, 0.6);

            expect(rows).toEqual([]);
            expect(db.query).not.toHaveBeenCalled();
        });
    });

    describe('update()', () => {
        it('更新内容时应把 embedding 转为 vector SQL 字符串', async () => {
            embeddingService.generateEmbedding.mockResolvedValue([0.3, 0.4]);
            embeddingService.toVectorSql.mockReturnValue('[0.3,0.4]');
            db.query.mockResolvedValue({
                rows: [{ id: 'k1', content: 'updated content' }]
            });

            await Knowledge.update('k1', { content: 'updated content' });

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('embedding = $2::vector'),
                ['updated content', '[0.3,0.4]', 'k1']
            );
        });
    });
});
