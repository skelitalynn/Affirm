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
