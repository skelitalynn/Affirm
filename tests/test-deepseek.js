#!/usr/bin/env node
const { runDeepseekTest } = require('../tools/test-deepseek');

runDeepseekTest()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
        console.error('❌ DeepSeek 测试失败:', error.message);
        process.exit(1);
    });
