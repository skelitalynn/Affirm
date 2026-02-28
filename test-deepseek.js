// 测试DeepSeek配置
require('dotenv').config();
const config = require('./src/config');
const OpenAI = require('openai');

console.log('🔧 当前AI配置:');
console.log('- Provider:', config.ai.provider);
console.log('- Model:', config.ai.model);
console.log('- BaseURL:', config.ai.baseURL);
console.log('- API Key present:', !!config.ai.apiKey);

// 测试API连接
async function testAPI() {
    if (!config.ai.apiKey) {
        console.log('❌ 未配置API密钥');
        return false;
    }

    try {
        const openai = new OpenAI({
            apiKey: config.ai.apiKey,
            baseURL: config.ai.baseURL
        });

        console.log('🤖 测试API连接...');
        const models = await openai.models.list();
        console.log(`✅ API连接成功，可用模型: ${models.data.length}个`);
        
        // 显示前几个模型
        models.data.slice(0, 5).forEach(model => {
            console.log(`  - ${model.id}`);
        });

        // 测试聊天功能
        console.log('💬 测试聊天功能...');
        const completion = await openai.chat.completions.create({
            model: config.ai.model,
            messages: [{ role: 'user', content: 'Hello, reply with "OK" if working.' }],
            max_tokens: 10
        });

        const response = completion.choices[0].message.content;
        console.log(`✅ 聊天测试成功: ${response}`);
        return true;
    } catch (error) {
        console.error('❌ API测试失败:', error.message);
        console.error('错误详情:', error.code || error.type);
        return false;
    }
}

// 运行测试
testAPI().then(success => {
    process.exit(success ? 0 : 1);
});