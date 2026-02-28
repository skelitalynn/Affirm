// 测试环境设置
require('dotenv').config({ path: '/root/projects/Affirm/.env' });

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// 模拟控制台输出
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// 在测试中抑制控制台输出
beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
});

// 测试超时设置
jest.setTimeout(30000); // 30秒超时

// 全局测试辅助函数
global.generateTestId = () => {
    return 'test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
};