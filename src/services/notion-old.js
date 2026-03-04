// Notion服务 - 基于OpenClaw Notion Skill的归档服务
const NotionClient = require('../../skills/notion/client');
const config = require('../config');

/**
 * Notion服务
 * 基于OpenClaw Notion Skill的归档服务
 */
class NotionService {
    constructor() {
        // 从项目配置读取Notion配置
        this.notionConfig = config.notion;
        this.client = null;
        this.isInitialized = false;
        
        console.log('🔧 Notion服务初始化...');
    }
    
    /**
     * 初始化Notion客户端（懒加载）
     */
    async initialize() {
        if (this.isInitialized && this.client) {
            return;
        }
        
        // 检查配置
        if (!this.notionConfig.apiKey || this.notionConfig.apiKey.includes('your_notion')) {
            throw new Error('Notion API密钥未正确配置 (需要设置NOTION_API_KEY或NOTION_TOKEN)');
        }
        
        if (!this.notionConfig.skillDatabaseId || this.notionConfig.skillDatabaseId.includes('your_notion')) {
            throw new Error('Notion数据库ID未配置 (需要设置NOTION_DATABASE_ID)');
        }
        
        try {
            console.log('🔧 初始化Notion Skill客户端...');
            
            // 创建NotionClient实例
            this.client = new NotionClient();
            
            // NotionClient需要环境变量，手动设置
            process.env.NOTION_API_KEY = this.notionConfig.apiKey;
            process.env.NOTION_DATABASE_ID = this.notionConfig.skillDatabaseId;
            
            // 初始化客户端
            this.client.initialize();
            
            this.isInitialized = true;
            console.log('✅ Notion服务初始化完成');
        } catch (error) {
            console.error('❌ Notion服务初始化失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 归档每日消息到Notion（兼容原有接口）
     * @param {string} userId - 用户UUID
     * @param {string} username - 用户名（用于页面标题）
     * @param {Array} messages - 消息列表
     * @param {Date} date - 归档日期
     * @returns {Promise<string>} 创建的Notion页面ID
     */
    async archiveDailyMessages(userId, username, messages, date) {
        // 确保初始化
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        if (!messages || messages.length === 0) {
            console.log('📭 没有消息需要归档');
            return null;
        }
        
        console.log(`📦 开始归档 ${messages.length} 条消息到Notion...`);
        
        try {
            // 创建页面标题
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
            const title = `💬 ${username} - ${dateStr} 对话归档`;
            
            // 格式化消息为Notion blocks
            const content = this.formatMessagesToBlocks(messages, username);
            
            // 页面属性
            const properties = {
                // 日期属性
                Date: {
                    date: {
                        start: dateStr
                    }
                },
                // 状态属性
                Status: {
                    select: {
                        name: '已归档'
                    }
                },
                // 用户属性
                User: {
                    rich_text: [
                        {
                            text: {
                                content: username
                            }
                        }
                    ]
                },
                // 消息数量
                Count: {
                    number: messages.length
                },
                // 用户ID（用于搜索）
                'User ID': {
                    rich_text: [
                        {
                            text: {
                                content: userId
                            }
                        }
                    ]
                }
            };
            
            // 创建Notion页面
            const page = await this.client.createArchivePage(title, content, properties);
            
            console.log(`✅ 归档完成！页面ID: ${page.id}`);
            return page.id;
            
        } catch (error) {
            console.error('❌ Notion归档失败:', error.message);
            
            // 检查是否为配置错误
            if (error.message.includes('API密钥') || 
                error.message.includes('未配置') || 
                error.message.includes('auth') ||
                error.message.includes('permission')) {
                throw new Error(`Notion配置错误: ${error.message}. 请检查NOTION_API_KEY和NOTION_DATABASE_ID配置。`);
            }
            
            throw error;
        }
    }
    
    /**
     * 格式化消息为Notion blocks
     * @param {Array} messages - 消息列表
     * @param {string} username - 用户名
     * @returns {Array} Notion blocks数组
     */
    formatMessagesToBlocks(messages, username) {
        const blocks = [];
        
        // 添加标题
        blocks.push({
            object: 'block',
            type: 'heading_2',
            heading_2: {
                rich_text: [
                    {
                        text: {
                            content: `📊 对话归档 - ${username}`
                        }
                    }
                ]
            }
        });
        
        // 添加摘要信息
        blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [
                    {
                        text: {
                            content: `总计 ${messages.length} 条消息，按时间顺序排列。`
                        }
                    }
                ]
            }
        });
        
        blocks.push({
            object: 'block',
            type: 'divider',
            divider: {}
        });
        
        // 添加每条消息
        messages.forEach((msg, index) => {
            // 消息头：角色和时间
            const role = msg.role === 'user' ? '👤 用户' : '🤖 AI助手';
            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleString('zh-CN') : '未知时间';
            
            blocks.push({
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [
                        {
                            text: {
                                content: `${role} - ${timeStr}`
                            },
                            annotations: {
                                bold: true,
                                color: msg.role === 'user' ? 'blue' : 'green'
                            }
                        }
                    ]
                }
            });
            
            // 消息内容
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        {
                            text: {
                                content: msg.content || '（无内容）'
                            }
                        }
                    ]
                }
            });
            
            // 如果不是最后一条消息，添加分隔线
            if (index < messages.length - 1) {
                blocks.push({
                    object: 'block',
                    type: 'divider',
                    divider: {}
                });
            }
        });
        
        // 添加页脚
        blocks.push({
            object: 'block',
            type: 'divider',
            divider: {}
        });
        
        blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [
                    {
                        text: {
                            content: '归档时间: '
                        }
                    },
                    {
                        text: {
                            content: new Date().toLocaleString('zh-CN')
                        },
                        annotations: {
                            italic: true
                        }
                    }
                ]
            }
        });
        
        return blocks;
    }
    
    /**
     * 停止服务（兼容原有接口）
     */
    async stop() {
        // NotionClient没有显式的停止方法
        // 清理引用
        this.client = null;
        this.isInitialized = false;
        console.log('🧹 Notion服务已停止');
    }
}

module.exports = NotionService;