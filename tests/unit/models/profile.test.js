// 用户画像模型单元测试
const Profile = require('../../../src/models/profile');
const User = require('../../../src/models/user');

describe('Profile Model', () => {
    let testUserId;
    let testTelegramId;

    beforeAll(async () => {
        // 创建测试用户
        testTelegramId = Math.floor(Math.random() * 1000000000) + 2000000000;
        const user = await User.create({
            telegram_id: testTelegramId,
            username: 'profile_test_user'
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        // 清理测试数据
        try {
            await Profile.delete(testUserId);
            await User.delete(testTelegramId);
        } catch (error) {
            // 忽略清理错误
        }
    });

    describe('create()', () => {
        it('应该成功创建用户画像', async () => {
            const profileData = {
                user_id: testUserId,
                goals: '学习编程，提高技能',
                status: 'active',
                preferences: { language: 'zh', theme: 'dark' }
            };

            const profile = await Profile.create(profileData);
            
            expect(profile).toBeDefined();
            expect(profile.user_id).toBe(testUserId);
            expect(profile.goals).toBe('学习编程，提高技能');
            expect(profile.status).toBe('active');
            expect(profile.preferences).toEqual({ language: 'zh', theme: 'dark' });
            expect(profile.id).toBeDefined();
            expect(profile.created_at).toBeDefined();
            expect(profile.updated_at).toBeDefined();
        });

        it('应该处理缺失的可选字段', async () => {
            const profileData = {
                user_id: testUserId + '-alt' // 不同的用户ID
            };

            // 先创建用户
            const altUser = await User.create({
                telegram_id: testTelegramId + 1,
                username: 'alt_test_user'
            });

            const profile = await Profile.create({
                user_id: altUser.id,
                goals: null,
                status: null,
                preferences: null
            });
            
            expect(profile).toBeDefined();
            expect(profile.user_id).toBe(altUser.id);
            expect(profile.goals).toBeNull();
            expect(profile.status).toBeNull();
            expect(profile.preferences).toBeNull();

            // 清理
            await Profile.delete(altUser.id);
            await User.delete(testTelegramId + 1);
        });
    });

    describe('findByUserId()', () => {
        it('应该根据用户ID查找画像', async () => {
            const profile = await Profile.findByUserId(testUserId);
            
            expect(profile).toBeDefined();
            expect(profile.user_id).toBe(testUserId);
            expect(profile.goals).toBe('学习编程，提高技能');
        });

        it('找不到画像时应返回null', async () => {
            const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
            const profile = await Profile.findByUserId(nonExistentUserId);
            
            expect(profile).toBeNull();
        });
    });

    describe('findOrCreate()', () => {
        let findOrCreateUserId;

        beforeAll(async () => {
            // 创建用于findOrCreate测试的用户
            const user = await User.create({
                telegram_id: testTelegramId + 2,
                username: 'findorcreate_test_user'
            });
            findOrCreateUserId = user.id;
        });

        afterAll(async () => {
            // 清理
            await Profile.delete(findOrCreateUserId);
            await User.delete(testTelegramId + 2);
        });

        it('应该查找现有画像', async () => {
            // 先创建画像
            await Profile.create({
                user_id: findOrCreateUserId,
                goals: '现有目标',
                status: 'active'
            });

            // 然后使用findOrCreate
            const profile = await Profile.findOrCreate(findOrCreateUserId, {
                goals: '新目标',
                status: 'inactive'
            });
            
            // 应该返回现有画像，而不是用新数据创建
            expect(profile).toBeDefined();
            expect(profile.user_id).toBe(findOrCreateUserId);
            expect(profile.goals).toBe('现有目标'); // 保持原样
            expect(profile.status).toBe('active'); // 保持原样
        });

        it('应该创建新画像（如果不存在）', async () => {
            const newUserId = '00000000-0000-0000-0000-000000000001';
            const profile = await Profile.findOrCreate(newUserId, {
                goals: '新创建的目标',
                status: 'pending',
                preferences: { test: true }
            });
            
            expect(profile).toBeDefined();
            expect(profile.goals).toBe('新创建的目标');
            expect(profile.status).toBe('pending');
            expect(profile.preferences).toEqual({ test: true });

            // 清理
            await Profile.delete(newUserId);
        });
    });

    describe('update()', () => {
        it('应该成功更新画像信息', async () => {
            const updates = {
                goals: '更新后的目标',
                status: 'completed',
                preferences: { language: 'en', theme: 'light', notifications: true }
            };

            const updatedProfile = await Profile.update(testUserId, updates);
            
            expect(updatedProfile).toBeDefined();
            expect(updatedProfile.user_id).toBe(testUserId);
            expect(updatedProfile.goals).toBe('更新后的目标');
            expect(updatedProfile.status).toBe('completed');
            expect(updatedProfile.preferences).toEqual({
                language: 'en',
                theme: 'light',
                notifications: true
            });
            expect(updatedProfile.updated_at).toBeDefined();
        });

        it('应该处理部分更新', async () => {
            const updates = {
                goals: '只更新目标'
            };

            const updatedProfile = await Profile.update(testUserId, updates);
            
            expect(updatedProfile).toBeDefined();
            expect(updatedProfile.goals).toBe('只更新目标');
            // 其他字段应该保持不变
            expect(updatedProfile.status).toBe('completed');
        });

        it('更新JSON字段应该正确序列化', async () => {
            const complexPreferences = {
                ui: {
                    theme: 'dark',
                    fontSize: 14,
                    compact: true
                },
                notifications: {
                    email: true,
                    push: false,
                    sound: 'default'
                },
                privacy: {
                    shareData: false,
                    analytics: true
                }
            };

            const updatedProfile = await Profile.update(testUserId, {
                preferences: complexPreferences
            });
            
            expect(updatedProfile.preferences).toEqual(complexPreferences);
        });

        it('更新不存在的画像应该抛出错误', async () => {
            const nonExistentUserId = '00000000-0000-0000-0000-000000000002';
            const updates = { goals: '应该失败' };

            await expect(Profile.update(nonExistentUserId, updates))
                .rejects
                .toThrow('用户画像不存在');
        });

        it('没有更新字段时应抛出错误', async () => {
            await expect(Profile.update(testUserId, {}))
                .rejects
                .toThrow('没有提供更新字段');
        });
    });

    describe('特定更新方法', () => {
        beforeEach(async () => {
            // 重置测试数据
            await Profile.update(testUserId, {
                goals: '初始目标',
                status: 'active',
                preferences: { initial: true }
            });
        });

        it('updateGoals() 应该只更新目标', async () => {
            const updatedProfile = await Profile.updateGoals(testUserId, '新目标文本');
            
            expect(updatedProfile.goals).toBe('新目标文本');
            expect(updatedProfile.status).toBe('active'); // 保持不变
            expect(updatedProfile.preferences).toEqual({ initial: true }); // 保持不变
        });

        it('updatePreferences() 应该只更新偏好', async () => {
            const newPreferences = { updated: true, nested: { value: 'test' } };
            const updatedProfile = await Profile.updatePreferences(testUserId, newPreferences);
            
            expect(updatedProfile.preferences).toEqual(newPreferences);
            expect(updatedProfile.goals).toBe('初始目标'); // 保持不变
            expect(updatedProfile.status).toBe('active'); // 保持不变
        });

        it('updateStatus() 应该只更新状态', async () => {
            const updatedProfile = await Profile.updateStatus(testUserId, 'inactive');
            
            expect(updatedProfile.status).toBe('inactive');
            expect(updatedProfile.goals).toBe('初始目标'); // 保持不变
            expect(updatedProfile.preferences).toEqual({ initial: true }); // 保持不变
        });
    });

    describe('findAll()', () => {
        it('应该返回画像列表', async () => {
            const profiles = await Profile.findAll(10, 0);
            
            expect(Array.isArray(profiles)).toBe(true);
            expect(profiles.length).toBeGreaterThan(0);
            
            // 检查返回的字段
            const firstProfile = profiles[0];
            expect(firstProfile.id).toBeDefined();
            expect(firstProfile.user_id).toBeDefined();
            expect(firstProfile.username).toBeDefined(); // 来自JOIN
            expect(firstProfile.telegram_id).toBeDefined(); // 来自JOIN
        });

        it('应该支持分页', async () => {
            const limit = 1;
            const profiles = await Profile.findAll(limit, 0);
            
            expect(profiles.length).toBeLessThanOrEqual(limit);
        });
    });

    describe('findByStatus()', () => {
        beforeAll(async () => {
            // 创建不同状态的测试画像
            const testUser1 = await User.create({
                telegram_id: testTelegramId + 100,
                username: 'status_test_1'
            });
            await Profile.create({
                user_id: testUser1.id,
                status: 'active'
            });

            const testUser2 = await User.create({
                telegram_id: testTelegramId + 101,
                username: 'status_test_2'
            });
            await Profile.create({
                user_id: testUser2.id,
                status: 'inactive'
            });
        });

        it('应该根据状态筛选画像', async () => {
            const activeProfiles = await Profile.findByStatus('active');
            
            expect(Array.isArray(activeProfiles)).toBe(true);
            activeProfiles.forEach(profile => {
                expect(profile.status).toBe('active');
            });
        });

        it('找不到匹配状态时应返回空数组', async () => {
            const nonExistentStatusProfiles = await Profile.findByStatus('non_existent_status');
            
            expect(Array.isArray(nonExistentStatusProfiles)).toBe(true);
            expect(nonExistentStatusProfiles.length).toBe(0);
        });
    });

    describe('delete()', () => {
        let deleteTestUserId;

        beforeEach(async () => {
            // 创建用于删除测试的用户和画像
            const user = await User.create({
                telegram_id: testTelegramId + 200,
                username: 'delete_test_user'
            });
            deleteTestUserId = user.id;
            
            await Profile.create({
                user_id: deleteTestUserId,
                goals: '待删除的目标'
            });
        });

        it('应该成功删除画像', async () => {
            const deleted = await Profile.delete(deleteTestUserId);
            
            expect(deleted).toBe(true);
            
            // 验证画像已被删除
            const profile = await Profile.findByUserId(deleteTestUserId);
            expect(profile).toBeNull();
        });

        it('删除不存在的画像应返回false', async () => {
            const nonExistentUserId = '00000000-0000-0000-0000-000000000003';
            const deleted = await Profile.delete(nonExistentUserId);
            
            expect(deleted).toBe(false);
        });
    });

    describe('count()', () => {
        it('应该返回画像数量', async () => {
            const count = await Profile.count();
            
            expect(typeof count).toBe('number');
            expect(count).toBeGreaterThanOrEqual(1);
        });
    });
});