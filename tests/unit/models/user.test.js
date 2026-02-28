// 用户模型单元测试
const User = require('../../../src/models/user');

describe('User Model', () => {
    let testTelegramId;

    beforeAll(() => {
        // 生成唯一的测试Telegram ID
        testTelegramId = Math.floor(Math.random() * 1000000000) + 1000000000;
    });

    afterAll(async () => {
        // 清理测试数据
        try {
            await User.delete(testTelegramId);
        } catch (error) {
            // 忽略清理错误
        }
    });

    describe('create()', () => {
        it('应该成功创建用户', async () => {
            const userData = {
                telegram_id: testTelegramId,
                username: 'test_user'
            };

            const user = await User.create(userData);
            
            expect(user).toBeDefined();
            expect(user.telegram_id).toBe(testTelegramId);
            expect(user.username).toBe('test_user');
            expect(user.id).toBeDefined();
            expect(user.created_at).toBeDefined();
        });

        it('应该处理重复用户（唯一约束）', async () => {
            const userData = {
                telegram_id: testTelegramId, // 使用相同的ID
                username: 'test_user_duplicate'
            };

            const user = await User.create(userData);
            
            // 应该返回现有用户而不是创建新用户
            expect(user).toBeDefined();
            expect(user.telegram_id).toBe(testTelegramId);
            // 用户名应该保持原样，而不是更新为新值
            expect(user.username).toBe('test_user');
        });

        it('应该处理缺失的用户名', async () => {
            const userData = {
                telegram_id: testTelegramId + 1,
                username: null
            };

            const user = await User.create(userData);
            
            expect(user).toBeDefined();
            expect(user.telegram_id).toBe(testTelegramId + 1);
            expect(user.username).toBeNull();
        });
    });

    describe('findByTelegramId()', () => {
        it('应该根据Telegram ID查找用户', async () => {
            const user = await User.findByTelegramId(testTelegramId);
            
            expect(user).toBeDefined();
            expect(user.telegram_id).toBe(testTelegramId);
            expect(user.username).toBe('test_user');
        });

        it('找不到用户时应返回null', async () => {
            const nonExistentId = 999999999999;
            const user = await User.findByTelegramId(nonExistentId);
            
            expect(user).toBeNull();
        });
    });

    describe('update()', () => {
        it('应该成功更新用户信息', async () => {
            const updates = {
                username: 'updated_user'
            };

            const updatedUser = await User.update(testTelegramId, updates);
            
            expect(updatedUser).toBeDefined();
            expect(updatedUser.telegram_id).toBe(testTelegramId);
            expect(updatedUser.username).toBe('updated_user');
        });

        it('更新不存在的用户应该抛出错误', async () => {
            const nonExistentId = 999999999998;
            const updates = { username: 'should_fail' };

            await expect(User.update(nonExistentId, updates))
                .rejects
                .toThrow('用户不存在');
        });

        it('没有更新字段时应抛出错误', async () => {
            await expect(User.update(testTelegramId, {}))
                .rejects
                .toThrow('没有提供更新字段');
        });
    });

    describe('findAll()', () => {
        it('应该返回用户列表', async () => {
            const users = await User.findAll(10, 0);
            
            expect(Array.isArray(users)).toBe(true);
            // 至少应该包含我们创建的测试用户
            const testUser = users.find(u => u.telegram_id === testTelegramId);
            expect(testUser).toBeDefined();
        });

        it('应该支持分页', async () => {
            const limit = 5;
            const offset = 0;
            const users = await User.findAll(limit, offset);
            
            expect(users.length).toBeLessThanOrEqual(limit);
        });
    });

    describe('delete()', () => {
        let deleteTestId;

        beforeEach(async () => {
            // 创建用于删除测试的用户
            deleteTestId = testTelegramId + 100;
            await User.create({
                telegram_id: deleteTestId,
                username: 'delete_test_user'
            });
        });

        it('应该成功删除用户', async () => {
            const deleted = await User.delete(deleteTestId);
            
            expect(deleted).toBe(true);
            
            // 验证用户已被删除
            const user = await User.findByTelegramId(deleteTestId);
            expect(user).toBeNull();
        });

        it('删除不存在的用户应返回false', async () => {
            const nonExistentId = 999999999997;
            const deleted = await User.delete(nonExistentId);
            
            expect(deleted).toBe(false);
        });
    });

    describe('count()', () => {
        it('应该返回用户数量', async () => {
            const count = await User.count();
            
            expect(typeof count).toBe('number');
            expect(count).toBeGreaterThanOrEqual(1);
        });
    });
});