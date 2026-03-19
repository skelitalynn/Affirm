#!/usr/bin/env node
const { runVerify } = require('../../tools/verify-environment');

async function main() {
    try {
        const ok = await runVerify();
        process.exit(ok ? 0 : 1);
    } catch (error) {
        console.error('❌ 验证执行失败:', error.message);
        process.exit(1);
    }
}

main();
