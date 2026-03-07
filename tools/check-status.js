#!/usr/bin/env node
require('dotenv').config();
const config = require('../src/config');
const { db } = require('../src/db/connection');

async function runCheckStatus() {
    console.log('🔍 Affirm 项目状态检查');
    console.log('='.repeat(48));

    console.log('\n1. 核心配置');
    console.log(`   Telegram Token: ${config.telegram.botToken ? '✅' : '❌'}`);
    console.log(`   AI Provider: ${config.ai.provider || '未设置'}`);
    console.log(`   Database URL: ${config.database.url ? '✅' : '❌'}`);

    console.log('\n2. 数据库状态');
    const tables = ['users', 'profiles', 'messages', 'knowledge_chunks'];
    for (const table of tables) {
        try {
            const result = await db.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
            console.log(`   ✅ ${table}: ${result.rows[0].count}`);
        } catch (error) {
            console.log(`   ❌ ${table}: ${error.message}`);
        }
    }

    console.log('\n✅ 状态检查完成');
}

if (require.main === module) {
    runCheckStatus().catch(error => {
        console.error('❌ 状态检查失败:', error.message);
        process.exit(1);
    });
}

module.exports = { runCheckStatus };
