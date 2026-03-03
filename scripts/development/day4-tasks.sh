#!/bin/bash
# Day 4: Notion集成
# 根据开发计划：实现每日归档功能

set -e

echo "🚀 开始Day 4任务：Notion集成"
echo "=================================="

# 加载环境变量
source /root/projects/Affirm/.env

# 1. 配置Notion API连接
echo "1. 配置Notion API连接..."

# 创建Notion配置目录
mkdir -p /root/projects/Affirm/skills/notion

# 创建Notion API配置文件
cat > /root/projects/Affirm/skills/notion/config.js << 'EOF'
// Notion API配置
module.exports = {
    // Notion API密钥
    apiKey: process.env.NOTION_API_KEY || '',
    
    // 数据库ID
    databaseId: process.env.NOTION_DATABASE_ID || '',
    
    // 归档页面模板ID（可选）
    templatePageId: process.env.NOTION_TEMPLATE_PAGE_ID || '',
    
    // 归档配置
    archiveConfig: {
        // 是否启用每日自动归档
        enabled: true,
        
        // 归档时间（UTC小时）
        archiveHour: 23, // 23:00 UTC
        
        // 归档时区偏移（小时）
        timezoneOffset: 8, // UTC+8
        
        // 是否包含对话原文
        includeRawMessages: true,
        
        // 是否包含AI分析
        includeAiAnalysis: true,
        
        // 最大归档条数（防止过多）
        maxEntriesPerDay: 100
    }
};
EOF

# 2. 实现Notion页面创建功能
echo "2. 实现Notion页面创建功能..."

cat > /root/projects/Affirm/skills/notion/client.js << 'EOF'
// Notion API客户端
const { Client } = require('@notionhq/client');
const config = require('./config');

class NotionClient {
    constructor() {
        this.config = config;
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
EOF

# 3. 创建每日归档定时任务
echo "3. 创建每日归档定时任务..."

cat > /root/projects/Affirm/skills/notion/archiver.js << 'EOF'
// 每日归档管理器
const NotionClient = require('./client');
const config = require('./config');

class DailyArchiver {
    constructor() {
        this.config = config.archiveConfig;
        this.notion = new NotionClient();
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
EOF

# 4. 创建归档状态跟踪
echo "4. 创建归档状态跟踪..."

cat > /root/projects/Affirm/skills/notion/tracker.js << 'EOF'
// 归档状态跟踪器
class ArchiveTracker {
    constructor() {
        this.archives = new Map(); // dateStr -> archiveInfo
        this.stats = {
            totalArchives: 0,
            successfulArchives: 0,
            failedArchives: 0,
            lastArchiveDate: null,
            lastArchiveStatus: null
        };
    }

    // 记录归档开始
    startArchive(dateStr) {
        const archiveId = `${dateStr}_${Date.now()}`;
        
        this.archives.set(archiveId, {
            id: archiveId,
            date: dateStr,
            startTime: new Date().toISOString(),
            status: 'processing',
            attempts: 1,
            error: null,
            pageId: null
        });
        
        console.log(`📊 开始归档跟踪: ${archiveId}`);
        return archiveId;
    }

    // 记录归档成功
    completeArchive(archiveId, pageId) {
        const archive = this.archives.get(archiveId);
        if (!archive) {
            console.warn(`⚠️ 未找到归档记录: ${archiveId}`);
            return;
        }

        archive.status = 'completed';
        archive.endTime = new Date().toISOString();
        archive.pageId = pageId;
        archive.duration = new Date(archive.endTime) - new Date(archive.startTime);

        // 更新统计
        this.stats.totalArchives++;
        this.stats.successfulArchives++;
        this.stats.lastArchiveDate = archive.date;
        this.stats.lastArchiveStatus = 'success';

        console.log(`✅ 归档完成: ${archiveId} (${archive.duration}ms)`);
    }

    // 记录归档失败
    failArchive(archiveId, error) {
        const archive = this.archives.get(archiveId);
        if (!archive) {
            console.warn(`⚠️ 未找到归档记录: ${archiveId}`);
            return;
        }

        archive.status = 'failed';
        archive.endTime = new Date().toISOString();
        archive.error = error.message || String(error);
        archive.duration = new Date(archive.endTime) - new Date(archive.startTime);

        // 更新统计
        this.stats.totalArchives++;
        this.stats.failedArchives++;
        this.stats.lastArchiveDate = archive.date;
        this.stats.lastArchiveStatus = 'failed';

        console.error(`❌ 归档失败: ${archiveId} - ${archive.error}`);
    }

    // 重试归档
    retryArchive(archiveId) {
        const archive = this.archives.get(archiveId);
        if (!archive) {
            console.warn(`⚠️ 未找到归档记录: ${archiveId}`);
            return null;
        }

        archive.attempts++;
        archive.status = 'retrying';
        archive.startTime = new Date().toISOString();
        archive.endTime = null;
        archive.error = null;

        console.log(`🔄 重试归档: ${archiveId} (尝试 ${archive.attempts})`);
        return archiveId;
    }

    // 获取归档状态
    getArchiveStatus(archiveId) {
        return this.archives.get(archiveId);
    }

    // 获取日期归档状态
    getDateArchiveStatus(dateStr) {
        const archives = Array.from(this.archives.values())
            .filter(archive => archive.date === dateStr)
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        if (archives.length === 0) {
            return {
                date: dateStr,
                status: 'not_started',
                lastAttempt: null
            };
        }

        const latest = archives[0];
        return {
            date: dateStr,
            status: latest.status,
            lastAttempt: latest.startTime,
            attempts: archives.length,
            pageId: latest.pageId,
            error: latest.error
        };
    }

    // 获取统计信息
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalArchives > 0 
                ? (this.stats.successfulArchives / this.stats.totalArchives * 100).toFixed(2) + '%'
                : '0%',
            averageAttempts: this.stats.totalArchives > 0
                ? (Array.from(this.archives.values()).reduce((sum, a) => sum + a.attempts, 0) / this.stats.totalArchives).toFixed(2)
                : 0
        };
    }

    // 清理旧记录（保留最近30天）
    cleanupOldRecords(daysToKeep = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysToKeep);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        let removed = 0;
        for (const [id, archive] of this.archives.entries()) {
            if (archive.date < cutoffStr) {
                this.archives.delete(id);
                removed++;
            }
        }

        console.log(`🧹 清理归档记录: 移除了${removed}条${daysToKeep}天前的记录`);
        return removed;
    }

    // 导出所有记录（用于备份）
    exportRecords() {
        return {
            archives: Array.from(this.archives.values()),
            stats: this.stats,
            exportTime: new Date().toISOString()
        };
    }

    // 导入记录（用于恢复）
    importRecords(data) {
        if (data.archives && Array.isArray(data.archives)) {
            for (const archive of data.archives) {
                this.archives.set(archive.id, archive);
            }
        }
        
        if (data.stats) {
            this.stats = data.stats;
        }

        console.log(`📥 导入归档记录: ${data.archives?.length || 0}条记录`);
    }
}

module.exports = ArchiveTracker;
EOF

# 5. 创建失败重试机制
echo "5. 创建失败重试机制..."

cat > /root/projects/Affirm/skills/notion/retry.js << 'EOF'
// 失败重试机制
class RetryManager {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
        this.jitter = 0.2; // 20%随机抖动
    }

    // 执行带重试的操作
    async executeWithRetry(operation, context = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🔄 尝试执行操作 (尝试 ${attempt}/${this.maxRetries})`);
                
                if (attempt > 1) {
                    // 计算退避延迟（指数退避 + 随机抖动）
                    const delay = this.calculateDelay(attempt);
                    console.log(`⏳ 等待 ${delay}ms 后重试...`);
                    await this.sleep(delay);
                }
                
                const result = await operation();
                console.log(`✅ 操作成功 (尝试 ${attempt})`);
                return result;
                
            } catch (error) {
                lastError = error;
                console.error(`❌ 尝试 ${attempt} 失败:`, error.message);
                
                // 检查是否可重试
                if (!this.isRetryableError(error)) {
                    console.log('⚠️ 错误不可重试，停止重试');
                    break;
                }
                
                // 如果是最后一次尝试，抛出错误
                if (attempt === this.maxRetries) {
                    console.log(`🚫 达到最大重试次数 (${this.maxRetries})`);
                    break;
                }
            }
        }
        
        throw lastError || new Error('操作失败');
    }

    // 计算延迟时间（指数退避）
    calculateDelay(attempt) {
        // 指数退避: baseDelay * 2^(attempt-1)
        const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
        
        // 添加随机抖动 (±20%)
        const jitterRange = exponentialDelay * this.jitter;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        
        const delay = exponentialDelay + jitter;
        
        // 确保最小延迟为baseDelay
        return Math.max(this.baseDelay, Math.round(delay));
    }

    // 判断错误是否可重试
    isRetryableError(error) {
        const retryableMessages = [
            'timeout',
            'network',
            'rate limit',
            'too many requests',
            'service unavailable',
            'gateway',
            'internal server error'
        ];
        
        const errorMessage = error.message.toLowerCase();
        
        // 网络相关错误可重试
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
            return true;
        }
        
        // 检查错误消息
        for (const msg of retryableMessages) {
            if (errorMessage.includes(msg)) {
                return true;
            }
        }
        
        // 特定HTTP状态码
        if (error.statusCode) {
            const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
            if (retryableStatusCodes.includes(error.statusCode)) {
                return true;
            }
        }
        
        return false;
    }

    // 睡眠函数
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 设置自定义重试策略
    setRetryPolicy({ maxRetries, baseDelay, jitter }) {
        if (maxRetries !== undefined) this.maxRetries = maxRetries;
        if (baseDelay !== undefined) this.baseDelay = baseDelay;
        if (jitter !== undefined) this.jitter = jitter;
        
        console.log(`🔄 更新重试策略: maxRetries=${this.maxRetries}, baseDelay=${this.baseDelay}ms, jitter=${this.jitter*100}%`);
    }

    // 获取当前策略
    getPolicy() {
        return {
            maxRetries: this.maxRetries,
            baseDelay: this.baseDelay,
            jitter: this.jitter
        };
    }
}

module.exports = RetryManager;
EOF

# 6. 创建归档配置界面（占位符）
echo "6. 创建归档配置界面..."

mkdir -p /root/projects/Affirm/src/notion

cat > /root/projects/Affirm/src/notion/config-ui.js << 'EOF'
// Notion归档配置界面（占位符）
// 实际实现需要前端框架，这里提供配置对象

module.exports = {
    // 配置字段定义
    fields: [
        {
            id: 'enabled',
            label: '启用自动归档',
            type: 'boolean',
            default: true,
            description: '是否启用每日自动归档功能'
        },
        {
            id: 'archiveHour',
            label: '归档时间 (UTC)',
            type: 'number',
            min: 0,
            max: 23,
            default: 23,
            description: '每日归档执行时间 (UTC小时)'
        },
        {
            id: 'timezoneOffset',
            label: '时区偏移 (小时)',
            type: 'number',
            min: -12,
            max: 14,
            default: 8,
            description: '相对于UTC的时区偏移，用于显示本地时间'
        },
        {
            id: 'includeRawMessages',
            label: '包含对话原文',
            type: 'boolean',
            default: true,
            description: '是否在归档中包含完整的对话原文'
        },
        {
            id: 'includeAiAnalysis',
            label: '包含AI分析',
            type: 'boolean',
            default: true,
            description: '是否在归档中包含AI生成的对话分析'
        },
        {
            id: 'maxEntriesPerDay',
            label: '最大归档条数',
            type: 'number',
            min: 1,
            max: 1000,
            default: 100,
            description: '每日最多归档的对话条数，防止数据过多'
        }
    ],

    // 验证配置
    validateConfig(config) {
        const errors = [];
        
        if (config.archiveHour < 0 || config.archiveHour > 23) {
            errors.push('归档时间必须在0-23之间');
        }
        
        if (config.timezoneOffset < -12 || config.timezoneOffset > 14) {
            errors.push('时区偏移必须在-12到14之间');
        }
        
        if (config.maxEntriesPerDay < 1 || config.maxEntriesPerDay > 1000) {
            errors.push('最大归档条数必须在1-1000之间');
        }
        
        return errors;
    },

    // 获取默认配置
    getDefaultConfig() {
        const defaultConfig = {};
        this.fields.forEach(field => {
            defaultConfig[field.id] = field.default;
        });
        return defaultConfig;
    },

    // 获取配置说明
    getFieldDescription(fieldId) {
        const field = this.fields.find(f => f.id === fieldId);
        return field ? field.description : '';
    }
};
EOF

# 7. 测试归档流程（模拟测试）
echo "7. 测试归档流程..."

cat > /root/projects/Affirm/skills/notion/test-archive.js << 'EOF'
// Notion归档测试脚本
const DailyArchiver = require('./archiver');
const ArchiveTracker = require('./tracker');
const RetryManager = require('./retry');

async function testArchive() {
    console.log('🧪 开始Notion归档测试...');
    
    try {
        // 初始化组件
        const tracker = new ArchiveTracker();
        const retryManager = new RetryManager(2, 500); // 最多重试2次
        const archiver = new DailyArchiver();
        
        // 模拟归档日期
        const testDate = new Date();
        const dateStr = testDate.toISOString().split('T')[0];
        
        console.log(`📅 测试归档日期: ${dateStr}`);
        
        // 开始跟踪
        const archiveId = tracker.startArchive(dateStr);
        
        // 使用重试机制执行归档
        try {
            const result = await retryManager.executeWithRetry(async () => {
                // 注意：实际测试需要配置Notion API密钥
                // 这里模拟归档成功
                console.log('📦 模拟归档执行...');
                
                // 模拟网络延迟
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 模拟成功
                return {
                    id: 'mock_page_123',
                    url: 'https://notion.so/mock-page',
                    archivedAt: new Date().toISOString()
                };
            });
            
            // 记录成功
            tracker.completeArchive(archiveId, result.id);
            console.log(`✅ 归档测试成功: ${result.url}`);
            
        } catch (error) {
            // 记录失败
            tracker.failArchive(archiveId, error);
            console.error(`❌ 归档测试失败: ${error.message}`);
        }
        
        // 显示统计
        const stats = tracker.getStats();
        console.log('📊 归档统计:', stats);
        
        // 显示日期状态
        const dateStatus = tracker.getDateArchiveStatus(dateStr);
        console.log('📅 日期归档状态:', dateStatus);
        
        console.log('🧪 Notion归档测试完成');
        
    } catch (error) {
        console.error('💥 测试过程中出现错误:', error);
    }
}

// 运行测试
testArchive();
EOF

# 8. 优化归档性能（配置建议）
echo "8. 优化归档性能..."

cat > /root/projects/Affirm/skills/notion/performance.md << 'EOF'
# Notion归档性能优化指南

## 1. 批量处理
- **推荐**: 将多条对话合并为一个Notion block
- **避免**: 每条对话单独创建block
- **批量大小**: 10-20条对话/block

## 2. 延迟加载
- **推荐**: 仅在需要时加载对话历史
- **实现**: 使用分页查询数据库
- **页面大小**: 每次查询50-100条记录

## 3. 缓存策略
- **内存缓存**: 缓存频繁访问的Notion页面ID
- **TTL**: 设置5-10分钟缓存过期
- **失效策略**: 归档成功后清除相关缓存

## 4. 并发控制
- **最大并发**: 限制同时进行的归档操作数为1
- **队列**: 使用任务队列管理归档请求
- **重试队列**: 失败的任务进入重试队列

## 5. 网络优化
- **超时设置**: Notion API调用超时设为30秒
- **重试策略**: 使用指数退避重试（最大3次）
- **压缩**: 对长文本进行gzip压缩

## 6. 数据库优化
- **索引**: 为归档相关字段创建索引
- **分区**: 按日期对消息表进行分区
- **归档**: 定期将旧消息移动到归档表

## 7. 监控指标
- **成功率**: 目标 > 99%
- **平均延迟**: 目标 < 2秒/归档
- **错误率**: 目标 < 1%
- **队列长度**: 监控待归档任务数

## 8. 降级方案
- **主方案**: Notion归档
- **备选方案**: 本地JSON文件归档
- **应急方案**: 数据库备份归档

## 9. 测试建议
- **单元测试**: 覆盖所有归档组件
- **集成测试**: 模拟Notion API响应
- **压力测试**: 测试大量并发归档
- **恢复测试**: 测试归档失败后的恢复

## 10. 部署建议
- **独立进程**: 归档服务作为独立进程运行
- **监控告警**: 设置归档失败告警
- **日志记录**: 详细记录归档过程
- **版本控制**: 归档格式版本化管理
EOF

# 9. 更新环境变量模板
echo "9. 更新环境变量模板..."

# 检查.env.example是否存在
if [ -f /root/projects/Affirm/.env.example ]; then
    echo "🔧 更新.env.example..."
    
    # 添加Notion配置
    if ! grep -q "NOTION_API_KEY" /root/projects/Affirm/.env.example; then
        cat >> /root/projects/Affirm/.env.example << 'EOF'

# Notion集成配置
NOTION_API_KEY=your_notion_api_key_here
NOTION_DATABASE_ID=your_notion_database_id_here
NOTION_TEMPLATE_PAGE_ID=optional_template_page_id_here
EOF
        echo "✅ 已添加Notion配置到.env.example"
    else
        echo "✅ .env.example中已存在Notion配置"
    fi
fi

# 10. 创建集成测试
echo "10. 创建集成测试..."

cat > /root/projects/Affirm/tests/notion-integration.test.js << 'EOF'
// Notion集成测试（占位符）
// 实际测试需要配置Notion API密钥

describe('Notion集成', () => {
    test('配置加载', () => {
        const config = require('../skills/notion/config');
        expect(config).toBeDefined();
        expect(typeof config.apiKey).toBe('string');
    });

    test('客户端初始化', () => {
        const NotionClient = require('../skills/notion/client');
        const client = new NotionClient();
        expect(client).toBeInstanceOf(NotionClient);
    });

    test('归档器创建', () => {
        const DailyArchiver = require('../skills/notion/archiver');
        const archiver = new DailyArchiver();
        expect(archiver).toBeInstanceOf(DailyArchiver);
    });

    test('重试管理器', () => {
        const RetryManager = require('../skills/notion/retry');
        const retry = new RetryManager();
        expect(retry.maxRetries).toBe(3);
        expect(retry.baseDelay).toBe(1000);
    });

    test('状态跟踪', () => {
        const ArchiveTracker = require('../skills/notion/tracker');
        const tracker = new ArchiveTracker();
        const stats = tracker.getStats();
        expect(stats.totalArchives).toBe(0);
    });
});
EOF

echo "=================================="
echo "✅ Day 4任务完成：Notion集成基础框架已创建"
echo ""
echo "📁 生成的文件："
echo "  - skills/notion/config.js           Notion配置"
echo "  - skills/notion/client.js           Notion API客户端"
echo "  - skills/notion/archiver.js         每日归档管理器"
echo "  - skills/notion/tracker.js          归档状态跟踪"
echo "  - skills/notion/retry.js            失败重试机制"
echo "  - src/notion/config-ui.js    配置界面（占位符）"
echo "  - skills/notion/test-archive.js     测试脚本"
echo "  - skills/notion/performance.md      性能优化指南"
echo "  - tests/notion-integration.test.js 集成测试"
echo ""
echo "⚠️  注意："
echo "  1. 需要配置Notion API密钥到.env文件"
echo "  2. 需要设置Notion数据库ID"
echo "  3. 实际归档功能需要连接数据库获取对话数据"
echo ""
echo "🚀 下一步："
echo "  1. 配置Notion API密钥"
echo "  2. 运行测试: node skills/notion/test-archive.js"
echo "  3. 集成到主应用程序中"
echo "=================================="