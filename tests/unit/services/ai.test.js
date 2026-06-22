describe('AIService', () => {
    const originalEnv = { ...process.env };

    function loadAIService() {
        return require('../../../src/services/ai');
    }

    function createService(overrides = {}) {
        const AIService = loadAIService();
        return new AIService({
            provider: 'openai',
            model: 'gpt-test',
            temperature: 0.7,
            maxTokens: 1000,
            ...overrides
        });
    }

    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.dontMock('@google/generative-ai');
        process.env = { ...originalEnv };
    });

    it('prepareMessages() 应按 Phase 4 顺序注入 profile memory、recalled memory、recent messages、knowledge', () => {
        const service = createService();
        const messages = service.prepareMessages({
            user: {
                id: 'user-1',
                username: 'alice'
            },
            profileMemory: 'summary: 用户在做晨间复盘',
            recalledMemoryBlock: '1. [commitment] 开始晨间复盘\n摘要: 用户承诺连续 7 天晨间复盘',
            recentMessages: [
                { role: 'user', content: '我昨天又拖延了' },
                { role: 'assistant', content: '你不是做不到，是启动门槛太高了。' }
            ],
            relevantKnowledge: [
                { content: '缩小行动颗粒度能降低启动阻力。' }
            ],
            userMessage: '我今天又有点想放弃了'
        });

        expect(messages).toHaveLength(7);
        expect(messages[0]).toEqual(expect.objectContaining({
            role: 'system'
        }));
        expect(messages[0].content).toContain('你是用户最亲密的AI显化伙伴');
        expect(messages[0].content).toContain('只输出纯文本');
        expect(messages[0].content).toContain('说话要短，像微信消息');
        expect(messages[0].content).toContain('禁止让用户反复复盘失败');
        expect(messages[1]).toEqual({
            role: 'system',
            content: '用户稳定记忆（请优先保持与这些用户信息一致；如果用户这轮明确更新了旧信息，以当前表达为准）：\nsummary: 用户在做晨间复盘'
        });
        expect(messages[2]).toEqual({
            role: 'system',
            content: '与当前问题可能相关的历史事件（仅在确实相关时自然引用，不要生硬复述；如果当前用户否认、修正或更新了旧信息，以当前消息为准）：\n1. [commitment] 开始晨间复盘\n摘要: 用户承诺连续 7 天晨间复盘'
        });
        expect(messages[3]).toEqual({ role: 'user', content: '我昨天又拖延了' });
        expect(messages[4]).toEqual({ role: 'assistant', content: '你不是做不到，是启动门槛太高了。' });
        expect(messages[5]).toEqual(expect.objectContaining({
            role: 'system'
        }));
        expect(messages[5].content).toContain('相关知识背景');
        expect(messages[5].content).toContain('缩小行动颗粒度能降低启动阻力。');
        expect(messages[6]).toEqual({
            role: 'user',
            content: '我今天又有点想放弃了'
        });
    });

    it('prepareMessages() 应在无显式 recalledMemoryBlock 时从 recalledMemoryEvents 构建注入内容', () => {
        const service = createService();
        const messages = service.prepareMessages({
            user: {
                id: 'user-1',
                username: 'alice'
            },
            recalledMemoryEvents: [{
                id: 'event-1',
                title: '开始晨间复盘',
                summary: '用户承诺连续 7 天晨间复盘'
            }],
            userMessage: '我还记得上次说的计划'
        });

        expect(messages[1]).toEqual({
            role: 'system',
            content: '与当前问题可能相关的历史事件（仅在确实相关时自然引用，不要生硬复述；如果当前用户否认、修正或更新了旧信息，以当前消息为准）：\n1. 开始晨间复盘\n摘要: 用户承诺连续 7 天晨间复盘'
        });
        expect(messages[2]).toEqual({
            role: 'user',
            content: '我还记得上次说的计划'
        });
    });

    it('prepareMessages() 应在无可注入上下文时仅保留 system 与当前 user message', () => {
        const service = createService();
        const messages = service.prepareMessages({
            user: {
                id: 'user-1',
                username: 'alice'
            },
            userMessage: '你好'
        });

        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe('system');
        expect(messages[1]).toEqual({
            role: 'user',
            content: '你好'
        });
    });

    it('normalizeAssistantReply() 应去掉 Markdown、HTML 和列表序号', () => {
        const service = createService();
        const normalized = service.normalizeAssistantReply('**先别复盘**\n1. 把这段垃圾数据 drop 掉\n2. <b>你没掉价</b>\n> 继续往前');

        expect(normalized).toBe('先别复盘\n把这段垃圾数据 drop 掉\n你没掉价\n继续往前');
    });

    it('buildGeminiRequest() 应将 system/user/assistant 消息转换为 Gemini contents', () => {
        const service = createService({ provider: 'gemini', model: 'gemini-3-flash-preview' });
        const geminiRequest = service.buildGeminiRequest([
            { role: 'system', content: '系统规则 1' },
            { role: 'system', content: '系统规则 2' },
            { role: 'user', content: '你好' },
            { role: 'user', content: '我想聊聊最近的状态' },
            { role: 'assistant', content: '我在，继续说。' }
        ]);

        expect(geminiRequest.systemInstruction).toBe('系统规则 1\n\n系统规则 2');
        expect(geminiRequest.contents).toEqual([
            {
                role: 'user',
                parts: [
                    { text: '你好' },
                    { text: '我想聊聊最近的状态' }
                ]
            },
            {
                role: 'model',
                parts: [
                    { text: '我在，继续说。' }
                ]
            }
        ]);
    });

    it('generateResponse() 应在 gemini provider 下走 GoogleGenerativeAI', async () => {
        const countTokens = jest.fn().mockResolvedValue({ totalTokens: 1 });
        const generateContent = jest.fn().mockResolvedValue({
            response: {
                text: () => 'gemini ok'
            }
        });
        const getGenerativeModel = jest.fn()
            .mockReturnValueOnce({ countTokens })
            .mockReturnValueOnce({ generateContent });
        const GoogleGenerativeAI = jest.fn().mockImplementation(() => ({
            getGenerativeModel
        }));

        jest.doMock('@google/generative-ai', () => ({
            GoogleGenerativeAI
        }));

        const AIService = loadAIService();
        const service = new AIService({
            provider: 'gemini',
            apiKey: 'gem-key',
            baseURL: 'https://api.aigocode.com',
            apiVersion: 'v1beta',
            thinkingBudget: 0,
            model: 'gemini-3-flash-preview',
            temperature: 0.7,
            maxTokens: 128
        });

        await service.initialize();
        const response = await service.generateResponse({
            user: {
                id: 'user-1',
                username: 'alice'
            },
            userMessage: '你好',
            recentMessages: []
        });

        expect(response).toBe('gemini ok');
        expect(GoogleGenerativeAI).toHaveBeenCalledWith('gem-key');
        expect(getGenerativeModel).toHaveBeenNthCalledWith(
            1,
            { model: 'gemini-3-flash-preview' },
            { baseUrl: 'https://api.aigocode.com', apiVersion: 'v1beta', timeout: 30000 }
        );
        expect(getGenerativeModel).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                model: 'gemini-3-flash-preview',
                systemInstruction: expect.objectContaining({
                    role: 'system'
                }),
                generationConfig: expect.objectContaining({
                    temperature: 0.7,
                    maxOutputTokens: 128,
                    topP: 0.9,
                    thinkingConfig: {
                        thinkingBudget: 0
                    }
                })
            }),
            { baseUrl: 'https://api.aigocode.com', apiVersion: 'v1beta', timeout: 30000 }
        );
        expect(generateContent).toHaveBeenCalledWith({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: '你好' }]
                }
            ]
        });
    });

    it('generateResponse() 应在返回前清洗格式化标记', async () => {
        const service = createService();
        service.client = {
            chat: {
                completions: {
                    create: jest.fn().mockResolvedValue({
                        choices: [{
                            message: {
                                content: '**别回头复盘**\n1. drop 掉\n2. <i>继续走</i>'
                            }
                        }]
                    })
                }
            }
        };
        service.initialized = true;

        const response = await service.generateResponse({
            user: {
                id: 'user-1',
                username: 'alice'
            },
            userMessage: '我烦死了',
            recentMessages: []
        });

        expect(response).toBe('别回头复盘\ndrop 掉\n继续走');
    });

    it('generateResponse() 遇到疑似半句截断时应自动重试一次', async () => {
        const create = jest.fn()
            .mockResolvedValueOnce({
                id: 'resp-1',
                model: 'gpt-test',
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        content: '这套路太典型了，就是个标准的'
                    }
                }],
                usage: {
                    total_tokens: 80
                }
            })
            .mockResolvedValueOnce({
                id: 'resp-2',
                model: 'gpt-test',
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        content: '这套路太典型了，就是个标准的欲擒故纵。'
                    }
                }],
                usage: {
                    total_tokens: 120
                }
            });
        const service = createService({ maxTokens: 300 });
        service.client = {
            chat: {
                completions: {
                    create
                }
            }
        };
        service.initialized = true;

        const response = await service.generateResponse({
            user: {
                id: 'user-1',
                username: 'alice'
            },
            userMessage: '他怎么这样',
            recentMessages: []
        });

        expect(response).toBe('这套路太典型了，就是个标准的欲擒故纵。');
        expect(create).toHaveBeenCalledTimes(2);
        expect(service.getLastGenerationMeta()).toEqual(expect.objectContaining({
            finish_reason: 'stop',
            output_length: '这套路太典型了，就是个标准的欲擒故纵。'.length,
            request_attempts: 2,
            retried_for_incomplete_output: true
        }));
    });
});
