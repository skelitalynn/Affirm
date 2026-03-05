// AI服务 - 基于OpenAI兼容API（支持Claude降级）
const OpenAI = require('openai');
require('dotenv').config();

class AIService {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.model = config.model || 'deepseek-reasoner';
        this.provider = config.provider || 'deepseek';
        this.fallbackClient = null; // 备用客户端（DeepSeek）
        this.initialized = false;
    }

    async initialize() {
        console.log('🤖 初始化AI服务...');
        
        const apiKey = this.config.apiKey;
        const baseURL = this.config.baseURL || (this.provider === 'claude' ? 'https://api.aigocode.com/v1' : 'https://api.deepseek.com/v1');
        
        if (!apiKey) {
            console.warn('⚠️  AI API密钥未配置，AI功能将不可用');
            return false;
        }

        try {
            this.client = new OpenAI({
                apiKey: apiKey,
                baseURL: baseURL,
                timeout: 15000
            });

            // 测试连接（对Claude更宽容）
            console.log(`📊 测试${this.provider}连接...`);
            const models = await this.client.models.list();
            console.log(`✅ AI服务初始化完成，可用模型: ${models.data.length}个`);
            console.log(`📊 使用模型: ${this.model}, API端点: ${baseURL}, 提供商: ${this.provider}`);
            
            // 如果是Claude，额外检查聊天完成端点是否可用
            if (this.provider === 'claude') {
                console.log('🔍 Claude提供商检测到，聊天完成端点可能不兼容');
                console.log('💡 如遇404错误，将自动尝试备用方案');
            }
            
            // 初始化备用客户端（DeepSeek）
            await this.initializeFallback();
            
            this.initialized = true;
            return true;
            
        } catch (error) {
            console.error(`❌ ${this.provider} AI服务初始化失败:`, error.message);
            
            // 对于Claude，即使初始化失败也尝试继续（可能只是模型列表问题）
            if (this.provider === 'claude') {
                console.warn('⚠️  Claude模型列表可能有问题，但尝试继续初始化...');
                
                // 仍然创建客户端，即使测试失败
                this.client = new OpenAI({
                    apiKey: apiKey,
                    baseURL: baseURL,
                    timeout: 15000
                });
                
                // 尝试初始化备用
                await this.initializeFallback();
                
                this.initialized = true;
                console.warn('⚠️  Claude AI服务以降级模式运行，可能无法正常工作');
                return true;
            }
            
            console.warn('⚠️  AI功能可能不可用，但机器人仍可运行');
            return false;
        }
    }
    
    /**
     * 初始化备用DeepSeek客户端
     */
    async initializeFallback() {
        const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
        if (!deepseekApiKey || deepseekApiKey.includes('your_')) {
            console.log('ℹ️  未配置DeepSeek备用API密钥，降级功能受限');
            return;
        }
        
        try {
            this.fallbackClient = new OpenAI({
                apiKey: deepseekApiKey,
                baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
                timeout: 15000
            });
            
            // 简单测试备用客户端
            await this.fallbackClient.models.list();
            console.log('✅ DeepSeek备用客户端初始化完成');
        } catch (error) {
            console.warn('⚠️  DeepSeek备用客户端初始化失败:', error.message);
            this.fallbackClient = null;
        }
    }
    
    /**
     * 使用备用客户端生成回复
     */
    async generateResponseWithFallback(messages) {
        if (!this.fallbackClient) {
            throw new Error('备用客户端不可用');
        }
        
        try {
            const completion = await this.fallbackClient.chat.completions.create({
                model: 'deepseek-reasoner',
                messages: messages,
                temperature: 0.7,
                max_tokens: 1000,
                top_p: 0.9
            });
            
            return completion.choices[0].message.content.trim();
        } catch (error) {
            console.error('❌ 备用AI生成回复失败:', error.message);
            throw error;
        }
    }

    /**
     * 生成AI回复（支持Claude降级）
     * @param {Object} context - 对话上下文
     * @returns {Promise<string>} AI回复
     */
    async generateResponse(context) {
        if (!this.client && !this.fallbackClient) {
            throw new Error('AI服务未初始化');
        }

        // 准备消息
        const messages = this.prepareMessages(context);
        
        // 如果是Claude，先尝试Claude API，失败时使用备用
        if (this.provider === 'claude' && this.client) {
            try {
                console.log('🔄 尝试使用Claude生成回复...');
                const completion = await this.client.chat.completions.create({
                    model: this.model,
                    messages: messages,
                    temperature: this.config.temperature || 0.7,
                    max_tokens: this.config.maxTokens || 1000,
                    top_p: 0.9,
                    timeout: 10000  // 10秒超时
                });

                const response = completion.choices[0].message.content;
                console.log('✅ Claude回复生成成功');
                return response.trim();
                
            } catch (error) {
                console.error('❌ Claude API失败:', error.message);
                
                // 检查是否为404或端点不存在错误
                const isEndpointError = error.message.includes('404') || 
                                       error.message.includes('page not found') ||
                                       error.message.includes('endpoint');
                
                if (isEndpointError) {
                    console.warn('⚠️  Claude聊天完成端点不可用，尝试备用方案...');
                    
                    // 尝试备用客户端
                    if (this.fallbackClient) {
                        try {
                            console.log('🔄 切换到DeepSeek备用方案...');
                            const fallbackResponse = await this.generateResponseWithFallback(messages);
                            console.log('✅ DeepSeek备用回复生成成功');
                            return `[使用DeepSeek备用] ${fallbackResponse}`;
                        } catch (fallbackError) {
                            console.error('❌ 备用方案也失败:', fallbackError.message);
                            // 继续到通用错误处理
                        }
                    } else {
                        console.warn('⚠️  无可用备用客户端，返回降级响应');
                    }
                }
                
                // 如果不是端点错误或备用也失败，继续到通用错误处理
                console.error('🔍 Claude错误详情:', error.message);
                if (error.response) {
                    console.error('📡 响应状态:', error.response.status);
                }
            }
        }
        
        // 通用处理（非Claude或Claude降级后）
        try {
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                temperature: this.config.temperature || 0.7,
                max_tokens: this.config.maxTokens || 1000,
                top_p: 0.9
            });

            const response = completion.choices[0].message.content;
            return response.trim();
            
        } catch (error) {
            console.error('❌ AI生成回复失败:', error.message);
            console.error('🔍 AI错误堆栈:', error.stack);
            
            // 如果是OpenAI API错误，尝试提取响应信息
            if (error.response) {
                console.error('📡 AI响应状态:', error.response.status);
                console.error('📡 AI响应头:', JSON.stringify(error.response.headers));
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
                return 'AI服务端点暂时不可用，正在修复中。';
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