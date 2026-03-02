// 统一配置管理器 - Day 3+ 增强
const config = require('../config');
const EventEmitter = require('events');

class ConfigManager extends EventEmitter {
    constructor() {
        super();
        this._config = this._deepClone(config);
        this._defaults = this._createDefaults();
        this._validators = this._createValidators();
        this._cache = new Map();
        
        // 应用默认值
        this._applyDefaults();
        
        // 验证配置
        this._validateConfig();
        
        console.log('🔧 配置管理器初始化完成');
    }
    
    /**
     * 获取配置值（支持点号路径）
     * @param {string} path - 配置路径，如 'ai.temperature' 或 'telegram.botToken'
     * @param {any} defaultValue - 默认值（如果配置不存在）
     * @returns {any} 配置值
     */
    get(path, defaultValue = undefined) {
        // 缓存检查
        const cacheKey = `${path}:${JSON.stringify(defaultValue)}`;
        if (this._cache.has(cacheKey)) {
            return this._cache.get(cacheKey);
        }
        
        const parts = path.split('.');
        let value = this._config;
        
        for (const part of parts) {
            if (value === null || value === undefined || typeof value !== 'object') {
                value = defaultValue;
                break;
            }
            value = value[part];
        }
        
        // 如果未找到，使用默认值
        if (value === undefined) {
            value = defaultValue;
        }
        
        // 缓存结果（非敏感数据）
        if (!this._isSensitivePath(path)) {
            this._cache.set(cacheKey, value);
        }
        
        return value;
    }
    
    /**
     * 设置配置值（运行时更新）
     * @param {string} path - 配置路径
     * @param {any} value - 配置值
     * @param {boolean} validate - 是否验证
     * @returns {boolean} 是否成功
     */
    set(path, value, validate = true) {
        try {
            if (validate && !this._validateValue(path, value)) {
                console.warn(`⚠️  配置验证失败: ${path} = ${JSON.stringify(value)}`);
                return false;
            }
            
            const parts = path.split('.');
            let obj = this._config;
            
            // 导航到父对象
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!obj[part] || typeof obj[part] !== 'object') {
                    obj[part] = {};
                }
                obj = obj[part];
            }
            
            // 设置值
            const lastPart = parts[parts.length - 1];
            const oldValue = obj[lastPart];
            obj[lastPart] = value;
            
            // 清除相关缓存
            this._clearCacheForPath(path);
            
            // 触发更新事件
            this.emit('config:update', { path, oldValue, newValue: value });
            console.log(`⚙️  配置已更新: ${path}`);
            
            return true;
        } catch (error) {
            console.error(`❌ 设置配置失败: ${path}`, error.message);
            return false;
        }
    }
    
    /**
     * 检查配置是否完整
     * @returns {Object} 检查结果
     */
    check() {
        const result = {
            valid: true,
            missing: [],
            invalid: [],
            warnings: []
        };
        
        // 检查必需配置
        const requiredPaths = [
            'telegram.botToken',
            'database.url',
            'ai.apiKey'
        ];
        
        for (const path of requiredPaths) {
            const value = this.get(path);
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                result.valid = false;
                result.missing.push(path);
            }
        }
        
        // 检查Notion配置（非必需，但如果有配置则验证）
        const notionToken = this.get('notion.token');
        const notionParentPageId = this.get('notion.parentPageId');
        if (notionToken && notionParentPageId) {
            if (notionToken.includes('your_notion') || notionParentPageId.includes('your_notion')) {
                result.warnings.push('notion.token和notion.parentPageId使用占位符，归档功能不可用');
            }
        }
        
        // 验证配置值
        for (const [path, validator] of Object.entries(this._validators)) {
            const value = this.get(path);
            if (value !== undefined && !validator(value)) {
                result.invalid.push(path);
                result.valid = false;
            }
        }
        
        return result;
    }
    
    /**
     * 获取所有配置（过滤敏感信息）
     * @returns {Object} 配置对象
     */
    getAll() {
        return this._filterSensitive(this._deepClone(this._config));
    }
    
    /**
     * 重新加载配置（从环境变量）
     */
    reload() {
        console.log('🔄 重新加载配置...');
        
        // 重新加载环境变量
        delete require.cache[require.resolve('dotenv')];
        require('dotenv').config();
        
        // 重新加载主配置
        delete require.cache[require.resolve('../config')];
        const newConfig = require('../config');
        
        // 更新配置
        this._config = this._deepClone(newConfig);
        this._applyDefaults();
        
        // 清除缓存
        this._cache.clear();
        
        // 验证
        this._validateConfig();
        
        this.emit('config:reload');
        console.log('✅ 配置重新加载完成');
    }
    
    /**
     * 创建验证器
     */
    _createValidators() {
        return {
            'telegram.botToken': (value) => typeof value === 'string' && value.length > 40 && value.includes(':'),
            'ai.apiKey': (value) => typeof value === 'string' && value.length > 20 && value.startsWith('sk-'),
            'ai.temperature': (value) => typeof value === 'number' && value >= 0 && value <= 2,
            'ai.maxTokens': (value) => typeof value === 'number' && value >= 1 && value <= 4000,
            'app.logLevel': (value) => ['error', 'warn', 'info', 'debug'].includes(value),
            'telegram.contextLimit': (value) => typeof value === 'number' && value >= 1 && value <= 100,
            'telegram.historyLimit': (value) => typeof value === 'number' && value >= 1 && value <= 50
        };
    }
    
    /**
     * 创建默认值
     */
    _createDefaults() {
        return {
            'ai.temperature': 0.7,
            'ai.maxTokens': 1000,
            'telegram.contextLimit': 20,
            'telegram.historyLimit': 10,
            'telegram.typingDelayMs': 500,
            'app.logLevel': 'info',
            'database.pool.max': 20,
            'database.pool.min': 5,
            'database.pool.idleTimeoutMillis': 30000
        };
    }
    
    /**
     * 应用默认值
     */
    _applyDefaults() {
        for (const [path, defaultValue] of Object.entries(this._defaults)) {
            const currentValue = this.get(path);
            if (currentValue === undefined) {
                this.set(path, defaultValue, false);
            }
        }
    }
    
    /**
     * 验证配置
     */
    _validateConfig() {
        const checkResult = this.check();
        
        if (!checkResult.valid) {
            console.error('❌ 配置验证失败:');
            if (checkResult.missing.length > 0) {
                console.error('   缺失配置:', checkResult.missing.join(', '));
            }
            if (checkResult.invalid.length > 0) {
                console.error('   无效配置:', checkResult.invalid.join(', '));
            }
            throw new Error('配置验证失败，请检查环境变量');
        }
        
        if (checkResult.warnings.length > 0) {
            console.warn('⚠️  配置警告:');
            checkResult.warnings.forEach(warning => console.warn(`   ${warning}`));
        }
    }
    
    /**
     * 验证单个值
     */
    _validateValue(path, value) {
        const validator = this._validators[path];
        if (!validator) {
            return true; // 没有验证器，允许设置
        }
        return validator(value);
    }
    
    /**
     * 深克隆对象
     */
    _deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    /**
     * 清除路径相关缓存
     */
    _clearCacheForPath(path) {
        const keysToDelete = [];
        for (const key of this._cache.keys()) {
            if (key.startsWith(path + ':') || key.split(':')[0] === path) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this._cache.delete(key));
    }
    
    /**
     * 判断是否是敏感路径
     */
    _isSensitivePath(path) {
        const sensitivePatterns = [
            /\.token$/i,
            /\.apiKey$/i,
            /\.secret$/i,
            /password$/i,
            /auth$/i,
            /key$/i
        ];
        
        return sensitivePatterns.some(pattern => pattern.test(path));
    }
    
    /**
     * 过滤敏感信息
     */
    _filterSensitive(obj, path = '') {
        if (Array.isArray(obj)) {
            return obj.map(item => this._filterSensitive(item, path));
        }
        
        if (obj !== null && typeof obj === 'object') {
            const filtered = {};
            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;
                if (this._isSensitivePath(currentPath) && typeof value === 'string') {
                    // 显示部分信息
                    if (value.length <= 8) {
                        filtered[key] = '***';
                    } else {
                        filtered[key] = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
                    }
                } else {
                    filtered[key] = this._filterSensitive(value, currentPath);
                }
            }
            return filtered;
        }
        
        return obj;
    }
}

// 创建单例实例
const configManager = new ConfigManager();

module.exports = configManager;