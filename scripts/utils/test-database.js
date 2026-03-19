#!/usr/bin/env node
const { runDatabaseDiagnostics } = require('../../tools/test-database');

async function main() {
    try {
        const ok = await runDatabaseDiagnostics();
        process.exit(ok ? 0 : 1);
    } catch (error) {
        console.error('❌ 数据库诊断失败:', error.message);
        process.exit(1);
    }
}

main();
