#!/usr/bin/env node
/**
 * AI连接测试脚本
 * 测试 AiGoCode/OpenAI 兼容 API 连接
 */

require('dotenv').config();
const OpenAI = require('openai');
const { resolveAIConfig } = require('../src/config/ai-config');

async function testAIConnection() {
    console.log('🔍 AI连接测试\n');
    
    const aiConfig = resolveAIConfig(process.env);
    const providerType = aiConfig.providerType;
    const apiKey = aiConfig.apiKey;
    const baseURL = aiConfig.baseURL;
    const model = aiConfig.model;
    
    console.log('📊 配置信息:');
    console.log(`   Provider Type: ${providerType}`);
    console.log(`   API密钥: ${apiKey ? apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4) : '未配置'}`);
    console.log(`   基础URL: ${baseURL}`);
    console.log(`   模型: ${model}`);
    
    if (!apiKey) {
        console.error('❌ API密钥未配置');
        return false;
    }
    
    // 创建客户端
    const client = new OpenAI({
        apiKey,
        baseURL,
        timeout: 10000
    });
    
    console.log('\n🧪 测试1: 列出可用模型...');
    try {
        const models = await client.models.list();
        console.log(`✅ 模型列表成功，可用模型: ${models.data.length}个`);
        console.log('   前5个模型:');
        models.data.slice(0, 5).forEach(m => console.log(`     - ${m.id}`));
    } catch (error) {
        console.error(`❌ 获取模型列表失败: ${error.message}`);
        if (error.response) {
            console.error(`   状态码: ${error.response.status}`);
            console.error(`   状态文本: ${error.response.statusText}`);
            if (error.response.data) {
                console.error(`   响应数据: ${JSON.stringify(error.response.data)}`);
            }
        }
        return false;
    }
    
    console.log('\n🧪 测试2: 测试聊天完成...');
    try {
        const completion = await client.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: '你是一个测试助手。' },
                { role: 'user', content: 'Hello, are you working?' }
            ],
            temperature: 0.7,
            max_tokens: 100
        });
        
        console.log(`✅ 聊天完成成功！`);
        console.log(`   回复: ${completion.choices[0].message.content}`);
        console.log(`   使用模型: ${completion.model}`);
        console.log(`   Token使用: ${completion.usage?.total_tokens || '未知'}`);
        return true;
        
    } catch (error) {
        console.error(`❌ 聊天完成失败: ${error.message}`);
        console.error(`   错误类型: ${error.type || '未知'}`);
        console.error(`   错误代码: ${error.code || '无'}`);
        
        if (error.response) {
            console.error(`   响应状态: ${error.response.status}`);
            console.error(`   响应状态文本: ${error.response.statusText}`);
            console.error(`   响应头: ${JSON.stringify(error.response.headers)}`);
            if (error.response.data) {
                try {
                    console.error(`   响应数据: ${JSON.stringify(error.response.data, null, 2)}`);
                } catch (e) {
                    console.error(`   响应数据(原始): ${String(error.response.data).substring(0, 500)}`);
                }
            }
        }
        
        // 检查常见问题
        if (error.message.includes('404')) {
            console.error('\n🔍 404错误分析:');
            console.error('   可能的原因:');
            console.error('     1. 基础URL不正确');
            console.error('     2. 模型不存在或不可用');
            console.error('     3. API端点路径错误');
            console.error('     4. 服务暂时不可用');
            
            // 测试不同的端点
            console.error('\n🔄 测试备用端点...');
            const normalizedBaseUrl = baseURL.replace(/\/$/, '');
            const endpoints = [
                normalizedBaseUrl,
                normalizedBaseUrl.endsWith('/v1') ? normalizedBaseUrl.replace(/\/v1$/, '') : `${normalizedBaseUrl}/v1`,
                'https://api.openai.com/v1'
            ];
            
            for (const endpoint of endpoints) {
                if (endpoint === baseURL) continue;
                console.log(`   测试端点: ${endpoint}`);
                try {
                    const testClient = new OpenAI({ apiKey, baseURL: endpoint, timeout: 5000 });
                    const testModels = await testClient.models.list();
                    console.log(`     ✅ 可用模型: ${testModels.data.length}个`);
                    console.log(`     💡 建议使用此端点: ${endpoint}`);
                    break;
                } catch (e) {
                    console.log(`     ❌ 失败: ${e.message}`);
                }
            }
        }
        
        return false;
    }
}

// 运行测试
testAIConnection().then(success => {
    console.log(`\n${success ? '🎉 AI连接测试成功' : '❌ AI连接测试失败'}`);
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('💥 测试过程出错:', error);
    process.exit(1);
});
