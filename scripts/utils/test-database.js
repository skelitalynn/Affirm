#!/usr/bin/env node
const { runDatabaseDiagnostics } = require('../../tools/test-database');

runDatabaseDiagnostics().catch(error => {
    console.error('❌ 数据库诊断失败:', error.message);
    process.exit(1);
});
