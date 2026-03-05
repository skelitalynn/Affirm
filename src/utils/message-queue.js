// 消息队列管理器 - Phase 2: BullMQ 持久化队列（含内存降级）
const config = require('../config');
const { handleError } = require('./error-handler');

let Queue, Worker;
let bullmqAvailable = false;

try {
    ({ Queue, Worker } = require('bullmq'));
    bullmqAvailable = true;
} catch (_) {
    // bullmq 未安装，使用内存队列
}

const QUEUE_NAME = 'affirm:messages';

// ─── BullMQ 实现 ────────────────────────────────────────────────────────────

class BullMQQueue {
    constructor() {
        this.queue = null;
        this.worker = null;
        this.stats = { totalProcessed: 0, totalFailed: 0, mode: 'bullmq' };
    }

    async init(processorFn) {
        const redisOpts = this._buildRedisOpts();

        this.queue = new Queue(QUEUE_NAME, {
            connection: redisOpts,
            defaultJobOptions: {
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
                attempts: 1  // 不重试：processFn 内部已处理用户通知，重试会重复发消息
            }
        });

        // 等待连接就绪（验证 Redis 可用性）
        await this.queue.waitUntilReady();

        this.worker = new Worker(QUEUE_NAME, async (job) => {
            try {
                const result = await processorFn(job.data);
                this.stats.totalProcessed++;
                return result;
            } catch (err) {
                this.stats.totalFailed++;
                // 不重新抛出：错误已在 processorFn 内处理（含用户通知）
                console.error(`❌ [BullMQ] 任务错误 [用户 ${job.data?.userId}]:`, err.message);
            }
        }, {
            connection: this._buildRedisOpts(),
            concurrency: 1
        });

        this.worker.on('failed', (job, err) => {
            console.error(`❌ [BullMQ] 任务失败 [用户 ${job?.data?.userId}]:`, err.message);
        });

        console.log('🚦 消息队列初始化完成 (BullMQ / Redis 持久化模式)');
    }

    async enqueue(userId, data) {
        const userKey = String(userId);
        await this.queue.add('processMessage', { ...data, userId: userKey });
        console.log(`📊 [BullMQ] 用户 ${userKey} 消息入队`);
    }

    async close() {
        if (this.worker) { try { await this.worker.close(); } catch (_) {} this.worker = null; }
        if (this.queue) { try { await this.queue.close(); } catch (_) {} this.queue = null; }
        console.log('🔌 BullMQ 连接已关闭');
    }

    getStats() {
        return { ...this.stats };
    }

    _buildRedisOpts() {
        const opts = {
            host: config.redis.host,
            port: config.redis.port,
            maxRetriesPerRequest: null
        };
        if (config.redis.password) opts.password = config.redis.password;
        return opts;
    }
}

// ─── 内存队列实现（降级 / 无 Redis 场景）────────────────────────────────────

class InMemoryQueue {
    constructor() {
        this.userQueues = new Map();
        this.processorFn = null;
        this.defaultTimeout = 30000;
        this.stats = { totalProcessed: 0, totalFailed: 0, timeouts: 0, mode: 'in-memory' };
    }

    async init(processorFn) {
        this.processorFn = processorFn;
        console.log('🚦 消息队列初始化完成 (内存模式)');
    }

    async enqueue(userId, data) {
        const userKey = String(userId);

        if (!this.userQueues.has(userKey)) {
            this.userQueues.set(userKey, { queue: [], processing: false });
        }

        const userQueue = this.userQueues.get(userKey);

        if (userQueue.queue.length > 10) {
            console.warn(`⚠️  用户 ${userKey} 队列积压: ${userQueue.queue.length} 条消息`);
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const idx = userQueue.queue.findIndex(t => t === task);
                if (idx !== -1) userQueue.queue.splice(idx, 1);
                this.stats.timeouts++;
                const err = new Error(`消息处理超时 (${this.defaultTimeout}ms)`);
                err.code = 'QUEUE_TIMEOUT';
                reject(err);
            }, this.defaultTimeout);

            const task = { data, resolve, reject, timeoutId, enqueuedAt: Date.now() };
            userQueue.queue.push(task);

            console.log(`📊 [内存] 用户 ${userKey} 消息入队，队列大小: ${userQueue.queue.length}`);

            if (!userQueue.processing) {
                this._processQueue(userKey);
            }
        });
    }

    async _processQueue(userKey) {
        const userQueue = this.userQueues.get(userKey);
        if (!userQueue || userQueue.processing) return;
        userQueue.processing = true;

        while (userQueue.queue.length > 0) {
            const task = userQueue.queue[0];
            clearTimeout(task.timeoutId);
            const waitTime = Date.now() - task.enqueuedAt;
            console.log(`🔄 处理用户 ${userKey} 的消息，等待时间: ${waitTime}ms`);

            try {
                const result = await this.processorFn(task.data);
                task.resolve(result);
                this.stats.totalProcessed++;
            } catch (err) {
                const errorContext = { userId: userKey, function: '_processQueue' };
                handleError(err, errorContext);
                task.reject(err);
                this.stats.totalFailed++;
            } finally {
                userQueue.queue.shift();
            }

            if (userQueue.queue.length > 0) {
                await new Promise(r => setTimeout(r, 10));
            }
        }

        userQueue.processing = false;

        setTimeout(() => {
            const q = this.userQueues.get(userKey);
            if (q && q.queue.length === 0 && !q.processing) {
                this.userQueues.delete(userKey);
                console.log(`🧹 清理空队列: 用户 ${userKey}`);
            }
        }, 60000);
    }

    async close() {
        for (const [, userQueue] of this.userQueues) {
            for (const task of userQueue.queue) {
                clearTimeout(task.timeoutId);
                const err = new Error('队列已关闭');
                err.code = 'QUEUE_CLOSED';
                task.reject(err);
            }
        }
        this.userQueues.clear();
        console.log('🧹 内存队列已关闭');
    }

    getStats() {
        return {
            ...this.stats,
            activeQueues: this.userQueues.size
        };
    }
}

// ─── 统一门面（自动选择实现）────────────────────────────────────────────────

class MessageQueue {
    constructor() {
        this._impl = null;
    }

    /**
     * 初始化队列，传入消息处理函数
     * @param {Function} processorFn - async (jobData) => result
     *   jobData: { chatId, userId, username, userMessage }
     */
    async init(processorFn) {
        if (bullmqAvailable) {
            const bullQueue = new BullMQQueue();
            try {
                await bullQueue.init(processorFn);
                this._impl = bullQueue;
                return;
            } catch (err) {
                console.warn(`⚠️  Redis 连接失败，降级为内存队列: ${err.message}`);
                await bullQueue.close().catch(() => {});
            }
        }

        const memQueue = new InMemoryQueue();
        await memQueue.init(processorFn);
        this._impl = memQueue;
    }

    /**
     * 将消息加入队列
     * @param {string|number} userId - Telegram 用户 ID
     * @param {Object} data - 消息数据 { chatId, userId, username, userMessage }
     */
    async enqueue(userId, data) {
        if (!this._impl) throw new Error('MessageQueue 未初始化，请先调用 init()');
        return this._impl.enqueue(userId, data);
    }

    /**
     * 关闭队列，释放资源
     */
    async close() {
        if (this._impl) {
            await this._impl.close();
            this._impl = null;
        }
    }

    getStats() {
        return this._impl ? this._impl.getStats() : { mode: 'uninitialized' };
    }
}

const messageQueue = new MessageQueue();

module.exports = { messageQueue, MessageQueue };
