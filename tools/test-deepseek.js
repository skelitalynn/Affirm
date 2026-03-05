#!/usr/bin/env node
// 快速测试DeepSeek连接

require('dotenv').config();
const OpenAI = require('openai');

async function testDeepSeek() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    const model = 'deepseek-reasoner';
    
    console.log('🔍 测试DeepSeek连接');
    console.log(`   API密钥: ${apiKey ? apiKey.substring(0, 10) + '...' : '未配置'}`);
    console.log(`   基础URL: ${baseURL}`);
    console.log(`   模型: ${model}`);
    
    if (!apiKey) {
        console.error('❌ DeepSeek API密钥未配置');
        return false;
    }
    
    const client = new OpenAI({
        apiKey,
        baseURL,
        timeout: 10000
    });
    
    try {
        console.log('🧪 获取模型列表...');
        const models = await client.models.list();
        console.log(`✅ 可用模型: ${models.data.length}个`);
        models.data.slice(0, 3).forEach(m => console.log(`   - ${m.id}`));
        
        console.log('🧪 测试聊天完成...');
        const completion = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: 'Hello' }],
            temperature: 0.7,
            max_tokens: 100
        });
        
        console.log(`✅ 聊天完成成功:`);
        console.log(`   回复: ${completion.choices[0].message.content}`);
        return true;
    } catch (error) {
        console.error(`❌ 失败: ${error.message}`);
        if (error.response) {
            console.error(`   状态: ${error.response.status}`);
            console.error(`   数据: ${JSON.stringify(error.response.data)}`);
        }
        return false;
    }
}

testDeepSeek().then(success => {
    console.log(success ? '🎉 DeepSeek连接正常' : '❌ DeepSeek连接失败');
    process.exit(success ? 0 : 1);
});