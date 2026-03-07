#!/usr/bin/env node
require('dotenv').config();
const { db, testConnection } = require('../src/db/connection');

async function runDatabaseDiagnostics() {
    console.log('🔍 数据库诊断');
    console.log('='.repeat(48));

    const connectionOk = await testConnection();
    if (!connectionOk) {
        process.exit(1);
    }

    const checks = [
        { name: 'users', sql: 'SELECT COUNT(*)::int AS count FROM users' },
        { name: 'profiles', sql: 'SELECT COUNT(*)::int AS count FROM profiles' },
        { name: 'messages', sql: 'SELECT COUNT(*)::int AS count FROM messages' },
        { name: 'knowledge_chunks', sql: 'SELECT COUNT(*)::int AS count FROM knowledge_chunks' }
    ];

    for (const check of checks) {
        try {
            const result = await db.query(check.sql);
            console.log(`✅ ${check.name}: ${result.rows[0].count}`);
        } catch (error) {
            console.log(`❌ ${check.name}: ${error.message}`);
        }
    }

    await db.close();
    console.log('✅ 数据库诊断完成');
}

if (require.main === module) {
    runDatabaseDiagnostics().catch(error => {
        console.error('❌ 数据库诊断失败:', error.message);
        process.exit(1);
    });
}

module.exports = { runDatabaseDiagnostics };
