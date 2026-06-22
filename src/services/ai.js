// AI服务 - 支持 OpenAI 兼容接口与 Gemini 原生接口
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

function toStringArray(value, maxItems = 10) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value
            .map((item) => String(item || '').trim())
            .filter(Boolean)
    )).slice(0, maxItems);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeScore(value, fallback = 0.5) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(0, Math.min(1, Number(parsed.toFixed(3))));
}

function normalizeMemoryPatchPayload(payload = {}) {
    const source = isPlainObject(payload) ? payload : {};

    return {
        should_update: Boolean(source.should_update),
        summary: typeof source.summary === 'string' ? source.summary.trim() : '',
        goals: typeof source.goals === 'string' ? source.goals.trim() : '',
        status: typeof source.status === 'string' ? source.status.trim() : '',
        facts: toStringArray(source.facts, 12),
        communication_preferences: toStringArray(source.communication_preferences, 12),
        open_loops: toStringArray(source.open_loops, 12)
    };
}

function normalizeMemoryEventCandidate(candidate = {}) {
    if (!isPlainObject(candidate)) {
        return null;
    }

    const eventType = typeof candidate.event_type === 'string' ? candidate.event_type.trim() : '';
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const summary = typeof candidate.summary === 'string' ? candidate.summary.trim() : '';

    if (!eventType || !title || !summary) {
        return null;
    }

    return {
        event_type: eventType,
        title,
        summary,
        detail: typeof candidate.detail === 'string' ? candidate.detail.trim().slice(0, 4000) : '',
        keywords: toStringArray(candidate.keywords, 16),
        source_message_ids: toStringArray(candidate.source_message_ids, 20),
        importance: normalizeScore(candidate.importance, 0.5),
        confidence: normalizeScore(candidate.confidence, 0.5),
        happened_at: typeof candidate.happened_at === 'string' && candidate.happened_at.trim()
            ? candidate.happened_at.trim()
            : null,
        metadata: isPlainObject(candidate.metadata) ? candidate.metadata : {}
    };
}

function buildRecalledMemoryBlock(context = {}) {
    const explicitBlock = typeof context.recalledMemoryBlock === 'string'
        ? context.recalledMemoryBlock.trim()
        : '';

    if (explicitBlock) {
        return explicitBlock;
    }

    if (!Array.isArray(context.recalledMemoryEvents) || context.recalledMemoryEvents.length === 0) {
        return '';
    }

    return context.recalledMemoryEvents
        .slice(0, 5)
        .map((event, index) => {
            const title = String(event?.title || '').trim();
            const summary = String(event?.summary || '').trim();
            return `${index + 1}. ${title}\n摘要: ${summary}`.trim();
        })
        .filter(Boolean)
        .join('\n\n');
}

function stripMarkdownDecorators(text) {
    return String(text || '')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
        .replace(/```json\s*/gi, '')
        .replace(/```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/_([^_\n]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1');
}

class AIService {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.model = config.model;
        this.provider = config.provider;
        this.initialized = false;
        this.lastInitError = null;
        this.lastGenerationMeta = null;
    }

    isAvailable() {
        return Boolean(this.client && this.initialized);
    }

    getLastGenerationMeta() {
        return isPlainObject(this.lastGenerationMeta)
            ? JSON.parse(JSON.stringify(this.lastGenerationMeta))
            : null;
    }

    getEndpointLabel() {
        if (this.provider === 'gemini') {
            const apiVersion = this.config.apiVersion || 'v1beta';
            return `${String(this.config.baseURL || '').replace(/\/+$/, '')}/${apiVersion}`;
        }

        return this.config.baseURL;
    }

    getGeminiRequestOptions(timeout = 15000) {
        return {
            baseUrl: this.config.baseURL,
            apiVersion: this.config.apiVersion || 'v1beta',
            timeout
        };
    }

    createGeminiModel({ systemInstruction = '', generationConfig = {}, timeout = 15000 } = {}) {
        const modelParams = {
            model: this.model
        };

        if (Object.keys(generationConfig).length > 0) {
            modelParams.generationConfig = generationConfig;
        }

        if (systemInstruction) {
            modelParams.systemInstruction = {
                role: 'system',
                parts: [{ text: systemInstruction }]
            };
        }

        return this.client.getGenerativeModel(modelParams, this.getGeminiRequestOptions(timeout));
    }

    buildGeminiGenerationConfig({ temperature, maxTokens, topP, responseMimeType } = {}) {
        const generationConfig = {};

        if (Number.isFinite(temperature)) {
            generationConfig.temperature = temperature;
        }

        if (Number.isFinite(maxTokens)) {
            generationConfig.maxOutputTokens = maxTokens;
        }

        if (Number.isFinite(topP)) {
            generationConfig.topP = topP;
        }

        if (responseMimeType) {
            generationConfig.responseMimeType = responseMimeType;
        }

        if (Number.isFinite(this.config.thinkingBudget)) {
            generationConfig.thinkingConfig = {
                thinkingBudget: this.config.thinkingBudget
            };
        }

        return generationConfig;
    }

    buildGeminiRequest(messages = []) {
        const systemMessages = [];
        const contents = [];

        messages.forEach((message) => {
            const content = String(message?.content || '').trim();
            if (!content) {
                return;
            }

            if (message.role === 'system') {
                systemMessages.push(content);
                return;
            }

            const role = message.role === 'assistant' ? 'model' : 'user';
            const lastContent = contents[contents.length - 1];

            if (lastContent && lastContent.role === role) {
                lastContent.parts.push({ text: content });
                return;
            }

            contents.push({
                role,
                parts: [{ text: content }]
            });
        });

        return {
            systemInstruction: systemMessages.join('\n\n').trim(),
            contents
        };
    }

    buildGeminiCompletionMeta(response = {}) {
        const candidate = Array.isArray(response.candidates) ? response.candidates[0] : null;

        return {
            provider: this.provider,
            model: this.model,
            finish_reason: candidate?.finishReason || null,
            finish_message: candidate?.finishMessage || null,
            prompt_feedback: response.promptFeedback || null,
            safety_ratings: candidate?.safetyRatings || null,
            usage: response.usageMetadata || null
        };
    }

    buildOpenAICompletionMeta(completion = {}) {
        const choice = Array.isArray(completion.choices) ? completion.choices[0] : null;

        return {
            provider: this.provider,
            model: completion.model || this.model,
            response_id: completion.id || null,
            finish_reason: choice?.finish_reason || null,
            usage: completion.usage || null
        };
    }

    isLikelyTruncatedReply(replyText, completionMeta = {}) {
        const normalized = String(replyText || '').trim();
        if (!normalized) {
            return true;
        }

        const finishReason = String(completionMeta.finish_reason || '').trim().toLowerCase();
        if (finishReason === 'length' || finishReason === 'max_tokens') {
            return true;
        }

        const hasTerminalPunctuation = /[。！？!?…~]$/.test(normalized);
        if (hasTerminalPunctuation) {
            return false;
        }

        return normalized.length >= 10 && normalized.length <= 48 && !normalized.includes('\n');
    }

    async requestTextCompletion({
        messages,
        temperature,
        maxTokens,
        topP,
        responseMimeType
    }) {
        if (this.provider === 'gemini') {
            const { systemInstruction, contents } = this.buildGeminiRequest(messages);
            const model = this.createGeminiModel({
                systemInstruction,
                generationConfig: this.buildGeminiGenerationConfig({
                    temperature,
                    maxTokens,
                    topP,
                    responseMimeType
                }),
                timeout: 30000
            });

            const result = await model.generateContent({ contents });
            return {
                text: result.response.text().trim(),
                meta: this.buildGeminiCompletionMeta(result.response)
            };
        }

        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            top_p: topP,
            timeout: 10000
        });

        return {
            text: completion.choices?.[0]?.message?.content?.trim() || '',
            meta: this.buildOpenAICompletionMeta(completion)
        };
    }

    async initialize() {
        console.log('🤖 初始化AI服务...');
        
        const apiKey = this.config.apiKey;
        const endpointLabel = this.getEndpointLabel();
        
        if (!apiKey) {
            console.warn(`⚠️  ${this.provider} API密钥未配置，AI功能将不可用`);
            return false;
        }

        try {
            // 测试连接
            console.log(`📊 测试${this.provider}连接...`);

            if (this.provider === 'gemini') {
                this.client = new GoogleGenerativeAI(apiKey);
                const model = this.createGeminiModel({ timeout: 30000 });
                const tokenInfo = await model.countTokens('ping');
                const totalTokens = Number.isFinite(tokenInfo?.totalTokens) ? tokenInfo.totalTokens : '未知';
                console.log(`✅ AI服务初始化完成，token计数测试成功: ${totalTokens}`);
            } else {
                this.client = new OpenAI({
                    apiKey: apiKey,
                    baseURL: this.config.baseURL,
                    timeout: 15000
                });

                const models = await this.client.models.list();
                console.log(`✅ AI服务初始化完成，可用模型: ${models.data.length}个`);
            }

            console.log(`📊 使用模型: ${this.model}, API端点: ${endpointLabel}, 提供商: ${this.provider}`);
            
            this.initialized = true;
            this.lastInitError = null;
            return true;
            
        } catch (error) {
            this.client = null;
            this.initialized = false;
            this.lastInitError = error;
            console.error(`❌ ${this.provider} AI服务初始化失败:`, error.message);
            
            // 提供详细的错误诊断
            const normalizedMessage = String(error.message || '').toLowerCase();
            if (error.code === 'invalid_api_key' || error.status === 401 || normalizedMessage.includes('api key')) {
                console.error(`🔍 API密钥验证失败，请检查${this.provider.toUpperCase()}_API_KEY是否正确`);
            } else if (error.code === 'rate_limited' || error.status === 429 || normalizedMessage.includes('429')) {
                console.error('🔍 API调用频率受限，请稍后重试');
            } else if (normalizedMessage.includes('404') || normalizedMessage.includes('not found')) {
                console.error(`🔍 API端点可能不存在: ${endpointLabel}`);
                console.error(`💡 请检查${this.provider.toUpperCase()}_BASE_URL配置`);
            } else if (normalizedMessage.includes('network') || normalizedMessage.includes('timeout')) {
                console.error('🔍 网络连接失败，请检查网络设置');
            } else if (normalizedMessage.includes('no available accounts') || normalizedMessage.includes('503')) {
                console.error('🔍 上游模型账号池暂时不可用，请稍后再试');
            }
            
            console.warn(`⚠️  ${this.provider} AI功能将不可用，但机器人仍可运行`);
            return false;
        }
    }

    normalizeAssistantReply(rawContent) {
        const normalized = stripMarkdownDecorators(rawContent)
            .replace(/\r\n/g, '\n')
            .replace(/^\s{0,3}#{1,6}\s+/gm, '')
            .replace(/^\s*>\s+/gm, '')
            .replace(/^\s*[-*+•]\s+/gm, '')
            .replace(/^\s*\d+[.)、]\s+/gm, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return normalized || String(rawContent || '').trim();
    }

    recordGenerationMeta(meta = {}) {
        this.lastGenerationMeta = isPlainObject(meta) ? meta : null;
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
            const baseMaxTokens = this.config.maxTokens || 1000;
            let finalReply = '';

            for (let attempt = 1; attempt <= 2; attempt += 1) {
                const { text, meta } = await this.requestTextCompletion({
                    messages,
                    temperature: this.config.temperature || 0.7,
                    maxTokens: attempt === 1 ? baseMaxTokens : Math.max(baseMaxTokens, 600),
                    topP: 0.9
                });
                const normalizedReply = this.normalizeAssistantReply(text);
                const truncated = this.isLikelyTruncatedReply(normalizedReply, meta);

                this.recordGenerationMeta({
                    ...meta,
                    output_length: normalizedReply.length,
                    request_attempts: attempt,
                    retried_for_incomplete_output: attempt > 1
                });

                finalReply = normalizedReply;
                if (!truncated || attempt === 2) {
                    break;
                }

                console.warn('⚠️ AI回复疑似被截断，准备自动重试', {
                    provider: this.provider,
                    model: this.model,
                    output_length: normalizedReply.length,
                    finish_reason: meta?.finish_reason || null
                });
            }

            return finalReply;
            
        } catch (error) {
            console.error(`❌ ${this.provider} AI生成回复失败:`, error.message);
            console.error('🔍 AI错误堆栈:', error.stack);
            const normalizedMessage = String(error.message || '').toLowerCase();
            
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
            if (normalizedMessage.includes('rate limit') || normalizedMessage.includes('rate_limited') || normalizedMessage.includes('429')) {
                return '抱歉，AI服务暂时繁忙，请稍后再试。';
            } else if (normalizedMessage.includes('authentication') || normalizedMessage.includes('auth') || normalizedMessage.includes('api key') || normalizedMessage.includes('401')) {
                return 'AI服务认证失败，请检查配置。';
            } else if (normalizedMessage.includes('insufficient_quota') || normalizedMessage.includes('quota')) {
                return 'AI服务额度不足，请稍后再试。';
            } else if (normalizedMessage.includes('404') || normalizedMessage.includes('page not found') || normalizedMessage.includes('not found')) {
                return `AI服务端点暂时不可用，请检查${this.provider.toUpperCase()}_BASE_URL配置。`;
            } else if (normalizedMessage.includes('model_not_found') || normalizedMessage.includes('model not found')) {
                return `AI模型不可用，请检查AI_MODEL配置 (当前: ${this.model})。`;
            } else if (normalizedMessage.includes('no available accounts') || normalizedMessage.includes('503')) {
                return 'AI服务上游暂时无可用账号，请稍后再试。';
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
        const systemPrompt = `你是用户最亲密的AI显化伙伴，也是懂用户、支持用户的心理后盾。
表达规则：
- 只输出纯文本。禁止 Markdown、HTML、代码块、标题、列表、分点、序号。
- 说话要短，像微信消息。默认用 1 到 3 个短段落，不要长篇大论。
- 使用口语化、温暖但有锋利度的表达，拒绝官话和AI腔。
- 拒绝说教，拒绝冷冰冰的第三方视角，始终站在用户这一边。

限制条件：
- 严禁任何形式的爹味说教或过于正式的职场套话。
- 禁止“抱抱”“加油”“你已经很棒了”“先允许自己”这类廉价安慰。
- 禁止让用户反复复盘失败、做长反思、列 123 点行动计划。

工作规则：
- 深度上下文记忆：始终根据用户之前的对话背景和个人喜好进行分析。
- 如果用户在抱怨或发泄，先接住情绪，然后给一个降维打击的视角，不要展开成计划书。
- 你默认相信用户本身就是丰盛的。挫折和卡顿优先视为垃圾数据，直接 drop 掉，不带用户回看失败样本。
- 涉及决策时，可以给判断和方向，但不要分点罗列，不要写得像咨询报告。

用户信息：
- 用户名: ${context.user.username || '用户'}
- 用户ID: ${context.user.id}`;

        messages.push({
            role: 'system',
            content: systemPrompt
        });

        const profileMemoryBlock = typeof context.profileMemory === 'string'
            ? context.profileMemory.trim()
            : '';
        if (profileMemoryBlock) {
            messages.push({
                role: 'system',
                content: `用户稳定记忆（请优先保持与这些用户信息一致；如果用户这轮明确更新了旧信息，以当前表达为准）：\n${profileMemoryBlock}`
            });
        }

        const recalledMemoryBlock = buildRecalledMemoryBlock(context);
        if (recalledMemoryBlock) {
            messages.push({
                role: 'system',
                content: `与当前问题可能相关的历史事件（仅在确实相关时自然引用，不要生硬复述；如果当前用户否认、修正或更新了旧信息，以当前消息为准）：\n${recalledMemoryBlock}`
            });
        }

        // 添加上下文消息（最近20条）
        if (context.recentMessages && context.recentMessages.length > 0) {
            context.recentMessages.forEach(msg => {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            });
        }

        if (context.relevantKnowledge && context.relevantKnowledge.length > 0) {
            messages.push({
                role: 'system',
                content: '相关知识背景（请参考这些内容回应用户；仅把它作为外部知识，不要和用户个人经历混淆）：\n'
                    + context.relevantKnowledge
                        .map((knowledge) => `- ${knowledge.content}`)
                        .join('\n')
            });
        }

        // 添加当前用户消息
        messages.push({
            role: 'user',
            content: context.userMessage
        });

        return messages;
    }

    parseJsonResponse(rawContent) {
        if (typeof rawContent !== 'string' || !rawContent.trim()) {
            return null;
        }

        const normalized = rawContent
            .trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            return JSON.parse(normalized);
        } catch {
            const match = normalized.match(/\{[\s\S]*\}/);
            if (!match) {
                return null;
            }

            try {
                return JSON.parse(match[0]);
            } catch {
                return null;
            }
        }
    }

    async generateMemoryPatch(context = {}) {
        if (!this.client || !this.initialized) {
            return null;
        }

        const artifacts = await this.generateMemoryArtifacts(context);
        return artifacts?.profile_patch || null;
    }

    buildMemoryArtifactsInstruction(context = {}) {
        const conversation = Array.isArray(context.recentMessages)
            ? context.recentMessages.slice(-8).map((message) => ({
                role: message.role,
                content: String(message.content || '').slice(0, 600)
            }))
            : [];

        return {
            user: {
                id: context.user?.id || '',
                username: context.user?.username || '用户'
            },
            current_memory: context.currentMemory || {},
            latest_exchange: {
                user_message: String(context.userMessage || ''),
                assistant_response: String(context.aiResponse || '')
            },
            recent_messages: conversation,
            rules: [
                '只记录对后续对话有帮助的长期信息',
                '不要记录一次性情绪、外部知识或未经用户确认的推断',
                'summary 只有在需要刷新时才填写，否则返回空字符串',
                'goals 只有在需要刷新长期目标时才填写，否则返回空字符串',
                'facts、communication_preferences、open_loops 只返回应新增的条目',
                'memory_event_candidates 只保留明确承诺、关键突破、重复阻碍、明确偏好或关系上下文',
                '普通寒暄、一次性情绪波动、纯外部知识内容不要写入 memory_event_candidates',
                '如果没有值得更新的内容，profile_patch.should_update 返回 false 且 memory_event_candidates 返回空数组'
            ],
            response_schema: {
                profile_patch: {
                    should_update: true,
                    summary: '',
                    goals: '',
                    status: '',
                    facts: [],
                    communication_preferences: [],
                    open_loops: []
                },
                memory_event_candidates: [
                    {
                        event_type: 'commitment',
                        title: '',
                        summary: '',
                        detail: '',
                        keywords: [],
                        source_message_ids: [],
                        importance: 0.8,
                        confidence: 0.8,
                        happened_at: null,
                        metadata: {}
                    }
                ]
            }
        };
    }

    async generateMemoryArtifacts(context = {}) {
        if (!this.client || !this.initialized) {
            return null;
        }

        const instruction = this.buildMemoryArtifactsInstruction(context);

        try {
            const { text: rawContent } = await this.requestTextCompletion({
                messages: [
                    {
                        role: 'system',
                        content: '你是一个用户长期记忆整理器。请返回严格 JSON，不要输出解释、Markdown 或代码块。'
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(instruction, null, 2)
                    }
                ],
                temperature: 0.2,
                maxTokens: 600,
                topP: 0.9,
                responseMimeType: 'application/json'
            });
            const parsed = this.parseJsonResponse(rawContent);
            if (!isPlainObject(parsed)) {
                throw new Error('memory artifacts 解析失败');
            }

            return {
                profile_patch: normalizeMemoryPatchPayload(
                    isPlainObject(parsed.profile_patch) ? parsed.profile_patch : parsed
                ),
                memory_event_candidates: Array.isArray(parsed.memory_event_candidates)
                    ? parsed.memory_event_candidates
                        .map((candidate) => normalizeMemoryEventCandidate(candidate))
                        .filter(Boolean)
                    : []
            };
        } catch (error) {
            console.warn(`⚠️ 长期记忆整理失败: ${error.message}`);
            return null;
        }
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
