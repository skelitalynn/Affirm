#!/usr/bin/env node
const { runVerify } = require('../../tools/verify-environment');

runVerify().catch(error => {
    console.error('❌ 验证执行失败:', error.message);
    process.exit(1);
});
