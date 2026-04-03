const User = require('../../src/models/user');
const { db } = require('../../src/db/connection');

describe('knowledge_chunks metadata sync', () => {
    let testUserId;
    let testTelegramId;
    const insertedIds = [];

    beforeAll(async () => {
        testTelegramId = Date.now() + 1000;
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'knowledge_metadata_sync_test_user'
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        if (insertedIds.length > 0) {
            await db.query('DELETE FROM knowledge_chunks WHERE id = ANY($1::uuid[])', [insertedIds]);
        }

        await User.delete(testTelegramId);
    });

    it('应把 LangChain 风格 metadata 写入同步回 source 和 user_id 列', async () => {
        const result = await db.query(`
            INSERT INTO knowledge_chunks (content, embedding, metadata)
            VALUES ($1, $2, $3::jsonb)
            RETURNING id, user_id, source, metadata
        `, [
            `langchain metadata sync probe ${Date.now()}`,
            null,
            JSON.stringify({
                source: 'langchain-sync-test',
                user_id: testUserId,
                import_batch: 'batch-001'
            })
        ]);

        const row = result.rows[0];
        insertedIds.push(row.id);

        expect(row.source).toBe('langchain-sync-test');
        expect(row.user_id).toBe(testUserId);
        expect(row.metadata).toMatchObject({
            source: 'langchain-sync-test',
            user_id: testUserId,
            scope: 'user',
            import_batch: 'batch-001'
        });
    });

    it('应把旧列写入同步回 metadata，保持单表兼容', async () => {
        const result = await db.query(`
            INSERT INTO knowledge_chunks (user_id, content, source, embedding)
            VALUES ($1, $2, $3, $4)
            RETURNING id, user_id, source, metadata
        `, [
            testUserId,
            `legacy column sync probe ${Date.now()}`,
            'legacy-sync-test',
            null
        ]);

        const row = result.rows[0];
        insertedIds.push(row.id);

        expect(row.user_id).toBe(testUserId);
        expect(row.source).toBe('legacy-sync-test');
        expect(row.metadata).toMatchObject({
            source: 'legacy-sync-test',
            user_id: testUserId,
            scope: 'user'
        });
    });
});
