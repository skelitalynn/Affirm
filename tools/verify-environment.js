#!/usr/bin/env node
require('dotenv').config();

const { runDatabaseDiagnostics } = require('./test-database');
const { resolveAIConfig } = require('../src/config/ai-config');

async function runVerify() {
    const missingVars = [];
    const aiConfig = resolveAIConfig(process.env);

    ['DB_URL', 'TELEGRAM_BOT_TOKEN'].forEach((key) => {
        if (!process.env[key] || String(process.env[key]).trim() === '') {
            missingVars.push(key);
        }
    });

    if (!aiConfig.apiKey) {
        missingVars.push('AI_API_KEY');
    }

    if (missingVars.length > 0) {
        console.error('❌ 缺少环境变量:', missingVars.join(', '));
    } else {
        console.log('✅ 必需环境变量已配置');
    }

    const dbOk = await runDatabaseDiagnostics();
    const success = missingVars.length === 0 && dbOk;

    console.log(success ? '🎉 环境验证通过' : '⚠️ 环境验证未通过');
    return success;
}

if (require.main === module) {
    runVerify()
        .then((success) => process.exit(success ? 0 : 1))
        .catch((error) => {
            console.error('❌ 环境验证失败:', error.message);
            process.exit(1);
        });
}

module.exports = { runVerify };
