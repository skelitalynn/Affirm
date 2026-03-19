const chunkingService = require('../../../src/services/chunking');

describe('ChunkingService', () => {
    describe('splitText()', () => {
        it('应该按空行切段并合并过短段落', () => {
            const text = [
                '第一段很短。',
                '',
                '第二段也不长，但应该和第一段合并，避免产生过碎的 chunk。',
                '',
                '第三段已经足够长，可以作为新的片段。'
            ].join('\n');

            const chunks = chunkingService.splitText(text, {
                maxChars: 80,
                minChars: 30,
                overlap: 10
            });

            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks.join('\n')).toContain('第一段很短');
            expect(chunks.join('\n')).toContain('第二段也不长');
        });

        it('应该对超长文本进行带重叠的切片', () => {
            const text = '0123456789'.repeat(20);
            const chunks = chunkingService.splitText(text, {
                maxChars: 50,
                minChars: 20,
                overlap: 10
            });

            expect(chunks.length).toBeGreaterThan(1);
            expect(chunks[0].length).toBeLessThanOrEqual(50);
            expect(chunks[1].startsWith(chunks[0].slice(-10))).toBe(true);
        });

        it('空文本应返回空数组', () => {
            expect(chunkingService.splitText('   ')).toEqual([]);
        });
    });

    describe('buildKnowledgeItems()', () => {
        it('应该构建可直接入库的知识片段', () => {
            const items = chunkingService.buildKnowledgeItems({
                userId: 'test-user-id',
                source: 'admin-import',
                text: '第一段内容。\n\n第二段内容。',
                options: {
                    maxChars: 30,
                    minChars: 10,
                    overlap: 5
                }
            });

            expect(items.length).toBeGreaterThan(0);
            expect(items.every((item) => item.user_id === 'test-user-id')).toBe(true);
            expect(items.every((item) => item.source === 'admin-import')).toBe(true);
            expect(items.every((item) => typeof item.content === 'string' && item.content.length > 0)).toBe(true);
        });
    });
});
