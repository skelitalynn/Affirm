// 健康检查模块
const { db } = require('./db/connection');
const ragProvider = require('./services/rag/provider');
const config = require('./config');
const { messageQueue } = require('./utils/message-queue');
const SyncJob = require('./models/sync-job');

async function healthCheck() {
    const checks = [];
    
    // 数据库连接检查
    try {
        const dbResult = await db.query('SELECT NOW()');
        checks.push({
            name: 'database',
            status: 'healthy',
            details: { timestamp: dbResult.rows[0].now }
        });
    } catch (error) {
        checks.push({
            name: 'database',
            status: 'unhealthy',
            error: error.message
        });
    }
    
    // 内存使用检查
    const memoryUsage = process.memoryUsage();
    checks.push({
        name: 'memory',
        status: 'healthy',
        details: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
        }
    });
    
    // 应用状态
    checks.push({
        name: 'application',
        status: 'healthy',
        details: {
            uptime: process.uptime(),
            nodeVersion: process.version,
            env: config.app.nodeEnv
        }
    });

    checks.push({
        name: 'message_queue',
        status: 'healthy',
        details: messageQueue.getStats()
    });

    try {
        const syncJobSummary = await SyncJob.summarize();
        checks.push({
            name: 'sync_jobs',
            status: syncJobSummary.byStatus?.failed > 0 ? 'warning' : 'healthy',
            details: syncJobSummary
        });
    } catch (error) {
        checks.push({
            name: 'sync_jobs',
            status: 'warning',
            details: {
                message: error.message
            }
        });
    }

    const knowledgeRagStatus = await ragProvider.getStatus();
    checks.push({
        name: 'knowledge_rag',
        status: knowledgeRagStatus.healthy ? 'healthy' : 'warning',
        details: knowledgeRagStatus.healthy
            ? knowledgeRagStatus
            : {
                ...knowledgeRagStatus,
                code: knowledgeRagStatus.configured
                    ? 'KNOWLEDGE_RAG_HAYSTACK_UNAVAILABLE'
                    : 'KNOWLEDGE_RAG_HAYSTACK_NOT_CONFIGURED',
                message: knowledgeRagStatus.message || (
                    knowledgeRagStatus.configured
                        ? 'Haystack 当前不可用，知识检索已降级为空结果'
                        : 'Haystack 未配置，知识检索已降级为空结果'
                )
            }
    });

    checks.push({
        name: 'profile_memory',
        status: config.memory.enabled ? 'healthy' : 'warning',
        details: {
            code: config.memory.enabled ? 'PROFILE_MEMORY_V2_ACTIVE' : 'PROFILE_MEMORY_DISABLED',
            message: config.memory.enabled
                ? '闭环 v2 使用 MemoryService + profiles 维护长期记忆，messages 仅保留短期上下文'
                : '长期记忆异步整理已关闭，当前仅保留 profiles 读取能力',
            recordJobs: config.memory.recordJobs
        }
    });

    const hasUnhealthy = checks.some(check => check.status === 'unhealthy');
    const hasWarning = checks.some(check => check.status === 'warning');

    return {
        status: hasUnhealthy ? 'degraded' : (hasWarning ? 'healthy_with_warnings' : 'healthy'),
        timestamp: new Date().toISOString(),
        summary: {
            unhealthy: checks.filter(check => check.status === 'unhealthy').length,
            warnings: checks.filter(check => check.status === 'warning').length
        },
        checks
    };
}

module.exports = { healthCheck };
