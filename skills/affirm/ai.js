// AI模型集成 - 支持DeepSeek和OpenAI
const OpenAI = require('openai');

class AIModel {
    constructor(config) {
        this.config = config;
        this.openai = null;
    }

    async initialize() {
        console.log('🤖 初始化AI模型...');
        
        // 优先使用DeepSeek配置，兼容现有OpenAI配置
        const apiKey = this.config.deepseekApiKey || this.config.openaiApiKey;
        const baseURL = this.config.deepseekBaseUrl || this.config.openaiBaseUrl || 'https://api.deepseek.com/v1';
        this.model = this.config.model || 'deepseek-reasoner';
        
        if (!apiKey) {
            throw new Error('AI API密钥未配置 (需要deepseekApiKey或openaiApiKey)');
        }

        // 创建OpenAI兼容客户端
        this.openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL
        });

        // 测试连接
        try {
            const models = await this.openai.models.list();
            console.log(`✅ AI模型初始化完成，可用模型: ${models.data.length}个`);
            console.log(`📊 使用模型: ${this.model}, API端点: ${baseURL}`);
        } catch (error) {
            console.error('❌ AI模型初始化失败:', error.message);
            throw error;
        }
    }

    async generateResponse(context) {
        if (!this.openai) {
            throw new Error('AI模型未初始化');
        }

        try {
            const messages = this.prepareMessages(context);
            
            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 1000,
                top_p: 0.9
            });

            const response = completion.choices[0].message.content;
            return response;
        } catch (error) {
            console.error('❌ AI生成回复失败:', error.message);
            
            // 返回友好的错误消息
            if (error.message.includes('rate limit')) {
                return '抱歉，AI服务暂时繁忙，请稍后再试。';
            } else if (error.message.includes('authentication')) {
                return 'AI服务认证失败，请检查配置。';
            } else {
                return '抱歉，生成回复时出现了问题。请稍后再试。';
            }
        }
    }

    prepareMessages(context) {
        const messages = [];
        
        // 添加系统提示
        messages.push({
            role: 'system',
            content: `你是一个有帮助的AI助手，专门帮助用户记录想法、管理目标和提供建议。
            
用户信息：
- 用户名: ${context.user.username}
- 用户ID: ${context.user.id}

请保持友好、专业的语气，提供有用的建议和反馈。`
        });

        // 添加上下文消息
        if (context.recentMessages && context.recentMessages.length > 0) {
            // 添加最近的消息作为上下文
            context.recentMessages.forEach(msg => {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            });
        }

        // 添加当前用户消息
        messages.push({
            role: 'user',
            content: context.userMessage
        });

        return messages;
    }

    async testConnection() {
        try {
            const response = await this.generateResponse({
                user: { username: '测试用户', id: 'test' },
                userMessage: 'Hello, are you working?',
                recentMessages: []
            });
            
            console.log('✅ AI连接测试成功:', response.substring(0, 50) + '...');
            return true;
        } catch (error) {
            console.error('❌ AI连接测试失败:', error.message);
            return false;
        }
    }
}

module.exports = AIModel;