#!/usr/bin/env node
const { db } = require('../src/db/connection');

async function runDatabaseDiagnostics() {
    try {
        const nowResult = await db.query('SELECT NOW() AS now');
        console.log('✅ 数据库连接成功:', nowResult.rows[0].now);

        const extensionResult = await db.query(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed"
        );
        console.log(`📦 pgvector 扩展: ${extensionResult.rows[0].installed ? '已安装' : '未安装'}`);

        const tablesResult = await db.query(
            "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'"
        );
        console.log(`📊 public schema 表数量: ${tablesResult.rows[0].count}`);

        return true;
    } catch (error) {
        console.error('❌ 数据库诊断失败:', error.message);
        return false;
    }
}

if (require.main === module) {
    runDatabaseDiagnostics()
        .then((success) => process.exit(success ? 0 : 1))
        .catch((error) => {
            console.error('❌ 数据库诊断失败:', error.message);
            process.exit(1);
        });
}

module.exports = { runDatabaseDiagnostics };
