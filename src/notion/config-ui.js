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
