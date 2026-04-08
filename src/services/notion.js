const config = require('../config');
const NotionClient = require('../../skills/notion/client');

function isMissingOrPlaceholder(value) {
    return !value || String(value).includes('your_notion');
}

class NotionService {
    constructor() {
        this.notionConfig = config.notion;
        this.client = null;
        this.isInitialized = false;

        console.log('Initializing Notion service...');
    }

    buildSkillConfig() {
        return {
            apiKey: this.notionConfig.apiKey,
            databaseId: this.notionConfig.skillDatabaseId || this.notionConfig.databaseId,
            templatePageId: this.notionConfig.templatePageId || ''
        };
    }

    validateConfig() {
        if (isMissingOrPlaceholder(this.notionConfig.apiKey)) {
            throw new Error('Notion API密钥未正确配置 (需要设置NOTION_API_KEY或NOTION_TOKEN)');
        }

        if (isMissingOrPlaceholder(this.notionConfig.skillDatabaseId || this.notionConfig.databaseId)) {
            throw new Error('Notion数据库ID未配置 (需要设置NOTION_DATABASE_ID)');
        }
    }

    async initialize() {
        if (this.isInitialized && this.client) {
            return;
        }

        this.validateConfig();

        try {
            console.log('Initializing Notion skill client...');

            this.client = new NotionClient(this.buildSkillConfig());
            this.client.initialize();

            this.isInitialized = true;
            console.log('Notion service initialized');
        } catch (error) {
            console.error('Failed to initialize Notion service:', error.message);

            if (error.message.includes('未配置') || error.message.includes('your_notion')) {
                console.error('Configuration check:');
                console.error(`   API key: ${this.notionConfig.apiKey ? 'configured' : 'missing'}`);
                console.error(`   Database ID: ${this.notionConfig.skillDatabaseId ? 'configured' : 'missing'}`);
                console.error('Tip: set NOTION_API_KEY and NOTION_DATABASE_ID in your env file');
            }

            throw error;
        }
    }

    async archiveDailyMessages(userId, username, messages, date) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!messages || messages.length === 0) {
            console.log('No messages to archive');
            return null;
        }

        console.log(`Archiving ${messages.length} messages to Notion...`);

        try {
            const dateStr = date.toISOString().split('T')[0];
            const title = `Chat Archive - ${username} - ${dateStr}`;
            const content = this.formatMessagesToBlocks(messages, username);

            const properties = {
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
                User: {
                    rich_text: [
                        {
                            text: {
                                content: username
                            }
                        }
                    ]
                },
                Count: {
                    number: messages.length
                },
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

            const page = await this.client.createArchivePage(title, content, properties);

            console.log(`Archive completed: ${page.id}`);
            return page.id;
        } catch (error) {
            console.error('Notion archive failed:', error.message);

            if (
                error.message.includes('API密钥')
                || error.message.includes('未配置')
                || error.message.includes('auth')
                || error.message.includes('permission')
            ) {
                throw new Error(`Notion配置错误: ${error.message}. 请检查NOTION_API_KEY和NOTION_DATABASE_ID配置。`);
            }

            if (error.message.includes('database') || error.message.includes('parent')) {
                throw new Error(`数据库权限错误: ${error.message}. 请确保数据库已分享给集成。`);
            }

            throw error;
        }
    }

    formatMessagesToBlocks(messages, username) {
        const blocks = [
            {
                object: 'block',
                type: 'heading_2',
                heading_2: {
                    rich_text: [
                        {
                            text: {
                                content: `对话归档 - ${username}`
                            }
                        }
                    ]
                }
            },
            {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        {
                            text: {
                                content: `共 ${messages.length} 条消息，按时间顺序排列。`
                            }
                        }
                    ]
                }
            },
            {
                object: 'block',
                type: 'divider',
                divider: {}
            }
        ];

        messages.forEach((message, index) => {
            const role = message.role === 'user' ? '用户' : 'AI助手';
            const color = message.role === 'user' ? 'blue' : 'green';
            const timestamp = message.timestamp
                ? new Date(message.timestamp).toLocaleString('zh-CN')
                : '未知时间';

            blocks.push({
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [
                        {
                            text: {
                                content: `${role} - ${timestamp}`
                            },
                            annotations: {
                                bold: true,
                                color
                            }
                        }
                    ]
                }
            });

            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        {
                            text: {
                                content: message.content || '(无内容)'
                            }
                        }
                    ]
                }
            });

            if (index < messages.length - 1) {
                blocks.push({
                    object: 'block',
                    type: 'divider',
                    divider: {}
                });
            }
        });

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

    async stop() {
        this.client = null;
        this.isInitialized = false;
        console.log('Notion service stopped');
    }
}

module.exports = NotionService;
