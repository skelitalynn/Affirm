#!/usr/bin/env node
/**
 * Claude API详细诊断脚本
 * 测试AiGoCode API的各种端点和参数组合
 */

require('dotenv').config();
const OpenAI = require('openai');
const https = require('https');

async function testEndpoint(apiKey, baseURL, endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, baseURL);
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'OpenClaw-Affirm/1.0'
            }
        };
        
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    data: data
                });
            });
        });
        
        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function diagnoseClaudeAPI() {
    console.log('🔍 Claude API详细诊断\n');
    
    const apiKey = process.env.CLAUDE_API_KEY;
    const baseURL = process.env.CLAUDE_BASE_URL || 'https://api.aigocode.com/v1';
    const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
    
    console.log('📊 配置信息:');
    console.log(`   密钥: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log(`   基础URL: ${baseURL}`);
    console.log(`   模型: ${model}`);
    
    if (!apiKey) {
        console.error('❌ API密钥未配置');
        return;
    }
    
    // 创建OpenAI客户端
    const client = new OpenAI({
        apiKey,
        baseURL,
        timeout: 10000
    });
    
    console.log('\n🧪 测试1: 使用OpenAI SDK测试模型列表...');
    try {
        const models = await client.models.list();
        console.log(`✅ 模型列表成功: ${models.data.length}个模型`);
        models.data.forEach(m => console.log(`   - ${m.id}`));
    } catch (error) {
        console.error(`❌ 模型列表失败: ${error.message}`);
    }
    
    console.log('\n🧪 测试2: 原始HTTP请求测试聊天完成端点...');
    const endpoints = [
        '/v1/chat/completions',
        '/chat/completions',
        '/completions',
        '/api/chat/completions',
        '/claude/chat/completions'
    ];
    
    for (const endpoint of endpoints) {
        console.log(`   测试端点: ${endpoint}`);
        try {
            const response = await testEndpoint(apiKey, baseURL, endpoint, 'POST', {
                model: model,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            });
            
            console.log(`     状态: ${response.status} ${response.statusText}`);
            if (response.status === 200) {
                console.log(`     ✅ 成功！端点有效: ${endpoint}`);
                console.log(`     响应数据: ${response.data.substring(0, 200)}...`);
                break;
            } else if (response.status === 404) {
                console.log(`     ❌ 404 - 端点不存在`);
            } else {
                console.log(`     ⚠️  其他状态: ${response.status}`);
                console.log(`     响应: ${response.data.substring(0, 200)}...`);
            }
        } catch (error) {
            console.log(`     ❌ 请求失败: ${error.message}`);
        }
    }
    
    console.log('\n🧪 测试3: 测试不同的模型名称...');
    const modelVariants = [
        model,
        'claude-sonnet-4-6-latest',
        'claude-sonnet-4-6-preview',
        'claude-sonnet',
        'sonnet-4-6',
        'claude'
    ];
    
    for (const modelVariant of modelVariants) {
        console.log(`   测试模型: ${modelVariant}`);
        try {
            const response = await testEndpoint(apiKey, baseURL, '/v1/chat/completions', 'POST', {
                model: modelVariant,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            });
            
            console.log(`     状态: ${response.status}`);
            if (response.status === 200) {
                console.log(`     ✅ 模型有效: ${modelVariant}`);
                break;
            } else if (response.status === 400 || response.status === 404) {
                console.log(`     ❌ 模型无效`);
                try {
                    const data = JSON.parse(response.data);
                    if (data.error?.message) {
                        console.log(`     错误消息: ${data.error.message}`);
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        } catch (error) {
            console.log(`     ❌ 请求失败: ${error.message}`);
        }
    }
    
    console.log('\n🧪 测试4: 测试备用基础URL...');
    const baseURLs = [
        baseURL,
        'https://api.aigocode.com',
        'https://aigocode.com/api/v1',
        'https://claude.ai/api/v1',
        'https://api.anthropic.com/v1'  // 官方Claude API
    ];
    
    for (const testBaseURL of baseURLs) {
        console.log(`   测试基础URL: ${testBaseURL}`);
        try {
            const testClient = new OpenAI({
                apiKey,
                baseURL: testBaseURL,
                timeout: 5000
            });
            
            const models = await testClient.models.list();
            console.log(`     ✅ 可用模型: ${models.data.length}个`);
            
            // 尝试聊天完成
            try {
                const completion = await testClient.chat.completions.create({
                    model: model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 10
                });
                console.log(`     🎉 聊天完成成功！端点: ${testBaseURL}`);
                console.log(`       有效模型: ${model}`);
                return; // 找到有效配置，退出
            } catch (chatError) {
                console.log(`     ❌ 聊天完成失败: ${chatError.message}`);
            }
        } catch (error) {
            console.log(`     ❌ 连接失败: ${error.message}`);
        }
    }
    
    console.log('\n🔍 问题分析:');
    console.log('   1. AiGoCode可能没有完全实现OpenAI兼容API');
    console.log('   2. 可能需要特定的模型名称或端点路径');
    console.log('   3. API密钥可能没有聊天完成权限');
    console.log('   4. 服务可能暂时不可用');
    
    console.log('\n💡 建议:');
    console.log('   1. 联系AiGoCode支持，询问正确的API端点');
    console.log('   2. 考虑使用官方Claude API（需要申请）');
    console.log('   3. 暂时使用DeepSeek作为替代方案');
    console.log('   4. 检查AiGoCode文档获取最新信息');
    
    console.log('\n📋 结论:');
    console.log('   模型列表API工作，但聊天完成API可能不完整或不兼容。');
}

diagnoseClaudeAPI().catch(error => {
    console.error('💥 诊断过程出错:', error);
    process.exit(1);
});