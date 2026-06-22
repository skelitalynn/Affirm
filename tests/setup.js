const dbModulePath = require.resolve('../src/db/connection');

// 模拟控制台输出
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const waitForResourceSettle = () => new Promise((resolve) => setTimeout(resolve, 250));

// 在测试中抑制控制台输出
beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
});

afterAll(async () => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    if (require.cache[dbModulePath]) {
        try {
            const { db } = require(dbModulePath);
            if (db && typeof db.close === 'function') {
                await db.close();
            }
        } catch (error) {
            // 忽略测试清理错误，避免掩盖断言失败。
        } finally {
            delete require.cache[dbModulePath];
        }
    }

    await waitForResourceSettle();
});

// 测试超时设置
jest.setTimeout(30000); // 30秒超时

// 全局测试辅助函数
global.generateTestId = () => {
    return 'test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
};
