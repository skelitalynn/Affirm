const embeddingService = require('../../../src/services/embedding');

describe('EmbeddingService', () => {
    let originalOpenai;
    let originalDimensions;

    beforeEach(() => {
        originalOpenai = embeddingService.openai;
        originalDimensions = embeddingService.dimensions;
    });

    afterEach(() => {
        embeddingService.openai = originalOpenai;
        embeddingService.dimensions = originalDimensions;
        jest.restoreAllMocks();
    });

    describe('generateEmbeddings()', () => {
        it('embedding 不可用时返回与输入等长的 null 数组', async () => {
            embeddingService.openai = null;

            const result = await embeddingService.generateEmbeddings(['a', '', 'b']);

            expect(result).toEqual([null, null, null]);
        });

        it('应保持输出与输入索引对齐（空文本位置为 null）', async () => {
            embeddingService.dimensions = 2;
            embeddingService.openai = {
                embeddings: {
                    create: jest.fn().mockResolvedValue({
                        data: [
                            { embedding: [0.1, 0.2] },
                            { embedding: [0.3, 0.4] }
                        ]
                    })
                }
            };

            const result = await embeddingService.generateEmbeddings(['first', '   ', 'second']);

            expect(result).toEqual([[0.1, 0.2], null, [0.3, 0.4]]);
            expect(embeddingService.openai.embeddings.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: ['first', 'second']
                })
            );
        });
    });
});
