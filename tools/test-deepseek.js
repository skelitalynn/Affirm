#!/usr/bin/env node
require('dotenv').config();

const OpenAI = require('openai');

async function runDeepseekTest() {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.AI_MODEL || process.env.MODEL_NAME || 'deepseek-reasoner';

    if (!apiKey) {
        console.error('❌ 未配置 DEEPSEEK_API_KEY / OPENAI_API_KEY');
        return false;
    }

    const client = new OpenAI({
        apiKey,
        baseURL,
        timeout: 15000
    });

    try {
        const models = await client.models.list();
        console.log(`✅ 模型接口可用，可见模型数量: ${models.data.length}`);

        const completion = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: 'Reply with: ok' }],
            temperature: 0,
            max_tokens: 16
        });

        console.log('✅ 对话接口可用:', completion.choices?.[0]?.message?.content || '(empty)');
        return true;
    } catch (error) {
        console.error('❌ DeepSeek 接口测试失败:', error.message);
        return false;
    }
}

if (require.main === module) {
    runDeepseekTest()
        .then((success) => process.exit(success ? 0 : 1))
        .catch((error) => {
            console.error('❌ DeepSeek 测试失败:', error.message);
            process.exit(1);
        });
}

module.exports = { runDeepseekTest };
