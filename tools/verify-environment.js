#!/usr/bin/env node
require('dotenv').config();
const { db } = require('../src/db/connection');

function checkRequiredEnv(name) {
    const value = process.env[name];
    return Boolean(value && !value.includes('请填写') && !value.includes('your_'));
}

async function runVerify() {
    console.log('🔍 Affirm 环境验证');
    console.log('='.repeat(48));

    const requiredVars = ['DB_URL', 'TELEGRAM_BOT_TOKEN'];
    let hasError = false;

    console.log('\n1. 必需环境变量');
    for (const key of requiredVars) {
        const ok = checkRequiredEnv(key);
        console.log(`   ${ok ? '✅' : '❌'} ${key}`);
        if (!ok) hasError = true;
    }

    const optionalVars = ['AI_PROVIDER', 'EMBEDDING_API_KEY', 'REDIS_HOST'];
    console.log('\n2. 可选环境变量');
    for (const key of optionalVars) {
        const exists = Boolean(process.env[key]);
        console.log(`   ${exists ? '✅' : '⚠️'} ${key}`);
    }

    console.log('\n3. 数据库连接');
    try {
        const result = await db.query('SELECT NOW() as now');
        console.log(`   ✅ 连接成功: ${result.rows[0].now.toISOString()}`);
    } catch (error) {
        console.log(`   ❌ 连接失败: ${error.message}`);
        hasError = true;
    }

    console.log('\n' + '='.repeat(48));
    if (hasError) {
        console.log('❌ 验证未通过');
        process.exit(1);
    }

    console.log('✅ 验证通过');
    process.exit(0);
}

if (require.main === module) {
    runVerify().catch(error => {
        console.error('❌ 验证执行失败:', error.message);
        process.exit(1);
    });
}

module.exports = { runVerify };
