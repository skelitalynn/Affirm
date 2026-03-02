// 基于用户ID的消息队列管理器 - 并发控制
const { errorHandler, handleError } = require('./error-handler');

/**
 * 消息队列管理器
 * 确保每个用户的消息按顺序串行处理
 */
class MessageQueue {
    constructor() {
        // 用户ID -> 队列映射
        this.userQueues = new Map();
        // 超时时间（毫秒）
        this.defaultTimeout = 30000; // 30秒
        // 队列状态监控
        this.stats = {
            totalProcessed: 0,
            activeQueues: 0,
            maxQueueSize: 0,
            timeouts: 0
        };
        
        console.log('🚦 消息队列管理器初始化完成');
    }
    
    /**
     * 将消息加入用户队列并串行处理
     * @param {string} userId - 用户ID（Telegram ID）
     * @param {Function} processFn - 处理函数（必须返回Promise）
     * @param {Object} context - 上下文信息（用于日志和错误处理）
     * @returns {Promise<any>} 处理结果
     */
    async enqueue(userId, processFn, context = {}) {
        // 确保userId是字符串
        const userKey = String(userId);
        
        // 如果用户还没有队列，创建一个
        if (!this.userQueues.has(userKey)) {
            this.userQueues.set(userKey, {
                queue: [],
                processing: false,
                createdAt: Date.now(),
                processedCount: 0
            });
            this.stats.activeQueues = this.userQueues.size;
        }
        
        const userQueue = this.userQueues.get(userKey);
        const queueSize = userQueue.queue.length;
        
        // 更新最大队列大小统计
        if (queueSize > this.stats.maxQueueSize) {
            this.stats.maxQueueSize = queueSize;
        }
        
        // 如果队列中有太多待处理消息，可以警告
        if (queueSize > 10) {
            console.warn(`⚠️  用户 ${userKey} 队列积压: ${queueSize} 条消息`);
        }
        
        return new Promise((resolve, reject) => {
            // 创建队列任务
            const task = {
                processFn,
                context,
                resolve,
                reject,
                enqueuedAt: Date.now(),
                timeoutId: null
            };
            
            // 设置超时
            task.timeoutId = setTimeout(() => {
                this._handleTimeout(task, userKey, userQueue);
            }, this.defaultTimeout);
            
            // 添加到队列
            userQueue.queue.push(task);
            
            // 如果队列不在处理中，开始处理
            if (!userQueue.processing) {
                this._processQueue(userKey);
            }
            
            console.log(`📊 用户 ${userKey} 消息入队，队列大小: ${userQueue.queue.length}`);
        });
    }
    
    /**
     * 处理用户队列
     * @private
     */
    async _processQueue(userKey) {
        const userQueue = this.userQueues.get(userKey);
        if (!userQueue || userQueue.processing) {
            return;
        }
        
        userQueue.processing = true;
        
        while (userQueue.queue.length > 0) {
            const task = userQueue.queue[0]; // 获取第一个任务（FIFO）
            const waitTime = Date.now() - task.enqueuedAt;
            
            console.log(`🔄 处理用户 ${userKey} 的消息，等待时间: ${waitTime}ms，队列剩余: ${userQueue.queue.length - 1}`);
            
            try {
                // 清除超时计时器（因为即将开始处理）
                if (task.timeoutId) {
                    clearTimeout(task.timeoutId);
                    task.timeoutId = null;
                }
                
                // 执行处理函数
                const result = await task.processFn();
                
                // 任务成功完成
                task.resolve(result);
                userQueue.processedCount++;
                this.stats.totalProcessed++;
                
            } catch (error) {
                // 任务处理失败
                const errorContext = {
                    ...task.context,
                    userId: userKey,
                    queueSize: userQueue.queue.length,
                    waitTime
                };
                
                const errorResult = handleError(error, errorContext);
                console.error(`❌ 用户 ${userKey} 消息处理失败: ${errorResult.error.type}`);
                
                task.reject(error);
                
            } finally {
                // 从队列中移除已处理的任务
                userQueue.queue.shift();
            }
            
            // 在处理下一个任务前添加微小延迟，避免事件循环阻塞
            if (userQueue.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        // 队列处理完成
        userQueue.processing = false;
        
        // 如果队列为空，可以清理（可选）
        if (userQueue.queue.length === 0) {
            // 保持队列一段时间，避免频繁创建销毁
            setTimeout(() => {
                if (this.userQueues.has(userKey)) {
                    const q = this.userQueues.get(userKey);
                    if (q.queue.length === 0 && !q.processing) {
                        this.userQueues.delete(userKey);
                        this.stats.activeQueues = this.userQueues.size;
                        console.log(`🧹 清理空队列: 用户 ${userKey}`);
                    }
                }
            }, 60000); // 60秒后清理
        }
    }
    
    /**
     * 处理任务超时
     * @private
     */
    _handleTimeout(task, userKey, userQueue) {
        this.stats.timeouts++;
        
        console.error(`⏰ 用户 ${userKey} 消息处理超时，已等待 ${Date.now() - task.enqueuedAt}ms`);
        
        // 从队列中移除超时任务
        const taskIndex = userQueue.queue.indexOf(task);
        if (taskIndex !== -1) {
            userQueue.queue.splice(taskIndex, 1);
        }
        
        // 创建超时错误
        const timeoutError = new Error(`消息处理超时 (${this.defaultTimeout}ms)`);
        timeoutError.code = 'QUEUE_TIMEOUT';
        timeoutError.userId = userKey;
        timeoutError.waitTime = Date.now() - task.enqueuedAt;
        
        const errorContext = {
            ...task.context,
            timeoutMs: this.defaultTimeout,
            queueSize: userQueue.queue.length
        };
        
        handleError(timeoutError, errorContext);
        
        // 拒绝Promise
        task.reject(timeoutError);
        
        // 如果当前任务正在处理中且已超时，继续处理下一个
        if (taskIndex === 0 && userQueue.processing) {
            // 当前任务正在处理但超时了，需要继续处理队列
            // 这里可以尝试中断当前处理，但比较复杂
            // 简单起见，继续处理下一个
            setTimeout(() => {
                if (this.userQueues.has(userKey)) {
                    const q = this.userQueues.get(userKey);
                    if (q.queue.length > 0) {
                        this._processQueue(userKey);
                    }
                }
            }, 100);
        }
    }
    
    /**
     * 获取队列统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const queueSizes = [];
        for (const [userId, queue] of this.userQueues) {
            queueSizes.push({
                userId,
                size: queue.queue.length,
                processing: queue.processing,
                processedCount: queue.processedCount,
                age: Date.now() - queue.createdAt
            });
        }
        
        return {
            ...this.stats,
            activeQueues: this.userQueues.size,
            queueDetails: queueSizes,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * 清空所有队列（用于关闭或重置）
     */
    clearAll() {
        const pendingTasks = [];
        
        for (const [userId, userQueue] of this.userQueues) {
            for (const task of userQueue.queue) {
                if (task.timeoutId) {
                    clearTimeout(task.timeoutId);
                }
                
                const error = new Error('队列被清空');
                error.code = 'QUEUE_CLEARED';
                task.reject(error);
                pendingTasks.push(task);
            }
        }
        
        this.userQueues.clear();
        this.stats.activeQueues = 0;
        
        console.log(`🧹 清空所有队列，取消 ${pendingTasks.length} 个待处理任务`);
        
        return pendingTasks.length;
    }
    
    /**
     * 设置超时时间
     * @param {number} timeoutMs - 超时时间（毫秒）
     */
    setTimeout(timeoutMs) {
        if (timeoutMs < 1000 || timeoutMs > 300000) {
            throw new Error('超时时间必须在1秒到5分钟之间');
        }
        this.defaultTimeout = timeoutMs;
        console.log(`⚙️  队列超时时间设置为: ${timeoutMs}ms`);
    }
    
    /**
     * 等待所有队列处理完成
     * @param {number} timeoutMs - 最大等待时间
     * @returns {Promise<boolean>} 是否全部完成
     */
    async drain(timeoutMs = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            let hasActiveProcessing = false;
            
            for (const [userId, userQueue] of this.userQueues) {
                if (userQueue.processing || userQueue.queue.length > 0) {
                    hasActiveProcessing = true;
                    break;
                }
            }
            
            if (!hasActiveProcessing) {
                console.log('✅ 所有队列已处理完成');
                return true;
            }
            
            // 等待一段时间再检查
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.warn(`⚠️  等待队列处理完成超时 (${timeoutMs}ms)`);
        return false;
    }
}

// 创建单例实例
const messageQueue = new MessageQueue();

// 导出
module.exports = {
    MessageQueue,
    messageQueue,
    
    // 快捷方法
    enqueue: (userId, processFn, context) => messageQueue.enqueue(userId, processFn, context),
    getStats: () => messageQueue.getStats(),
    clearAll: () => messageQueue.clearAll(),
    drain: (timeoutMs) => messageQueue.drain(timeoutMs)
};