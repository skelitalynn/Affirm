#!/usr/bin/env node
const { runCheckStatus } = require('../tools/check-status');

async function main() {
    try {
        const ok = await runCheckStatus();
        process.exit(ok ? 0 : 1);
    } catch (error) {
        console.error('❌ 状态检查失败:', error.message);
        process.exit(1);
    }
}

main();
