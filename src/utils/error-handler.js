// 统一错误处理框架 - Day 3+ P1增强
const config = require('../config');

/**
 * 错误类型枚举
 */
const ErrorType = {
    DATABASE: 'DATABASE',
    AI_SERVICE: 'AI_SERVICE',
    NETWORK: 'NETWORK',
    VALIDATION: 'VALIDATION',
    AUTHENTICATION: 'AUTHENTICATION',
    NOTION_API: 'NOTION_API',
    TELEGRAM_API: 'TELEGRAM_API',
    UNKNOWN: 'UNKNOWN'
};

/**
 * 错误严重程度
 */
const ErrorSeverity = {
    LOW: 'LOW',        // 可恢复，不影响核心功能
    MEDIUM: 'MEDIUM',  // 部分功能受影响
    HIGH: 'HIGH',      // 核心功能受影响
    CRITICAL: 'CRITICAL' // 系统不可用
};

/**
 * 基础错误类
 */
class AppError extends Error {
    constructor(message, type = ErrorType.UNKNOWN, severity = ErrorSeverity.MEDIUM, originalError = null) {
        super(message);
        this.name = this.constructor.name;
        this.type = type;
        this.severity = severity;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
        this.requestId = this._generateRequestId();
        
        Error.captureStackTrace(this, this.constructor);
    }
    
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            type: this.type,
            severity: this.severity,
            timestamp: this.timestamp,
            requestId: this.requestId,
            stack: this.stack
        };
    }
}

/**
 * 数据库错误
 */
class DatabaseError extends AppError {
    constructor(message, originalError = null, query = null) {
        super(message, ErrorType.DATABASE, ErrorSeverity.HIGH, originalError);
        this.query = query;
        this.code = originalError?.code || 'UNKNOWN_DB_ERROR';
    }
}

/**
 * AI服务错误
 */
class AIError extends AppError {
    constructor(message, originalError = null, provider = null) {
        super(message, ErrorType.AI_SERVICE, ErrorSeverity.MEDIUM, originalError);
        this.provider = provider;
        this.statusCode = originalError?.status || null;
        this.code = originalError?.code || 'UNKNOWN_AI_ERROR';
    }
}

/**
 * 网络错误
 */
class NetworkError extends AppError {
    constructor(message, originalError = null, url = null) {
        super(message, ErrorType.NETWORK, ErrorSeverity.MEDIUM, originalError);
        this.url = url;
        this.code = originalError?.code || 'NETWORK_ERROR';
    }
}

/**
 * 验证错误
 */
class ValidationError extends AppError {
    constructor(message, field = null, value = null) {
        super(message, ErrorType.VALIDATION, ErrorSeverity.LOW, null);
        this.field = field;
        this.value = value;
    }
}

/**
 * 认证错误
 */
class AuthenticationError extends AppError {
    constructor(message, resource = null) {
        super(message, ErrorType.AUTHENTICATION, ErrorSeverity.HIGH, null);
        this.resource = resource;
    }
}

/**
 * Notion API错误
 */
class NotionError extends AppError {
    constructor(message, originalError = null, pageId = null) {
        super(message, ErrorType.NOTION_API, ErrorSeverity.LOW, originalError);
        this.pageId = pageId;
        this.code = originalError?.code || 'NOTION_API_ERROR';
        this.statusCode = originalError?.status || null;
    }
}

/**
 * Telegram API错误
 */
class TelegramError extends AppError {
    constructor(message, originalError = null, chatId = null) {
        super(message, ErrorType.TELEGRAM_API, ErrorSeverity.MEDIUM, originalError);
        this.chatId = chatId;
        this.code = originalError?.code || 'TELEGRAM_API_ERROR';
    }
}

/**
 * 错误处理器
 */
class ErrorHandler {
    constructor() {
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000, // 1秒
            maxDelay: 10000  // 10秒
        };
        
        this.logLevel = config.app.logLevel || 'info';
        this.setupErrorListeners();
    }
    
    /**
     * 设置错误监听器
     */
    setupErrorListeners() {
        process.on('uncaughtException', (error) => {
            this.handleUncaughtException(error);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            this.handleUnhandledRejection(reason, promise);
        });
    }
    
    /**
     * 处理错误（主入口）
     * @param {Error|AppError} error - 错误对象
     * @param {Object} context - 错误上下文
     * @returns {Object} 处理结果
     */
    handle(error, context = {}) {
        // 转换为AppError（如果不是的话）
        const appError = this._normalizeError(error);
        
        // 添加上下文
        appError.context = context;
        
        // 记录日志
        this._logError(appError);
        
        // 根据错误类型采取不同措施
        const response = this._createErrorResponse(appError);
        
        // 严重错误需要额外处理
        if (appError.severity === ErrorSeverity.HIGH || appError.severity === ErrorSeverity.CRITICAL) {
            this._handleSevereError(appError);
        }
        
        return response;
    }
    
    /**
     * 生成用户友好的错误消息
     * @param {AppError} error - 错误对象
     * @returns {string} 用户友好消息
     */
    getUserFriendlyMessage(error) {
        const errorType = error.type || ErrorType.UNKNOWN;
        
        const messages = {
            [ErrorType.DATABASE]: '系统暂时无法访问数据，请稍后再试。',
            [ErrorType.AI_SERVICE]: 'AI服务暂时不可用，请稍后再试或联系管理员。',
            [ErrorType.NETWORK]: '网络连接出现问题，请检查网络后重试。',
            [ErrorType.VALIDATION]: '输入格式不正确，请检查后重试。',
            [ErrorType.AUTHENTICATION]: '认证失败，请检查配置或重新登录。',
            [ErrorType.NOTION_API]: '归档功能暂时不可用，但对话已保存。',
            [ErrorType.TELEGRAM_API]: '消息发送失败，请稍后再试。',
            [ErrorType.UNKNOWN]: '系统出现未知错误，请稍后再试。'
        };
        
        // 如果有原始错误，可以添加更多细节
        let message = messages[errorType];
        
        // 特定错误代码的特殊处理
        if (error instanceof AIError) {
            if (error.code === 'insufficient_quota') {
                message = 'AI服务额度已用完，请联系管理员或稍后再试。';
            } else if (error.code === 'invalid_api_key') {
                message = 'AI服务配置错误，请联系管理员。';
            }
        } else if (error instanceof DatabaseError) {
            if (error.code === '23505') { // 唯一约束冲突
                message = '数据已存在，无需重复操作。';
            } else if (error.code === '42P01') { // 表不存在
                message = '系统维护中，请稍后再试。';
            }
        }
        
        return message;
    }
    
    /**
     * 带重试的执行
     * @param {Function} fn - 要执行的函数
     * @param {Object} options - 重试选项
     * @returns {Promise<any>} 执行结果
     */
    async executeWithRetry(fn, options = {}) {
        const config = { ...this.retryConfig, ...options };
        let lastError = null;
        
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                // 检查是否应该重试
                if (!this._shouldRetry(error) || attempt === config.maxRetries) {
                    break;
                }
                
                // 计算延迟时间（指数退避）
                const delay = Math.min(
                    config.baseDelay * Math.pow(2, attempt - 1),
                    config.maxDelay
                );
                
                console.log(`🔄 重试 ${attempt}/${config.maxRetries}，等待 ${delay}ms: ${error.message}`);
                await this._sleep(delay);
            }
        }
        
        throw lastError;
    }
    
    /**
     * 包装异步函数，自动错误处理
     * @param {Function} fn - 要包装的函数
     * @param {Object} context - 错误上下文
     * @returns {Function} 包装后的函数
     */
    wrapAsync(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                return this.handle(error, { ...context, function: fn.name, args });
            }
        };
    }
    
    /**
     * 处理未捕获的异常
     */
    handleUncaughtException(error) {
        const appError = this._normalizeError(error);
        appError.severity = ErrorSeverity.CRITICAL;
        appError.context = { uncaught: true };
        
        this._logError(appError, 'error');
        
        // 严重错误可能需要退出
        if (appError.type === ErrorType.DATABASE || appError.severity === ErrorSeverity.CRITICAL) {
            console.error('🛑 严重错误，建议重启应用');
            // 这里可以添加重启逻辑或通知管理员
        }
    }
    
    /**
     * 处理未处理的Promise拒绝
     */
    handleUnhandledRejection(reason, promise) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        const appError = this._normalizeError(error);
        appError.severity = ErrorSeverity.HIGH;
        appError.context = { unhandledRejection: true, promise };
        
        this._logError(appError, 'error');
    }
    
    /**
     * 标准化错误为AppError
     */
    _normalizeError(error) {
        if (error instanceof AppError) {
            return error;
        }
        
        // 根据错误消息判断类型
        let type = ErrorType.UNKNOWN;
        let severity = ErrorSeverity.MEDIUM;
        
        if (error.message?.includes('database') || error.message?.includes('postgres') || error.message?.includes('connection')) {
            type = ErrorType.DATABASE;
            severity = ErrorSeverity.HIGH;
        } else if (error.message?.includes('AI') || error.message?.includes('api') || error.message?.includes('openai')) {
            type = ErrorType.AI_SERVICE;
            severity = ErrorSeverity.MEDIUM;
        } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('fetch')) {
            type = ErrorType.NETWORK;
            severity = ErrorSeverity.MEDIUM;
        } else if (error.message?.includes('notion')) {
            type = ErrorType.NOTION_API;
            severity = ErrorSeverity.LOW;
        } else if (error.message?.includes('telegram')) {
            type = ErrorType.TELEGRAM_API;
            severity = ErrorSeverity.MEDIUM;
        }
        
        return new AppError(error.message, type, severity, error);
    }
    
    /**
     * 记录错误日志
     */
    _logError(error, level = 'error') {
        // 根据日志级别过滤
        const levelPriority = { error: 0, warn: 1, info: 2, debug: 3 };
        const currentPriority = levelPriority[this.logLevel] || 1;
        const errorPriority = levelPriority[level] || 0;
        
        if (errorPriority > currentPriority) {
            return; // 日志级别不够，不记录
        }
        
        const logEntry = {
            timestamp: error.timestamp,
            requestId: error.requestId,
            level: level,
            error: error.toJSON(),
            context: error.context || {}
        };
        
        // 结构化JSON日志
        if (this.logLevel === 'debug') {
            console.log(JSON.stringify(logEntry, null, 2));
        } else {
            const emoji = {
                [ErrorSeverity.LOW]: 'ℹ️',
                [ErrorSeverity.MEDIUM]: '⚠️',
                [ErrorSeverity.HIGH]: '❌',
                [ErrorSeverity.CRITICAL]: '🛑'
            }[error.severity] || '❓';
            
            console.error(`${emoji} [${error.type}] ${error.message}`);
            if (error.originalError?.stack && this.logLevel === 'info') {
                console.error(`   📊 原始错误: ${error.originalError.message}`);
            }
        }
        
        // TODO: 这里可以添加日志文件写入或外部日志服务
    }
    
    /**
     * 创建错误响应
     */
    _createErrorResponse(error) {
        return {
            success: false,
            error: {
                type: error.type,
                message: this.getUserFriendlyMessage(error),
                severity: error.severity,
                requestId: error.requestId,
                timestamp: error.timestamp
            },
            canRetry: this._shouldRetry(error),
            suggestedAction: this._getSuggestedAction(error)
        };
    }
    
    /**
     * 处理严重错误
     */
    _handleSevereError(error) {
        console.error(`🚨 严重错误处理: ${error.type} - ${error.message}`);
        
        // TODO: 这里可以添加：
        // 1. 发送告警通知（Telegram、邮件等）
        // 2. 尝试自动恢复（重启服务、重建连接等）
        // 3. 记录到独立错误文件
        
        if (error.type === ErrorType.DATABASE && error.severity === ErrorSeverity.CRITICAL) {
            console.error('💾 数据库严重错误，建议检查数据库连接');
        }
    }
    
    /**
     * 判断是否应该重试
     */
    _shouldRetry(error) {
        // 这些错误通常可以重试
        const retryableErrors = [
            ErrorType.NETWORK,
            ErrorType.AI_SERVICE, // 如果是因为限速或暂时错误
            ErrorType.TELEGRAM_API // 如果是因为网络问题
        ];
        
        // 这些错误不应该重试
        const nonRetryableErrors = [
            ErrorType.VALIDATION,
            ErrorType.AUTHENTICATION, // 认证错误重试没用
            ErrorType.DATABASE // 数据库连接错误可能需要不同处理
        ];
        
        // 检查错误代码
        if (error.code) {
            const nonRetryableCodes = [
                'invalid_api_key',
                'insufficient_quota',
                '23505', // 唯一约束冲突
                '42P01'  // 表不存在
            ];
            
            if (nonRetryableCodes.includes(error.code)) {
                return false;
            }
        }
        
        return retryableErrors.includes(error.type) && !nonRetryableErrors.includes(error.type);
    }
    
    /**
     * 获取建议操作
     */
    _getSuggestedAction(error) {
        const actions = {
            [ErrorType.DATABASE]: '检查数据库连接，验证连接字符串',
            [ErrorType.AI_SERVICE]: '检查API密钥和额度，验证网络连接',
            [ErrorType.NETWORK]: '检查网络连接，等待网络恢复',
            [ErrorType.VALIDATION]: '验证输入数据格式',
            [ErrorType.AUTHENTICATION]: '检查认证配置，重新获取令牌',
            [ErrorType.NOTION_API]: '检查Notion令牌和页面权限',
            [ErrorType.TELEGRAM_API]: '检查Telegram令牌和网络连接',
            [ErrorType.UNKNOWN]: '查看详细日志，联系开发人员'
        };
        
        return actions[error.type] || '查看日志获取更多信息';
    }
    
    /**
     * 睡眠函数（用于重试延迟）
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 创建单例实例
const errorHandler = new ErrorHandler();

// 导出所有内容
module.exports = {
    ErrorType,
    ErrorSeverity,
    AppError,
    DatabaseError,
    AIError,
    NetworkError,
    ValidationError,
    AuthenticationError,
    NotionError,
    TelegramError,
    errorHandler,
    
    // 快捷方法
    handleError: (error, context) => errorHandler.handle(error, context),
    getUserMessage: (error) => errorHandler.getUserFriendlyMessage(error),
    withRetry: (fn, options) => errorHandler.executeWithRetry(fn, options),
    wrapAsync: (fn, context) => errorHandler.wrapAsync(fn, context)
};
