#!/usr/bin/env node
const { runCheckStatus } = require('../tools/check-status');

runCheckStatus().catch(error => {
    console.error('❌ 状态检查失败:', error.message);
    process.exit(1);
});
