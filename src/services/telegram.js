// Telegram机器人服务
const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/user');
const Message = require('../models/message');
const AIService = require('./ai');
const NotionService = require('./notion');

class TelegramService {
    constructor(config) {
        this.config = config;
        this.bot = null;
        this.aiService = null;
        this.notionService = null; // Day 4: Notion归档服务
        this.isRunning = false;
    }

    async start() {
        console.log('🤖 启动Telegram机器人...');
        
        const token = this.config.telegram ? this.config.telegram.botToken : this.config.botToken;
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
                    .catch(error => console.warn('⚠️  关闭数据库连接池时出错:', error.message));
            } catch (requireError) {
                console.warn('⚠️  加载数据库模块时出错:', requireError.message);
            }
            
            this.isRunning = false;
            console.log('✅ Telegram机器人已完全停止，所有资源已清理');
            
        } catch (error) {
            console.error('❌ 停止机器人时发生错误:', error.message);
            // 确保标志被设置
            this.isRunning = false;
            throw error;
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
            console.warn('⚠️  设置命令失败:', error.message);
        });
    }

    setupEventListeners() {
        // 监听文本消息
        this.bot.on('message', (msg) => {
            this.handleMessage(msg).catch(error => {
                console.error('❌ 处理消息时发生未捕获错误:', error.message);
                console.error(error.stack);
                
                // 尝试向用户发送错误消息
                try {
                    if (msg.chat && msg.chat.id) {
                        this.bot.sendMessage(msg.chat.id, '抱歉，处理消息时出现了问题。请稍后再试。')
                            .catch(e => console.error('❌ 发送错误消息失败:', e.message));
                    }
                } catch (e) {
                    console.error('❌ 发送错误消息时再次失败:', e.message);
                }
            });
        });

        // 监听错误
        this.bot.on('polling_error', (error) => {
            console.error('❌ Telegram轮询错误:', error.message);
            console.error('📊 错误代码:', error.code);
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

        // 发送"正在输入"状态
        this.bot.sendChatAction(chatId, 'typing').catch(() => {});

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

            // 3. 获取最近20条消息作为上下文
            const recentMessages = await Message.getRecentMessages(user.id, 20);
            console.log(`📊 获取到最近 ${recentMessages.length} 条消息作为上下文`);

            // 4. 准备AI上下文
            const context = {
                user: {
                    id: user.id,
                    username: username,
                    telegram_id: userId
                },
                userMessage: userMessage,
                recentMessages: recentMessages
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

        } catch (error) {
            console.error('❌ 处理消息时出错:', error.message);
            console.error(error.stack);
            
            // 发送错误消息给用户（确保机器人永不沉默）
            let errorMessage = '抱歉，处理您的消息时出现了问题。请稍后再试。';
            
            if (error.message.includes('database') || error.message.includes('connection')) {
                errorMessage = '数据库连接出现问题，请稍后再试。';
            } else if (error.message.includes('AI') || error.message.includes('api')) {
                errorMessage = 'AI服务暂时不可用，但我仍然可以记录您的消息。';
            }
            
            try {
                await this.bot.sendMessage(chatId, errorMessage);
                console.log('📤 错误消息已发送给用户');
            } catch (sendError) {
                console.error('❌ 发送错误消息失败:', sendError.message);
            }
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
            console.error('❌ 确保用户存在时出错:', error.message);
            console.error('📊 错误代码:', error.code);
            
            // 尝试返回一个默认用户对象，避免整个流程中断
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
            console.error('❌ 处理/start命令时出错:', error.message);
        }
    }

    async handleHelpCommand(msg) {
        const chatId = msg.chat.id;
        
        const helpMessage = `📚 <b>Affirm 显化导师 - 帮助指南</b>\n\n<b>可用命令：</b>\n/start - 开始使用机器人\n/help - 显示此帮助信息\n/history - 查看最近对话历史\n/clear - 清除当前对话历史\n\n<b>使用方法：</b>\n直接发送消息给我，我会热情地回复你。\n我使用最近20条对话作为上下文，让你有连贯的体验。\n\n<b>功能：</b>\n• 记录你的想法和目标\n• 提供积极的肯定语\n• 协助思维重塑\n• 提供个性化的建议\n\n<b>注意事项：</b>\n• 所有对话都会被安全存储\n• 你可以随时清除历史记录\n• AI服务可能偶尔不可用\n\n有问题随时联系！✨`;
        
        try {
            await this.bot.sendMessage(chatId, helpMessage, {
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('❌ 处理/help命令时出错:', error.message);
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
            
            // 获取最近10条消息
            const recentMessages = await Message.getRecentMessages(user.id, 10);
            
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
            console.error('❌ 处理/history命令时出错:', error.message);
            await this.bot.sendMessage(chatId, '抱歉，获取历史记录时出现问题。请稍后再试。');
        }
    }

    async handleClearCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        try {
            // 确保用户存在
            const user = await this.ensureUser({
                telegram_id: userId,
                username: msg.from.username || msg.from.first_name || '用户'
            });
            
            // 这里应该实现清除用户消息的逻辑
            // 暂时发送提示消息
            await this.bot.sendMessage(chatId, '🧹 清除历史记录功能正在开发中。目前你可以通过/history查看历史记录。\n\n清除功能将在下次更新中添加！', {
                parse_mode: 'HTML'
            });
            
        } catch (error) {
            console.error('❌ 处理/clear命令时出错:', error.message);
            await this.bot.sendMessage(chatId, '抱歉，处理清除命令时出现问题。请稍后再试。');
        }
    }
    
    async handleArchiveCommand(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name || '用户';
        
        console.log(`📦 [${username}:${userId}] 请求归档今日对话`);
        
        try {
            // 发送"正在处理"状态
            this.bot.sendChatAction(chatId, 'typing').catch(() => {});
            
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
                console.error('❌ Notion归档失败:', notionError.message);
                // Notion归档失败不影响主流程，只发送错误消息
                await this.bot.sendMessage(chatId, `❌ 归档到Notion时出现错误:\n\n<code>${notionError.message}</code>\n\n请检查Notion配置或稍后再试。`, {
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
            console.error('❌ 处理/archive_now命令时出错:', error.message);
            console.error(error.stack);
            
            // 发送通用错误消息（不暴露内部细节）
            await this.bot.sendMessage(chatId, '抱歉，处理归档命令时出现问题。请稍后再试或检查配置。', {
                parse_mode: 'HTML'
            });
        }
    }
}

module.exports = TelegramService;