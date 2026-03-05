// Telegram机器人服务
const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/user');
const Message = require('../models/message');
const Knowledge = require('../models/knowledge');
const AIService = require('./ai');
const NotionService = require('./notion');
const configManager = require('../config/manager'); // Day 3+ 配置管理
const { 
    errorHandler, 
    DatabaseError, 
    AIError, 
    NetworkError,
    TelegramError,
    handleError,
    getUserMessage,
    withRetry 
} = require('../utils/error-handler'); // Day 3+ 错误处理
const { messageQueue, enqueue } = require('../utils/message-queue'); // Day 3+ 并发控制

class TelegramService {
    constructor(config) {
        this.config = config; // 保持向后兼容
        this.bot = null;
        this.aiService = null;
        this.notionService = null; // Day 4: Notion归档服务
        this.isRunning = false;
        this.configManager = configManager; // Day 3+ 配置管理
    }

    async start() {
        console.log('🤖 启动Telegram机器人...');
        
        const token = this.configManager.get('telegram.botToken');
        if (!token) {
            throw new Error('Telegram机器人令牌未配置 (TELEGRAM_BOT_TOKEN)');
        }

        // 初始化AI服务
        this.aiService = new AIService(this.config.ai);
        await this.aiService.initialize();

        // 初始化Notion归档服务（Day 4）
        this.notionService = new NotionService();

        // 创建Telegram机器人
        this.bot = new TelegramBot(token, { polling: true });
        
        // 设置命令
        this.setupCommands();
        
        // 设置事件监听器
        this.setupEventListeners();
        
        this.isRunning = true;
        console.log('✅ Telegram机器人启动成功');
        console.log(`📱 机器人用户名: @${(await this.bot.getMe()).username}`);
        
        return true;
    }

    stop() {
        console.log('🛑 正在停止Telegram机器人并清理资源...');
        
        try {
            // 1. 停止Telegram轮询
            if (this.bot) {
                this.bot.stopPolling();
                console.log('   ✅ Telegram轮询已停止');
                
                // 清理事件监听器（将bot引用置空）
                this.bot = null;
            }
            
            // 2. 释放AI客户端资源
            if (this.aiService && this.aiService.client) {
                // OpenAI客户端没有显式的close方法，将引用置空
                this.aiService.client = null;
                console.log('   ✅ AI客户端资源已释放');
            }
            
            // 3. 关闭数据库连接池（异步，不阻塞）
            try {
                const { db } = require('../db/connection');
                db.close()
                    .then(() => console.log('   ✅ 数据库连接池已关闭'))
                    .catch(error => {
                        const context = { function: 'db.close', stage: 'shutdown' };
                        handleError(error, context);
                        console.warn('⚠️  关闭数据库连接池时出错:', error.message);
                    });
            } catch (requireError) {
                const context = { function: 'requireDbConnection', module: '../db/connection' };
                handleError(requireError, context);
                console.warn('⚠️  加载数据库模块时出错:', requireError.message);
            }
            
            // 4. 清理消息队列（Day 3+ 并发控制）
            try {
                const { messageQueue } = require('../utils/message-queue');
                const clearedTasks = messageQueue.clearAll();
                if (clearedTasks > 0) {
                    console.log(`   ✅ 消息队列已清理，取消 ${clearedTasks} 个待处理任务`);
                }
            } catch (queueError) {
                const context = { function: 'messageQueue.clearAll', stage: 'shutdown' };
                handleError(queueError, context);
                console.warn('⚠️  清理消息队列时出错:', queueError.message);
            }
            
            this.isRunning = false;
            console.log('✅ Telegram机器人已完全停止，所有资源已清理');
            
        } catch (error) {
            const context = { function: 'TelegramService.stop', action: 'cleanup' };
            const errorResult = handleError(error, context);
            
            console.error(`❌ 停止机器人时发生错误 [${errorResult.error.type}]:`, error.message);
            // 确保标志被设置
            this.isRunning = false;
            
            // 不重新抛出错误，因为stop()方法应该在失败时也尽量清理
            // 但记录错误以便调试
        }
    }

    setupCommands() {
        // 设置命令列表
        const commands = [
            { command: 'start', description: '开始使用机器人' },
            { command: 'help', description: '获取帮助信息' },
            { command: 'history', description: '查看最近对话' },
            { command: 'clear', description: '清除对话历史' },
            { command: 'archive_now', description: '归档今日对话到Notion' }
        ];

        this.bot.setMyCommands(commands).catch(error => {
            const context = { function: 'setupCommands', action: 'setMyCommands' };
            handleError(error, context);
            console.warn(`⚠️  设置命令失败: ${error.message}`);
        });
    }

    setupEventListeners() {
        // 监听文本消息
        this.bot.on('message', (msg) => {
            this.handleMessage(msg).catch(error => {
                // 处理未捕获的错误（handleMessage内部可能已经处理了，但这里是最后的防线）
                const context = {
                    chatId: msg.chat?.id,
                    userId: msg.from?.id,
                    messageType: 'text',
                    function: 'bot.onMessage',
                    uncaught: true
                };
                
                const errorResult = handleError(error, context);
                const userFriendlyMessage = getUserMessage(error) || '抱歉，处理消息时出现了问题。请稍后再试。';
                
                // 尝试向用户发送错误消息
                try {
                    if (msg.chat && msg.chat.id) {
                        this.bot.sendMessage(msg.chat.id, userFriendlyMessage)
                            .catch(sendError => {
                                console.error('❌ 发送错误消息失败:', sendError.message);
                            });
                    }
                } catch (e) {
                    console.error('❌ 发送错误消息时再次失败:', e.message);
                }
                
                console.error(`🛡️  未捕获错误已处理: ${errorResult.error.type}`);
            });
        });

        // 监听错误
        this.bot.on('polling_error', (error) => {
            const context = {
                errorCode: error.code,
                function: 'TelegramPolling',
                severity: 'HIGH' // 轮询错误通常是严重的
            };
            
            const errorResult = handleError(error, context);
            console.error(`❌ Telegram轮询错误 [${errorResult.error.type}]:`, error.message);
            console.error('📊 错误代码:', error.code);
            
            // 如果是认证错误，可能需要重启或通知管理员
            if (error.code === 401 || error.message.includes('unauthorized')) {
                console.error('🔐 Telegram认证失败，请检查BOT_TOKEN');
            }
        });

        // 监听命令
        this.bot.onText(/\/start/, (msg) => this.handleStartCommand(msg));
        this.bot.onText(/\/help/, (msg) => this.handleHelpCommand(msg));
        this.bot.onText(/\/history/, (msg) => this.handleHistoryCommand(msg));
        this.bot.onText(/\/clear/, (msg) => this.handleClearCommand(msg));
        this.bot.onText(/\/archive_now/, (msg) => this.handleArchiveCommand(msg));

        console.log('✅ 事件监听器设置完成');
    }

    async handleMessage(msg) {
        // 跳过无效消息
        if (!msg.text || msg.text.startsWith('/')) {
            return;
        }

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name || '用户';
        const userMessage = msg.text;
        
        console.log(`📥 收到消息 [${username}:${userId}]:`, userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : ''));

        // 立即发送"正在输入"状态（不等待队列）
        this.bot.sendChatAction(chatId, 'typing').catch(error => {
            // 静默处理，因为sendChatAction失败不影响核心功能
            const context = { chatId, userId, function: 'sendChatAction' };
            handleError(error, context);
        });

        // 将消息处理加入用户队列（确保串行执行）
        try {
            await enqueue(userId, async () => {
                return await this._processSingleMessage(chatId, userId, username, userMessage, msg);
            }, {
                chatId,
                username,
                messagePreview: userMessage.substring(0, 50),
                function: 'handleMessage'
            });
            
        } catch (error) {
            // 队列处理错误（如超时）
            const context = {
                chatId,
                userId,
                username,
                userMessage: userMessage.substring(0, 100),
                function: 'handleMessage.queue'
            };
            
            const errorResult = handleError(error, context);
            
            // 发送用户友好的错误消息
            const userFriendlyMessage = getUserMessage(error) || '抱歉，处理您的消息时出现了问题。请稍后再试。';
            
            try {
                await this.bot.sendMessage(chatId, userFriendlyMessage);
                console.log(`📤 队列错误消息已发送给用户: ${errorResult.error.type}`);
            } catch (sendError) {
                // 发送错误消息失败，记录但不再尝试
                console.error('❌ 发送错误消息失败:', sendError.message);
            }
        }
    }
    
    /**
     * 处理单条消息（从队列中调用）
     * @private
     */
    async _processSingleMessage(chatId, userId, username, userMessage, originalMsg) {
        try {
            // 1. 确保用户存在
            const user = await this.ensureUser({
                telegram_id: userId,
                username: username
            });

            if (!user) {
                throw new Error('用户创建失败');
            }

            // 2. 保存用户消息到数据库
            const savedUserMessage = await Message.create({
                user_id: user.id,
                role: 'user',
                content: userMessage
            });

            console.log(`💾 用户消息已保存 [ID: ${savedUserMessage.id}]`);

            // 3. 获取最近消息作为上下文（使用配置）
            const contextLimit = this.configManager.get('telegram.contextLimit', 20);
            const recentMessages = await Message.getRecentMessages(user.id, contextLimit);
            console.log(`📊 获取到最近 ${recentMessages.length} 条消息作为上下文（限制: ${contextLimit}）`);

            // 3a. RAG: 并行检索相关知识片段和历史记忆
            let relevantKnowledge = [];
            let semanticMessages = [];
            try {
                [relevantKnowledge, semanticMessages] = await Promise.all([
                    Knowledge.semanticSearch(userMessage, user.id, 5, 0.6),
                    Message.semanticSearchByText(userMessage, user.id, 3, 0.65)
                ]);
                if (relevantKnowledge.length > 0) {
                    console.log(`📚 RAG检索到 ${relevantKnowledge.length} 个相关知识片段`);
                }
                if (semanticMessages.length > 0) {
                    console.log(`🧠 RAG检索到 ${semanticMessages.length} 条相关历史记忆`);
                }
            } catch (ragError) {
                // RAG失败不阻断主流程，降级为纯时序上下文
                console.warn('⚠️ RAG检索失败，使用纯时序上下文:', ragError.message);
            }

            // 4. 准备AI上下文
            const context = {
                user: {
                    id: user.id,
                    username: username,
                    telegram_id: userId
                },
                userMessage: userMessage,
                recentMessages: recentMessages,
                relevantKnowledge: relevantKnowledge,
                semanticMessages: semanticMessages
            };

            // 5. 生成AI回复
            let aiResponse;
            if (this.aiService.client) {
                aiResponse = await this.aiService.generateResponse(context);
                console.log(`🤖 AI回复生成完成 [${aiResponse.length}字符]`);
            } else {
                // AI服务不可用时的备用回复
                aiResponse = '你好！我是你的助手。目前AI服务暂时不可用，但我仍然可以帮你记录消息。';
                console.log('⚠️  AI服务不可用，使用备用回复');
            }

            // 6. 保存AI回复到数据库
            const savedAiMessage = await Message.create({
                user_id: user.id,
                role: 'assistant',
                content: aiResponse
            });

            console.log(`💾 AI回复已保存 [ID: ${savedAiMessage.id}]`);

            // 7. 发送回复给用户
            await this.bot.sendMessage(chatId, aiResponse, {
                parse_mode: 'HTML'
            });

            console.log(`📤 回复已发送给用户 [${username}:${userId}]`);
            
            return { success: true, messageId: savedAiMessage.id };
            
        } catch (error) {
            // 使用统一错误处理器
            const context = {
                chatId,
                userId,
                username,
                userMessage: userMessage.substring(0, 100),
                function: '_processSingleMessage'
            };
            
            const errorResult = handleError(error, context);
            
            // 发送用户友好的错误消息
            const userFriendlyMessage = getUserMessage(error) || '抱歉，处理您的消息时出现了问题。请稍后再试。';
            
            try {
                await this.bot.sendMessage(chatId, userFriendlyMessage);
                console.log(`📤 处理错误消息已发送给用户: ${errorResult.error.type}`);
            } catch (sendError) {
                // 发送错误消息失败，记录但不再尝试
                console.error('❌ 发送错误消息失败:', sendError.message);
            }
            
            // 重新抛出错误，让队列知道处理失败
            throw error;
        }
    }

    async ensureUser(telegramUser) {
        try {
            // 检查用户是否存在
            let user = await User.findByTelegramId(telegramUser.telegram_id);
            
            if (!user) {
                // 创建新用户
                console.log(`👤 创建新用户: ${telegramUser.username} (ID: ${telegramUser.telegram_id})`);
                user = await User.create({
                    telegram_id: telegramUser.telegram_id,
                    username: telegramUser.username
                });
                console.log(`✅ 用户创建成功: ${user.id}`);
            } else {
                // 更新用户名（如果更改了）
                if (user.username !== telegramUser.username) {
                    await User.update(telegramUser.telegram_id, {
                        username: telegramUser.username
                    });
                    console.log(`🔄 更新用户名: ${user.username} -> ${telegramUser.username}`);
                }
            }
            
            return user;
        } catch (error) {
            // 使用统一错误处理器
            const context = {
                telegramId: telegramUser.telegram_id,
                username: telegramUser.username,
                function: 'ensureUser'
            };
            
            const errorResult = handleError(error, context);
            
            console.error(`❌ 确保用户存在失败: ${errorResult.error.type}`);
            
            // 返回默认用户对象以避免整个流程中断
            // 注意：这只是一个fallback，实际业务逻辑可能受影响
            return {
                id: '00000000-0000-0000-0000-000000000000',
                telegram_id: telegramUser.telegram_id,
                username: telegramUser.username
            };
        }
    }

    // 命令处理函数
    async handleStartCommand(msg) {
        const chatId = msg.chat.id;
        const username = msg.from.username || msg.from.first_name || '用户';
        
        const welcomeMessage = `✨ 欢迎使用 Affirm 显化导师！\n\n你好 ${username}！\n\n我是你的显化导师助手，我会帮助你：\n• 记录想法和目标\n• 提供积极的肯定语\n• 协助思维重塑\n• 跟踪你的进步\n\n直接发送消息给我，我会热情地回复你！\n\n使用 /help 查看所有可用命令。`;
        
        try {
            await this.bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'HTML'
            });
            
            // 确保用户存在
            await this.ensureUser({
                telegram_id: msg.from.id,
                username: username
            });
            
        } catch (error) {
            const context = {
                chatId,
                userId: msg.from.id,
                username,
                command: '/start',
                function: 'handleStartCommand'
            };
            
            handleError(error, context);
            console.error(`❌ /start命令处理失败: ${error.message}`);
        }
    }

    async handleHelpCommand(msg) {
        const chatId = msg.chat.id;
        
        const contextLimit = this.configManager.get('telegram.contextLimit', 20);
        const helpMessage = `📚 <b>Affirm 显化导师 - 帮助指南</b>\n\n<b>可用命令：</b>\n/start - 开始使用机器人\n/help - 显示此帮助信息\n/history - 查看最近对话历史\n/clear - 清除当前对话历史\n/archive_now - 归档今日对话到Notion\n\n<b>使用方法：</b>\n直接发送消息给我，我会热情地回复你。\n我使用最近${contextLimit}条对话作为上下文，让你有连贯的体验。\n\n<b>功能：</b>\n• 记录你的想法和目标\n• 提供积极的肯定语\n• 协助思维重塑\n• 提供个性化的建议\n• 对话归档到Notion（需配置）\n\n<b>注意事项：</b>\n• 所有对话都会被安全存储\n• 你可以随时清除历史记录\n• AI服务可能偶尔不可用\n\n有问题随时联系！✨`;
        
        try {
            await this.bot.sendMessage(chatId, helpMessage, {
                parse_mode: 'HTML'
            });
        } catch (error) {
            const context = {
                chatId,
                userId: msg.from?.id,
                command: '/help',
                function: 'handleHelpCommand'
            };
            
            handleError(error, context);
            console.error(`❌ /help命令处理失败: ${error.message}`);
        }
    }

    async handleHistoryCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        try {
            // 确保用户存在
            const user = await this.ensureUser({
                telegram_id: userId,
                username: msg.from.username || msg.from.first_name || '用户'
            });
            
            // 获取最近消息（使用配置）
            const historyLimit = this.configManager.get('telegram.historyLimit', 10);
            const recentMessages = await Message.getRecentMessages(user.id, historyLimit);
            
            if (recentMessages.length === 0) {
                await this.bot.sendMessage(chatId, '📭 你还没有任何对话历史。发送消息开始对话吧！');
                return;
            }
            
            let historyText = '📜 <b>最近对话历史：</b>\n\n';
            
            recentMessages.forEach((msg, index) => {
                const roleEmoji = msg.role === 'user' ? '👤' : '🤖';
                const roleText = msg.role === 'user' ? '你' : '助手';
                const time = new Date(msg.created_at).toLocaleString('zh-CN');
                const contentPreview = msg.content.length > 50 
                    ? msg.content.substring(0, 50) + '...' 
                    : msg.content;
                
                historyText += `${roleEmoji} <b>${roleText}</b> (${time}):\n${contentPreview}\n\n`;
            });
            
            historyText += `\n总计: ${recentMessages.length} 条消息`;
            
            await this.bot.sendMessage(chatId, historyText, {
                parse_mode: 'HTML'
            });
            
        } catch (error) {
            const context = {
                chatId,
                userId,
                username: msg.from.username || msg.from.first_name || '用户',
                command: '/history',
                function: 'handleHistoryCommand'
            };
            
            const errorResult = handleError(error, context);
            const userFriendlyMessage = getUserMessage(error) || '抱歉，获取历史记录时出现问题。请稍后再试。';
            
            try {
                await this.bot.sendMessage(chatId, userFriendlyMessage);
                console.error(`❌ /history命令处理失败: ${errorResult.error.type}`);
            } catch (sendError) {
                console.error('❌ 发送错误消息失败:', sendError.message);
            }
        }
    }

    async handleClearCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name || '用户';

        try {
            // 确保用户存在
            const user = await this.ensureUser({
                telegram_id: userId,
                username
            });
            
            const deletedCount = await Message.deleteByUserId(user.id);
            console.log(`🧹 用户 [${username}:${userId}] 清除了 ${deletedCount} 条消息`);

            await this.bot.sendMessage(chatId, `🧹 已清除 ${deletedCount} 条对话历史记录。\n\n你可以重新开始对话了！`, {
                parse_mode: 'HTML'
            });
            
        } catch (error) {
            const context = {
                chatId,
                userId,
                username,
                command: '/clear',
                function: 'handleClearCommand'
            };
            
            const errorResult = handleError(error, context);
            const userFriendlyMessage = getUserMessage(error) || '抱歉，处理清除命令时出现问题。请稍后再试。';
            
            try {
                await this.bot.sendMessage(chatId, userFriendlyMessage);
                console.error(`❌ /clear命令处理失败: ${errorResult.error.type}`);
            } catch (sendError) {
                console.error('❌ 发送错误消息失败:', sendError.message);
            }
        }
    }
    
    async handleArchiveCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name || '用户';
        
        console.log(`📦 [${username}:${userId}] 请求归档今日对话`);
        
        try {
            // 发送"正在处理"状态
            this.bot.sendChatAction(chatId, 'typing').catch(error => {
                // 静默处理，sendChatAction失败不影响归档功能
                const context = { chatId, userId, function: 'sendChatAction', command: '/archive_now' };
                handleError(error, context);
            });
            
            // 确保用户存在
            const user = await this.ensureUser({
                telegram_id: userId,
                username: username
            });
            
            if (!user) {
                throw new Error('用户不存在，无法归档');
            }
            
            // 获取今日消息
            const today = new Date();
            const dailyMessages = await Message.getDailyMessages(user.id, today);
            
            if (dailyMessages.length === 0) {
                await this.bot.sendMessage(chatId, '📭 今天还没有任何对话记录，无法归档。\n\n请先和我聊几句吧！😊', {
                    parse_mode: 'HTML'
                });
                return;
            }
            
            await this.bot.sendMessage(chatId, `📦 正在归档今日 ${dailyMessages.length} 条对话到Notion...\n\n请稍等，这可能需要几秒钟。`, {
                parse_mode: 'HTML'
            });
            
            // 归档到Notion
            let pageId = null;
            try {
                pageId = await this.notionService.archiveDailyMessages(
                    user.id,
                    username,
                    dailyMessages,
                    today
                );
            } catch (notionError) {
                // Notion归档失败不影响主流程，使用错误处理器记录
                const context = {
                    chatId,
                    userId,
                    username,
                    dailyMessageCount: dailyMessages.length,
                    notionConfigPresent: !!process.env.NOTION_TOKEN && process.env.NOTION_TOKEN !== 'your_notion_integration_token',
                    function: 'notionService.archiveDailyMessages'
                };
                
                const errorResult = handleError(notionError, context);
                const userFriendlyMessage = getUserMessage(notionError) || `归档到Notion时出现错误。请检查Notion配置或稍后再试。`;
                
                await this.bot.sendMessage(chatId, userFriendlyMessage, {
                    parse_mode: 'HTML'
                });
                return;
            }
            
            if (pageId) {
                // 创建成功，发送成功消息
                await this.bot.sendMessage(chatId, `✅ 归档成功！\n\n📊 统计: 今日 ${dailyMessages.length} 条对话已保存到Notion。\n\n📅 日期: ${today.toISOString().split('T')[0]}\n👤 用户: ${username}\n🔗 页面ID: <code>${pageId}</code>`, {
                    parse_mode: 'HTML'
                });
            } else {
                await this.bot.sendMessage(chatId, '⚠️  归档完成，但未返回页面ID。请检查Notion配置。', {
                    parse_mode: 'HTML'
                });
            }
            
        } catch (error) {
            const context = {
                chatId,
                userId,
                username,
                command: '/archive_now',
                function: 'handleArchiveCommand',
                hasNotionConfig: !!process.env.NOTION_TOKEN && process.env.NOTION_TOKEN !== 'your_notion_integration_token'
            };
            
            const errorResult = handleError(error, context);
            const userFriendlyMessage = getUserMessage(error) || '抱歉，处理归档命令时出现问题。请稍后再试或检查配置。';
            
            try {
                await this.bot.sendMessage(chatId, userFriendlyMessage);
                console.error(`❌ /archive_now命令处理失败: ${errorResult.error.type}`);
            } catch (sendError) {
                console.error('❌ 发送错误消息失败:', sendError.message);
            }
        }
    }
}

module.exports = TelegramService;