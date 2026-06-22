#!/usr/bin/env node
require('dotenv').config({ override: true });

const config = require('../src/config');
const { runDatabaseDiagnostics } = require('./test-database');

function buildBlockingIssues() {
    const issues = [];

    if (!config.database.url || String(config.database.url).trim() === '') {
        issues.push('DB_URL 未配置');
    }

    if (!config.telegram.botToken || String(config.telegram.botToken).trim() === '') {
        issues.push('TELEGRAM_BOT_TOKEN 未配置');
    }

    if (!config.admin.password || String(config.admin.password).trim() === '') {
        issues.push('ADMIN_PASSWORD 未配置');
    }

    if (!config.ai.apiKey || String(config.ai.apiKey).trim() === '') {
        issues.push('未检测到可用 AI 密钥');
    }

    if (!config.ai.model || String(config.ai.model).trim() === '') {
        issues.push('AI 模型未配置');
    }

    if (!config.memory.enabled) {
        issues.push('MEMORY_V2_ENABLED=false，无法满足 v2 最小闭环');
    }

    const normalizedModel = String(config.ai.model || '').trim().toLowerCase();
    if (config.ai.provider === 'openai' && /(claude|sonnet|opus|haiku|gemini)/.test(normalizedModel)) {
        issues.push(`AI provider/model 不匹配: openai -> ${config.ai.model}`);
    }

    if (config.ai.provider === 'claude' && /(gpt-|^o[1-4]\b|gemini)/.test(normalizedModel)) {
        issues.push(`AI provider/model 不匹配: claude -> ${config.ai.model}`);
    }

    if (config.ai.provider === 'claude' && config.ai.baseURL && !/\/v1\/?$/.test(config.ai.baseURL)) {
        issues.push(`CLAUDE_BASE_URL 必须是 OpenAI 兼容的 /v1 端点: ${config.ai.baseURL}`);
    }

    if (config.ai.provider === 'gemini') {
        if (!process.env.GEMINI_API_KEY || String(process.env.GEMINI_API_KEY).trim() === '') {
            issues.push('GEMINI_API_KEY 未配置');
        }

        if (/(gpt-|claude|sonnet|opus|haiku)/.test(normalizedModel)) {
            issues.push(`AI provider/model 不匹配: gemini -> ${config.ai.model}`);
        }

        if (/\s/.test(String(config.ai.model || '').trim())) {
            issues.push(`GEMINI_MODEL 必须使用精确模型 ID，而不是展示名: ${config.ai.model}`);
        }

        if ((config.ai.apiVersion || 'v1beta') !== 'v1beta') {
            issues.push(`GEMINI_BASE_URL 必须使用 v1beta 端点，当前解析结果为: ${config.ai.baseURL}/${config.ai.apiVersion}`);
        }
    }

    return issues;
}

function printRuntimeSummary() {
    console.log(`🤖 AI Provider: ${config.ai.provider}`);
    console.log(`🧠 AI Model: ${config.ai.model}`);
    console.log(`🌐 Telegram Mode: ${config.webhook.enabled ? 'webhook' : 'polling'}`);
    console.log(`🗃️ Memory v2: ${config.memory.enabled ? 'enabled' : 'disabled'}`);

    if (config.haystack.baseURL) {
        console.log('✅ 已检测到 HAYSTACK_BASE_URL（增强知识模式）');
    } else {
        console.warn('⚠️ 未配置 HAYSTACK_BASE_URL；v2 最小闭环仍可运行，knowledge RAG 将降级为空结果');
    }

    if (config.webhook.enabled && !config.telegram.webhookUrl) {
        console.warn('⚠️ WEBHOOK_ENABLED=true 但 TELEGRAM_WEBHOOK_URL 未配置，建议先使用 polling 模式');
    }
}

async function runVerify() {
    const blockingIssues = buildBlockingIssues();

    if (blockingIssues.length > 0) {
        console.error('❌ v2 最小闭环阻塞项:');
        blockingIssues.forEach((issue) => console.error(`   - ${issue}`));
    } else {
        console.log('✅ v2 最小闭环必需配置已就绪');
    }

    printRuntimeSummary();

    const dbOk = await runDatabaseDiagnostics();
    const success = blockingIssues.length === 0 && dbOk;

    console.log(success ? '🎉 v2 最小闭环环境验证通过' : '⚠️ v2 最小闭环环境验证未通过');
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
