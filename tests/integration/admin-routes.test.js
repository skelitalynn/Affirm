const request = require('supertest');
const User = require('../../src/models/user');
const Profile = require('../../src/models/profile');
const Knowledge = require('../../src/models/knowledge');
const MemoryEvent = require('../../src/models/memory-event');
const Message = require('../../src/models/message');
const { db } = require('../../src/db/connection');

process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const app = require('../../src/admin/server');

describe('Admin Routes Integration', () => {
    const origin = 'http://localhost:3001';
    let testUserId;
    let testTelegramId;
    let profileId;
    let knowledgeId;
    let memoryEventId;
    let assistantMessageId;

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
        if (assistantMessageId) {
            await Message.delete(assistantMessageId);
        }
        if (memoryEventId) {
            await MemoryEvent.delete(memoryEventId);
        }

        await db.query('DELETE FROM knowledge_chunks WHERE user_id = $1', [testUserId]);
        await db.query('DELETE FROM messages WHERE user_id = $1', [testUserId]);
        await db.query('DELETE FROM memory_events WHERE user_id = $1', [testUserId]);
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

    it('should complete memory events governance flow from admin routes', async () => {
        const memoryEvent = await MemoryEvent.create({
            user_id: testUserId,
            event_type: 'commitment',
            title: 'admin memory event',
            summary: '用户承诺继续晨间复盘',
            detail: '这条事件用于验证 Phase 5 的后台治理闭环。',
            keywords: ['admin', 'memory'],
            importance: 0.7,
            confidence: 0.9,
            metadata: { created_by: 'integration-test' }
        });
        memoryEventId = memoryEvent.id;
        const duplicateMemoryEvent = await MemoryEvent.create({
            user_id: testUserId,
            event_type: 'commitment',
            title: 'admin memory event duplicate',
            summary: '用户重复提到会继续晨间复盘',
            detail: '这条事件用于验证后台 merge 治理动作。',
            keywords: ['admin', 'memory', 'duplicate'],
            importance: 0.66,
            confidence: 0.74,
            metadata: { created_by: 'integration-test-duplicate' }
        });

        const assistantMessage = await Message.create({
            user_id: testUserId,
            role: 'assistant',
            content: '我记得你上次说过，这周想把晨间复盘重新捡起来。',
            metadata: {
                trace_id: 'trace-admin-memory-hit',
                generation: {
                    recalled_memory_count: 1,
                    recalled_memory_in_prompt: true
                },
                memory_refs: [{
                    id: memoryEventId,
                    event_type: 'commitment',
                    title: 'admin memory event',
                    final_score: 0.88
                }]
            }
        });
        assistantMessageId = assistantMessage.id;

        const listRes = await request(app)
            .get('/admin/memory-events')
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(listRes.status).toBe(200);
        expect(listRes.text).toContain('admin memory event');

        const editRes = await request(app)
            .get(`/admin/memory-events/${memoryEventId}/edit`)
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(editRes.status).toBe(200);
        expect(editRes.text).toContain('用户承诺继续晨间复盘');

        const hitsRes = await request(app)
            .get('/admin/memory-events/hits')
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(hitsRes.status).toBe(200);
        expect(hitsRes.text).toContain('trace-admin-memory-hit');

        const hitDetailRes = await request(app)
            .get(`/admin/memory-events/hits/${assistantMessageId}`)
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(hitDetailRes.status).toBe(200);
        expect(hitDetailRes.text).toContain('admin memory event');
        expect(hitDetailRes.text).toContain('我记得你上次说过');

        const updateRes = await request(app)
            .post(`/admin/memory-events/${memoryEventId}/update`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                event_type: 'commitment',
                title: 'admin memory event updated',
                summary: '用户承诺继续晨间复盘并降低启动门槛',
                detail: '更新后的后台治理详情',
                keywords: 'admin,memory,updated',
                importance: '0.92',
                confidence: '0.95',
                happened_at: '2026-04-15T08:00',
                status: 'active',
                review_status: 'edited'
            });

        expect(updateRes.status).toBe(302);
        expect(updateRes.headers.location).toContain('/admin/memory-events');

        const updatedEvent = await MemoryEvent.findById(memoryEventId);
        expect(updatedEvent.title).toBe('admin memory event updated');
        expect(updatedEvent.importance).toBe(0.92);
        expect(updatedEvent.confidence).toBe(0.95);
        expect(updatedEvent.keywords).toEqual(['admin', 'memory', 'updated']);
        expect(updatedEvent.review_status).toBe('edited');

        const suppressRes = await request(app)
            .post(`/admin/memory-events/${memoryEventId}/suppress`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(suppressRes.status).toBe(302);
        const suppressedEvent = await MemoryEvent.findById(memoryEventId);
        expect(suppressedEvent.status).toBe('suppressed');

        const restoreRes = await request(app)
            .post(`/admin/memory-events/${memoryEventId}/restore`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(restoreRes.status).toBe(302);
        const restoredEvent = await MemoryEvent.findById(memoryEventId);
        expect(restoredEvent.status).toBe('active');

        const verifyRes = await request(app)
            .post(`/admin/memory-events/${memoryEventId}/review`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                review_status: 'verified'
            });

        expect(verifyRes.status).toBe(302);
        const verifiedEvent = await MemoryEvent.findById(memoryEventId);
        expect(verifiedEvent.review_status).toBe('verified');
        expect(verifiedEvent.last_reviewed_at).toBeTruthy();

        const rejectRes = await request(app)
            .post(`/admin/memory-events/${duplicateMemoryEvent.id}/review`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                review_status: 'rejected'
            });

        expect(rejectRes.status).toBe(302);
        const rejectedDuplicate = await MemoryEvent.findById(duplicateMemoryEvent.id);
        expect(rejectedDuplicate.review_status).toBe('rejected');

        const mergeRes = await request(app)
            .post(`/admin/memory-events/${duplicateMemoryEvent.id}/merge`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD)
            .type('form')
            .send({
                target_event_id: memoryEventId,
                reason: 'duplicate_event'
            });

        expect(mergeRes.status).toBe(302);
        const mergedDuplicate = await MemoryEvent.findById(duplicateMemoryEvent.id);
        const canonicalAfterMerge = await MemoryEvent.findById(memoryEventId);
        expect(mergedDuplicate.status).toBe('merged');
        expect(mergedDuplicate.review_status).toBe('verified');
        expect(mergedDuplicate.merged_into_event_id).toBe(memoryEventId);
        expect(canonicalAfterMerge.metadata.governance.merged_from_event_ids).toContain(duplicateMemoryEvent.id);

        const deleteRes = await request(app)
            .post(`/admin/memory-events/${memoryEventId}/delete`)
            .set('Origin', origin)
            .auth('admin', process.env.ADMIN_PASSWORD);

        expect(deleteRes.status).toBe(302);
        expect(deleteRes.headers.location).toContain('/admin/memory-events');

        const deletedEvent = await MemoryEvent.findById(memoryEventId);
        expect(deletedEvent).toBeNull();
        memoryEventId = null;
    });
});
