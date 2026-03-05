// AI服务 - 基于OpenAI兼容API，支持多提供商，无降级逻辑
const OpenAI = require('openai');

class AIService {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.model = config.model;
        this.provider = config.provider;
        this.initialized = false;
    }

    async initialize() {
        console.log('🤖 初始化AI服务...');
        
        const apiKey = this.config.apiKey;
        const baseURL = this.config.baseURL;
        
        if (!apiKey) {
            console.warn(`⚠️  ${this.provider} API密钥未配置，AI功能将不可用`);
            return false;
        }

        try {
            this.client = new OpenAI({
                apiKey: apiKey,
                baseURL: baseURL,
                timeout: 15000
            });

            // 测试连接
            console.log(`📊 测试${this.provider}连接...`);
            const models = await this.client.models.list();
            console.log(`✅ AI服务初始化完成，可用模型: ${models.data.length}个`);
            console.log(`📊 使用模型: ${this.model}, API端点: ${baseURL}, 提供商: ${this.provider}`);
            
            this.initialized = true;
            return true;
            
        } catch (error) {
            console.error(`❌ ${this.provider} AI服务初始化失败:`, error.message);
            
            // 提供详细的错误诊断
            if (error.code === 'invalid_api_key' || error.status === 401) {
                console.error(`🔍 API密钥验证失败，请检查${this.provider.toUpperCase()}_API_KEY是否正确`);
            } else if (error.code === 'rate_limited' || error.status === 429) {
                console.error('🔍 API调用频率受限，请稍后重试');
            } else if (error.message.includes('404') || error.message.includes('Not Found')) {
                console.error(`🔍 API端点可能不存在: ${baseURL}`);
                console.error(`💡 请检查${this.provider.toUpperCase()}_BASE_URL配置`);
            } else if (error.message.includes('network') || error.message.includes('timeout')) {
                console.error('🔍 网络连接失败，请检查网络设置');
            }
            
            console.warn(`⚠️  ${this.provider} AI功能将不可用，但机器人仍可运行`);
            return false;
        }
    }

    /**
     * 生成AI回复
     * @param {Object} context - 对话上下文
     * @returns {Promise<string>} AI回复
     */
    async generateResponse(context) {
        if (!this.client || !this.initialized) {
            throw new Error('AI服务未初始化');
        }

        // 准备消息
        const messages = this.prepareMessages(context);
        
        try {
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                temperature: this.config.temperature || 0.7,
                max_tokens: this.config.maxTokens || 1000,
                top_p: 0.9,
                timeout: 10000
            });

            const response = completion.choices[0].message.content;
            return response.trim();
            
        } catch (error) {
            console.error(`❌ ${this.provider} AI生成回复失败:`, error.message);
            console.error('🔍 AI错误堆栈:', error.stack);
            
            // 如果是API错误，尝试提取响应信息
            if (error.response) {
                console.error('📡 AI响应状态:', error.response.status);
                console.error('📡 AI响应状态文本:', error.response.statusText);
                if (error.response.data) {
                    try {
                        console.error('📡 AI响应数据:', JSON.stringify(error.response.data, null, 2));
                    } catch (e) {
                        console.error('📡 AI响应数据（原始）:', String(error.response.data).substring(0, 500));
                    }
                }
            }
            
            // 返回友好的错误消息，确保机器人永不沉默
            if (error.message.includes('rate limit') || error.message.includes('rate_limit')) {
                return '抱歉，AI服务暂时繁忙，请稍后再试。';
            } else if (error.message.includes('authentication') || error.message.includes('auth')) {
                return 'AI服务认证失败，请检查配置。';
            } else if (error.message.includes('insufficient_quota')) {
                return 'AI服务额度不足，请稍后再试。';
            } else if (error.message.includes('404') || error.message.includes('page not found')) {
                return `AI服务端点暂时不可用，请检查${this.provider.toUpperCase()}_BASE_URL配置。`;
            } else if (error.message.includes('model_not_found')) {
                return `AI模型不可用，请检查AI_MODEL配置 (当前: ${this.model})。`;
            } else {
                return '抱歉，生成回复时出现了问题。请稍后再试。';
            }
        }
    }

    /**
     * 准备消息格式
     * @param {Object} context - 对话上下文
     * @returns {Array} 消息数组
     */
    prepareMessages(context) {
        const messages = [];
        
        // 系统提示
        const systemPrompt = `你是一个有帮助的显化导师，帮助用户通过积极肯定语和思维重塑来达成目标。
        
用户信息：
- 用户名: ${context.user.username || '用户'}
- 用户ID: ${context.user.id}

请保持温暖、鼓励的语气，提供实用的建议和积极的肯定语。
如果用户分享目标或愿望，帮助他们转化为积极的肯定语。
如果用户遇到困难，提供支持和实用的建议。`;
        
        messages.push({
            role: 'system',
            content: systemPrompt
        });

        // 添加上下文消息（最近20条）
        if (context.recentMessages && context.recentMessages.length > 0) {
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

    /**
     * 测试AI连接
     * @returns {Promise<boolean>} 测试结果
     */
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

module.exports = AIService;