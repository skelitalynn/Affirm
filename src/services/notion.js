// 最小Notion归档服务（Day 4 最小版本）
const { Client } = require('@notionhq/client');

class NotionService {
    constructor() {
        this.client = null;
        this.parentPageId = process.env.NOTION_PARENT_PAGE_ID;
        this.apiKey = process.env.NOTION_TOKEN;
        
        if (!this.apiKey) {
            console.warn('⚠️  Notion API密钥未配置，归档功能将不可用');
        }
        
        if (!this.parentPageId) {
            console.warn('⚠️  Notion父页面ID未配置，归档功能将不可用');
        }
    }
    
    // 初始化Notion客户端（懒加载）
    async initialize() {
        if (!this.apiKey || !this.parentPageId) {
            throw new Error('Notion配置不完整，无法初始化');
        }
        
        if (this.client) {
            return; // 已初始化
        }
        
        console.log('🔧 初始化Notion客户端...');
        try {
            this.client = new Client({
                auth: this.apiKey
            });
            
            // 简单测试连接
            await this.client.users.list({ page_size: 1 });
            console.log('✅ Notion客户端初始化成功');
        } catch (error) {
            console.error('❌ Notion客户端初始化失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 归档每日消息到Notion
     * @param {string} userId - 用户UUID
     * @param {string} username - 用户名（用于页面标题）
     * @param {Array} messages - 消息列表（来自getDailyMessages）
     * @param {Date} date - 归档日期
     * @returns {Promise<string>} 创建的Notion页面ID
     */
    async archiveDailyMessages(userId, username, messages, date = new Date()) {
        try {
            await this.initialize();
            
            if (messages.length === 0) {
                console.log('📭 没有消息需要归档');
                return null;
            }
            
            console.log(`📦 开始归档 ${messages.length} 条消息到Notion...`);
            
            // 创建页面标题
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
            const title = `💬 ${username} - ${dateStr} 对话归档`;
            
            // 创建页面内容（简化版Markdown）
            const content = this.formatMessagesToBlocks(messages);
            
            // 创建Notion页面
            const pageId = await this.createPage(title, content);
            
            console.log(`✅ 归档完成！页面ID: ${pageId}`);
            return pageId;
            
        } catch (error) {
            console.error('❌ 归档失败:', error.message);
            throw error; // 向上抛出，由调用者决定如何处理
        }
    }
    
    /**
     * 格式化消息为Notion blocks
     * @param {Array} messages - 消息列表
     * @returns {Array} Notion blocks数组
     */
    formatMessagesToBlocks(messages) {
        const blocks = [];
        
        // 添加标题
        blocks.push({
            object: 'block',
            type: 'heading_2',
            heading_2: {
                rich_text: [{
                    type: 'text',
                    text: { content: '📝 对话原文' }
                }]
            }
        });
        
        // 添加每条消息
        messages.forEach((msg, index) => {
            const time = new Date(msg.created_at).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // 角色标识
            const roleEmoji = msg.role === 'user' ? '👤' : '🤖';
            const roleText = msg.role === 'user' ? '用户' : '助手';
            
            // 添加消息块
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        {
                            type: 'text',
                            text: { 
                                content: `${roleEmoji} [${time}] ${roleText}: `
                            },
                            annotations: { bold: true }
                        },
                        {
                            type: 'text',
                            text: { content: msg.content }
                        }
                    ]
                }
            });
            
            // 每5条消息添加分隔线
            if ((index + 1) % 5 === 0 && index < messages.length - 1) {
                blocks.push({
                    object: 'block',
                    type: 'divider',
                    divider: {}
                });
            }
        });
        
        // 添加元数据
        blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{
                    type: 'text',
                    text: { 
                        content: `📊 统计: 共 ${messages.length} 条消息 (用户: ${
                            messages.filter(m => m.role === 'user').length
                        } 条, 助手: ${
                            messages.filter(m => m.role === 'assistant').length
                        } 条)` 
                    },
                    annotations: { italic: true, color: 'gray' }
                }]
            }
        });
        
        return blocks;
    }
    
    /**
     * 创建Notion页面
     * @param {string} title - 页面标题
     * @param {Array} blocks - 页面内容blocks
     * @returns {Promise<string>} 创建的页面ID
     */
    async createPage(title, blocks) {
        if (!this.client) {
            throw new Error('Notion客户端未初始化');
        }
        
        try {
            const response = await this.client.pages.create({
                parent: { 
                    page_id: this.parentPageId 
                },
                properties: {
                    title: {
                        title: [
                            {
                                text: {
                                    content: title
                                }
                            }
                        ]
                    }
                },
                children: blocks
            });
            
            return response.id;
            
        } catch (error) {
            console.error('❌ 创建Notion页面失败:', error.message);
            if (error.response) {
                console.error('📊 响应状态:', error.response.status);
                console.error('📊 响应数据:', error.response.data);
            }
            throw error;
        }
    }
    
    /**
     * 简单测试Notion连接
     * @returns {Promise<boolean>} 连接是否成功
     */
    async testConnection() {
        try {
            await this.initialize();
            
            // 获取用户信息作为测试
            const response = await this.client.users.list({ page_size: 1 });
            console.log(`✅ Notion连接测试成功，用户: ${response.results[0]?.name || 'Unknown'}`);
            return true;
        } catch (error) {
            console.error('❌ Notion连接测试失败:', error.message);
            return false;
        }
    }
}

module.exports = NotionService;