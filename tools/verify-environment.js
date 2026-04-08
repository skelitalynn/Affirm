#!/usr/bin/env node
require('dotenv').config();

const { runDatabaseDiagnostics } = require('./test-database');

async function runVerify() {
    const requiredVars = ['DB_URL', 'TELEGRAM_BOT_TOKEN'];
    const missingVars = requiredVars.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');
    const requestedProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
    const providerIsValid = !requestedProvider || ['claude', 'openai'].includes(requestedProvider);
    const hasAiKey = Boolean(
        (process.env.CLAUDE_API_KEY && String(process.env.CLAUDE_API_KEY).trim())
        || (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim())
    );

    if (missingVars.length > 0) {
        console.error('❌ 缺少环境变量:', missingVars.join(', '));
    } else {
        console.log('✅ 必需环境变量已配置');
    }

    if (!providerIsValid) {
        console.error('❌ AI_PROVIDER 仅支持 claude 或 openai');
    }

    if (!hasAiKey) {
        console.error('❌ 未检测到可用 AI 密钥，请配置 CLAUDE_API_KEY 或 OPENAI_API_KEY');
    }

    const dbOk = await runDatabaseDiagnostics();
    const success = missingVars.length === 0 && providerIsValid && hasAiKey && dbOk;

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
