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
