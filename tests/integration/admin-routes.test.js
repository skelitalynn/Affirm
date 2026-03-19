const request = require('supertest');
const User = require('../../src/models/user');
const Profile = require('../../src/models/profile');
const Knowledge = require('../../src/models/knowledge');
const { db } = require('../../src/db/connection');

process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const app = require('../../src/admin/server');

describe('Admin Routes Integration', () => {
    const origin = 'http://localhost:3001';
    let testUserId;
    let testTelegramId;
    let profileId;
    let knowledgeId;

    beforeAll(async () => {
        testTelegramId = Date.now();
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'admin_routes_test_user'
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        if (knowledgeId) {
            await Knowledge.delete(knowledgeId);
        }
        if (profileId) {
            const profile = await Profile.findById(profileId);
            if (profile) {
                await Profile.delete(profile.user_id);
            }
        }

        await db.query('DELETE FROM knowledge_chunks WHERE user_id = $1', [testUserId]);
        await db.query('DELETE FROM profiles WHERE user_id = $1', [testUserId]);
        await User.delete(testTelegramId);
    });

    it('should render /admin dashboard', async () => {
        const res = await request(app)
            .get('/admin')
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(res.status).toBe(200);
        expect(res.text).toContain('Affirm后台管理');
    });

    it('should complete profiles CRUD flow from admin routes', async () => {
        const listRes = await request(app)
            .get('/admin/profiles')
            .auth('admin', process.env.ADMIN_PASSWORD);
        expect(listRes.status).toBe(200);

        const createRes = await request(app)
            .post('/admin/profiles')
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                user_id: testUserId,
                goals: 'admin test goals',
                status: 'active',
                preferences: JSON.stringify({ from: 'integration-test' })
            });

        expect(createRes.status).toBe(302);
        expect(createRes.headers.location).toContain('/admin/profiles');

        const created = await db.query('SELECT id, user_id, goals, status FROM profiles WHERE user_id = $1', [testUserId]);
        expect(created.rows.length).toBeGreaterThan(0);
        profileId = created.rows[0].id;
        expect(created.rows[0].goals).toBe('admin test goals');

        const updateRes = await request(app)
            .post(`/admin/profiles/${profileId}/update`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                goals: 'admin test goals updated',
                status: 'paused',
                preferences: JSON.stringify({ from: 'integration-test-updated' })
            });

        expect(updateRes.status).toBe(302);
        expect(updateRes.headers.location).toContain('/admin/profiles');

        const updated = await db.query('SELECT goals, status FROM profiles WHERE id = $1', [profileId]);
        expect(updated.rows[0].goals).toBe('admin test goals updated');
        expect(updated.rows[0].status).toBe('paused');

        const deleteRes = await request(app)
            .post(`/admin/profiles/${profileId}/delete`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(deleteRes.status).toBe(302);
        expect(deleteRes.headers.location).toContain('/admin/profiles');

        const deleted = await db.query('SELECT id FROM profiles WHERE id = $1', [profileId]);
        expect(deleted.rows.length).toBe(0);
        profileId = null;
    });

    it('should complete knowledge CRUD flow from admin routes', async () => {
        const listRes = await request(app)
            .get('/admin/knowledge')
            .auth('admin', process.env.ADMIN_PASSWORD);
        expect(listRes.status).toBe(200);

        const createRes = await request(app)
            .post('/admin/knowledge')
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                user_id: testUserId,
                source: 'admin-test-source',
                content: 'admin knowledge content'
            });

        expect(createRes.status).toBe(302);
        expect(createRes.headers.location).toContain('/admin/knowledge');

        const created = await db.query(
            'SELECT id, source, content FROM knowledge_chunks WHERE user_id = $1 AND source = $2 ORDER BY created_at DESC LIMIT 1',
            [testUserId, 'admin-test-source']
        );
        expect(created.rows.length).toBe(1);
        knowledgeId = created.rows[0].id;
        expect(created.rows[0].content).toBe('admin knowledge content');

        const updateRes = await request(app)
            .post(`/admin/knowledge/${knowledgeId}/update`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                source: 'admin-test-source-updated',
                content: 'admin knowledge content updated'
            });

        expect(updateRes.status).toBe(302);
        expect(updateRes.headers.location).toContain('/admin/knowledge');

        const updated = await db.query('SELECT source, content FROM knowledge_chunks WHERE id = $1', [knowledgeId]);
        expect(updated.rows[0].source).toBe('admin-test-source-updated');
        expect(updated.rows[0].content).toBe('admin knowledge content updated');

        const deleteRes = await request(app)
            .post(`/admin/knowledge/${knowledgeId}/delete`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(deleteRes.status).toBe(302);
        expect(deleteRes.headers.location).toContain('/admin/knowledge');

        const deleted = await db.query('SELECT id FROM knowledge_chunks WHERE id = $1', [knowledgeId]);
        expect(deleted.rows.length).toBe(0);
        knowledgeId = null;
    });

    it('should chunk long knowledge imports from admin route', async () => {
        const importSource = 'admin-import-chunking-test';
        const importContent = [
            '这是第一段较长的知识内容，用来验证后台导入时会先按空行分段，然后再进行自动切片和合并处理。'.repeat(8),
            '',
            '这是第二段内容，同样故意写得比较长，用来确保 chunking 服务会生成多个知识片段，而不是只保存一条大文本。'.repeat(8)
        ].join('\n');

        const importRes = await request(app)
            .post('/admin/knowledge/import')
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                user_id: testUserId,
                source: importSource,
                items: importContent
            });

        expect(importRes.status).toBe(302);
        expect(importRes.headers.location).toContain('/admin/knowledge');

        const imported = await db.query(
            'SELECT content FROM knowledge_chunks WHERE user_id = $1 AND source = $2 ORDER BY created_at ASC',
            [testUserId, importSource]
        );

        expect(imported.rows.length).toBeGreaterThan(1);
        expect(imported.rows.every((row) => row.content && row.content.length > 0)).toBe(true);
    });
});
