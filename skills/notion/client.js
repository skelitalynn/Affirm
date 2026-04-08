// Notion API客户端
const { Client } = require('@notionhq/client');
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

class NotionClient {
    constructor(configOverrides = {}) {
        this.config = buildNotionConfig(configOverrides);
        this.client = null;
        this.initialized = false;
    }

    // 初始化Notion客户端
    initialize() {
        if (!this.config.apiKey) {
            throw new Error('Notion API密钥未配置');
        }

        console.log('🔧 初始化Notion客户端...');
        this.client = new Client({
            auth: this.config.apiKey
        });
        this.initialized = true;
        console.log('✅ Notion客户端初始化完成');
    }

    // 检查是否已初始化
    checkInitialized() {
        if (!this.initialized || !this.client) {
            throw new Error('Notion客户端未初始化');
        }
    }

    // 创建归档页面
    async createArchivePage(title, content, properties = {}) {
        this.checkInitialized();

        try {
            console.log(`📄 创建Notion页面: ${title}`);
            
            const pageProperties = {
                ...properties,
                // 默认属性
                title: {
                    title: [
                        {
                            text: {
                                content: title
                            }
                        }
                    ]
                }
            };

            // 如果有模板页面，使用模板
            if (this.config.templatePageId) {
                const response = await this.client.pages.create({
                    parent: {
                        page_id: this.config.templatePageId
                    },
                    properties: pageProperties,
                    children: content || []
                });
                return response;
            }

            // 否则直接创建到数据库
            if (this.config.databaseId) {
                const response = await this.client.pages.create({
                    parent: {
                        database_id: this.config.databaseId
                    },
                    properties: pageProperties,
                    children: content || []
                });
                return response;
            }

            throw new Error('未配置数据库ID或模板页面ID');
        } catch (error) {
            console.error('❌ 创建Notion页面失败:', error);
            throw error;
        }
    }

    // 查询数据库
    async queryDatabase(filter = {}, sorts = []) {
        this.checkInitialized();

        if (!this.config.databaseId) {
            throw new Error('未配置数据库ID');
        }

        try {
            const response = await this.client.databases.query({
                database_id: this.config.databaseId,
                filter,
                sorts
            });
            return response.results;
        } catch (error) {
            console.error('❌ 查询Notion数据库失败:', error);
            throw error;
        }
    }

    // 更新页面
    async updatePage(pageId, properties, content = []) {
        this.checkInitialized();

        try {
            const response = await this.client.pages.update({
                page_id: pageId,
                properties,
                children: content
            });
            return response;
        } catch (error) {
            console.error('❌ 更新Notion页面失败:', error);
            throw error;
        }
    }

    // 获取页面内容
    async getPageContent(pageId) {
        this.checkInitialized();

        try {
            const response = await this.client.blocks.children.list({
                block_id: pageId
            });
            return response.results;
        } catch (error) {
            console.error('❌ 获取Notion页面内容失败:', error);
            throw error;
        }
    }
}

module.exports = NotionClient;
