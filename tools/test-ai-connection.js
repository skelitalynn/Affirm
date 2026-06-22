#!/usr/bin/env node
/**
 * AI连接测试脚本
 * 按当前 provider 选择 OpenAI 兼容接口或 Gemini 原生接口
 */

require('dotenv').config();
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../src/config');

function formatEndpointLabel(aiConfig) {
    if (aiConfig.provider === 'gemini') {
        const baseURL = String(aiConfig.baseURL || '').replace(/\/+$/, '');
        const apiVersion = aiConfig.apiVersion || 'v1beta';
        return `${baseURL}/${apiVersion}`;
    }

    return aiConfig.baseURL;
}

function printErrorDetails(error) {
    console.error(`   错误类型: ${error.type || '未知'}`);
    console.error(`   错误代码: ${error.code || '无'}`);

    if (error.response) {
        console.error(`   响应状态: ${error.response.status}`);
        console.error(`   响应状态文本: ${error.response.statusText}`);
        console.error(`   响应头: ${JSON.stringify(error.response.headers)}`);
        if (error.response.data) {
            try {
                console.error(`   响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
            } catch (innerError) {
                console.error(`   响应数据(原始): ${String(error.response.data).substring(0, 500)}`);
            }
        }
    }
}

async function testOpenAICompatibleConnection(aiConfig) {
    const client = new OpenAI({
        apiKey: aiConfig.apiKey,
        baseURL: aiConfig.baseURL,
        timeout: 10000
    });

    console.log('\n🧪 测试1: 列出可用模型...');
    try {
        const models = await client.models.list();
        console.log(`✅ 模型列表成功，可用模型: ${models.data.length}个`);
        console.log('   前5个模型:');
        models.data.slice(0, 5).forEach((model) => console.log(`     - ${model.id}`));
    } catch (error) {
        console.error(`❌ 获取模型列表失败: ${error.message}`);
        printErrorDetails(error);
        return false;
    }

    console.log('\n🧪 测试2: 测试聊天完成...');
    try {
        const completion = await client.chat.completions.create({
            model: aiConfig.model,
            messages: [
                { role: 'system', content: '你是一个测试助手。' },
                { role: 'user', content: 'Hello, are you working?' }
            ],
            temperature: 0.7,
            max_tokens: 100
        });

        console.log('✅ 聊天完成成功！');
        console.log(`   回复: ${completion.choices[0].message.content}`);
        console.log(`   使用模型: ${completion.model}`);
        console.log(`   Token使用: ${completion.usage?.total_tokens || '未知'}`);
        return true;
    } catch (error) {
        console.error(`❌ 聊天完成失败: ${error.message}`);
        printErrorDetails(error);
        return false;
    }
}

async function testGeminiConnection(aiConfig) {
    const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
    const requestOptions = {
        baseUrl: aiConfig.baseURL,
        apiVersion: aiConfig.apiVersion || 'v1beta',
        timeout: 30000
    };
    const model = genAI.getGenerativeModel(
        {
            model: aiConfig.model,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 100
            }
        },
        requestOptions
    );

    console.log('\n🧪 测试1: 测试 token 计数...');
    try {
        const tokenInfo = await model.countTokens('Hello, are you working?');
        console.log(`✅ Token计数成功，总 tokens: ${tokenInfo.totalTokens || '未知'}`);
    } catch (error) {
        console.error(`❌ Token计数失败: ${error.message}`);
        printErrorDetails(error);
        return false;
    }

    console.log('\n🧪 测试2: 测试内容生成...');
    try {
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: 'Hello, are you working? Reply with a short confirmation.' }]
            }]
        });

        console.log('✅ 内容生成成功！');
        console.log(`   回复: ${result.response.text()}`);
        console.log(`   使用模型: ${aiConfig.model}`);
        return true;
    } catch (error) {
        console.error(`❌ 内容生成失败: ${error.message}`);
        printErrorDetails(error);
        return false;
    }
}

async function testAIConnection() {
    console.log('🔍 AI连接测试\n');

    const aiConfig = config.ai;

    console.log('📊 配置信息:');
    console.log(`   提供商: ${aiConfig.provider}`);
    console.log(`   API密钥: ${aiConfig.apiKey ? aiConfig.apiKey.substring(0, 10) + '...' + aiConfig.apiKey.substring(aiConfig.apiKey.length - 4) : '未配置'}`);
    console.log(`   基础URL: ${formatEndpointLabel(aiConfig)}`);
    console.log(`   模型: ${aiConfig.model}`);

    if (!aiConfig.apiKey) {
        console.error('❌ API密钥未配置');
        return false;
    }

    if (aiConfig.provider === 'gemini') {
        return testGeminiConnection(aiConfig);
    }

    return testOpenAICompatibleConnection(aiConfig);
}

testAIConnection().then((success) => {
    console.log(`\n${success ? '🎉 AI连接测试成功' : '❌ AI连接测试失败'}`);
    process.exit(success ? 0 : 1);
}).catch((error) => {
    console.error('💥 测试过程出错:', error);
    process.exit(1);
});
