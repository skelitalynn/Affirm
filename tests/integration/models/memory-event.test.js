const MemoryEvent = require('../../../src/models/memory-event');
const Profile = require('../../../src/models/profile');
const User = require('../../../src/models/user');

describe('MemoryEvent Model', () => {
    let testUser;
    let testTelegramId;
    let createdEventIds = [];

    beforeAll(async () => {
        testTelegramId = Math.floor(Math.random() * 1000000000) + 3000000000;
        testUser = await User.create({
            telegram_id: testTelegramId,
            username: `memory_event_test_${testTelegramId}`
        });

        await Profile.findOrCreate(testUser.id, {
            goals: '测试长期记忆查询',
            status: 'active',
            preferences: Profile.buildDefaultMemory()
        });
    });

    afterEach(async () => {
        await Promise.all(createdEventIds.map((id) => MemoryEvent.delete(id)));
        createdEventIds = [];
    });

    afterAll(async () => {
        try {
            await Profile.delete(testUser.id);
            await User.delete(testTelegramId);
        } catch (error) {
            // 忽略清理错误
        }
    });

    it('findByUserId() 应在 joined query 下正确按用户筛选', async () => {
        const activeEvent = await MemoryEvent.create({
            user_id: testUser.id,
            event_type: 'commitment',
            title: '恢复晨间复盘',
            summary: '用户承诺重新恢复晨间复盘',
            detail: '先从每天 10 分钟开始。',
            keywords: ['晨间复盘', '承诺'],
            importance: 0.92,
            confidence: 0.88
        });

        const suppressedEvent = await MemoryEvent.create({
            user_id: testUser.id,
            event_type: 'setback',
            title: '启动时会犹豫',
            summary: '用户在开始时容易犹豫',
            detail: '需要更小的起步动作。',
            keywords: ['犹豫', '启动'],
            importance: 0.61,
            confidence: 0.8,
            status: 'suppressed'
        });

        createdEventIds.push(activeEvent.id, suppressedEvent.id);

        const rows = await MemoryEvent.findByUserId(testUser.id, {
            status: 'active',
            limit: 10
        });

        expect(Array.isArray(rows)).toBe(true);
        expect(rows.find((row) => row.id === activeEvent.id)).toBeDefined();
        expect(rows.find((row) => row.id === suppressedEvent.id)).toBeUndefined();
        expect(rows.every((row) => row.user_id === testUser.id)).toBe(true);
    });
});
