// 每日归档管理器
const NotionClient = require('./client');
const defaultConfig = require('./config');

function buildNotionConfig(overrides = {}) {
    return {
        ...defaultConfig,
        ...overrides,
        archiveConfig: {
            ...(defaultConfig.archiveConfig || {}),
            ...(overrides.archiveConfig || {})
        }
    };
}

class DailyArchiver {
    constructor(configOverrides = {}) {
        const notionConfig = buildNotionConfig(configOverrides);
        this.config = notionConfig.archiveConfig;
        this.notion = new NotionClient(notionConfig);
        this.archives = []; // 当日归档记录
    }

    // 初始化归档器
    async initialize() {
        console.log('🔧 初始化每日归档器...');
        
        // 初始化Notion客户端
        this.notion.initialize();
        
        // 设置定时归档（如果启用）
        if (this.config.enabled) {
            this.setupScheduledArchive();
        }
        
        console.log('✅ 每日归档器初始化完成');
    }

    // 设置定时归档
    setupScheduledArchive() {
        const now = new Date();
        const targetHour = this.config.archiveHour;
        const targetMinute = 0; // 整点归档
        
        // 计算下一次归档时间
        let nextArchive = new Date(now);
        nextArchive.setUTCHours(targetHour, targetMinute, 0, 0);
        
        if (nextArchive <= now) {
            // 如果今天的时间已过，设置为明天
            nextArchive.setUTCDate(nextArchive.getUTCDate() + 1);
        }
        
        const delayMs = nextArchive.getTime() - now.getTime();
        
        console.log(`⏰ 下一次自动归档: ${nextArchive.toUTCString()} (${Math.round(delayMs/1000/60)}分钟后)`);
        
        // 设置定时器
        setTimeout(() => {
            this.performScheduledArchive();
            // 设置每日重复
            setInterval(() => {
                this.performScheduledArchive();
            }, 24 * 60 * 60 * 1000); // 24小时
        }, delayMs);
    }

    // 执行定时归档
    async performScheduledArchive() {
        console.log('🔄 执行定时归档...');
        
        try {
            await this.archiveToday();
            console.log('✅ 定时归档完成');
        } catch (error) {
            console.error('❌ 定时归档失败:', error);
            // 可以添加重试逻辑
        }
    }

    // 归档当日数据
    async archiveToday() {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const title = `Affirm归档 - ${dateStr}`;
        
        console.log(`📦 开始归档: ${title}`);
        
        // 获取当日数据（这里需要连接数据库获取当日消息）
        const dailyData = await this.fetchDailyData(today);
        
        if (dailyData.length === 0) {
            console.log('📭 当日无数据，跳过归档');
            return;
        }
        
        // 准备Notion页面内容
        const pageContent = this.preparePageContent(dailyData);
        
        // 创建归档页面
        const page = await this.notion.createArchivePage(title, pageContent, {
            // 自定义属性
            Date: {
                date: {
                    start: dateStr
                }
            },
            Status: {
                select: {
                    name: '已归档'
                }
            },
            Count: {
                number: dailyData.length
            }
        });
        
        // 记录归档
        this.archives.push({
            date: dateStr,
            pageId: page.id,
            count: dailyData.length,
            timestamp: new Date().toISOString()
        });
        
        console.log(`✅ 归档完成: ${title} (${dailyData.length}条记录)`);
        return page;
    }

    // 获取当日数据（需要根据实际项目实现）
    async fetchDailyData(date) {
        // TODO: 连接数据库，获取当日消息
        // 这里返回模拟数据
        return [
            {
                id: 1,
                type: 'user',
                content: '今日目标：完成Notion集成',
                timestamp: date.toISOString()
            },
            {
                id: 2,
                type: 'assistant',
                content: '好的，我会帮你完成Notion集成开发。',
                timestamp: date.toISOString()
            }
        ];
    }

    // 准备Notion页面内容
    preparePageContent(data) {
        const blocks = [];
        
        // 添加标题
        blocks.push({
            object: 'block',
            type: 'heading_2',
            heading_2: {
                rich_text: [{
                    type: 'text',
                    text: {
                        content: '📊 当日对话摘要'
                    }
                }]
            }
        });
        
        // 添加摘要统计
        blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{
                    type: 'text',
                    text: {
                        content: `总计 ${data.length} 条对话记录`
                    }
                }]
            }
        });
        
        // 添加详细记录
        blocks.push({
            object: 'block',
            type: 'heading_3',
            heading_3: {
                rich_text: [{
                    type: 'text',
                    text: {
                        content: '📝 详细记录'
                    }
                }]
            }
        });
        
        // 添加每条记录
        data.forEach((item, index) => {
            const emoji = item.type === 'user' ? '👤' : '🤖';
            const time = new Date(item.timestamp).toLocaleTimeString();
            
            blocks.push({
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{
                        type: 'text',
                        text: {
                            content: `${emoji} [${time}] ${item.content}`
                        }
                    }]
                }
            });
        });
        
        // 添加AI分析（如果启用）
        if (this.config.includeAiAnalysis) {
            blocks.push({
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [{
                        type: 'text',
                        text: {
                            content: '🧠 AI分析'
                        }
                    }]
                }
            });
            
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{
                        type: 'text',
                        text: {
                            content: '今日对话主题集中在Notion集成开发，用户表达了明确的目标，助手提供了积极的响应。'
                        }
                    }]
                }
            });
        }
        
        return blocks;
    }

    // 手动触发归档
    async manualArchive(date = new Date()) {
        console.log('🔧 手动触发归档...');
        return await this.archiveToday(date);
    }

    // 获取归档历史
    getArchiveHistory() {
        return this.archives;
    }

    // 清理归档记录
    cleanup() {
        this.archives = [];
    }
}

module.exports = DailyArchiver;
