// 健康检查模块
const { db } = require('./db/connection');
const knowledgeVectorStore = require('./services/rag/knowledge-vector-store');
const config = require('./config');

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

    const knowledgeRagStatus = knowledgeVectorStore.getStatus();
    checks.push({
        name: 'knowledge_rag',
        status: knowledgeRagStatus.degraded ? 'warning' : 'healthy',
        details: knowledgeRagStatus.degraded
            ? {
                ...knowledgeRagStatus,
                code: 'KNOWLEDGE_RAG_DETERMINISTIC_EMBEDDINGS',
                message: 'knowledge RAG 当前使用本地 deterministic 向量，检索质量有限'
            }
            : knowledgeRagStatus
    });

    checks.push({
        name: 'message_semantic_memory',
        status: 'warning',
        details: {
            code: 'MESSAGE_SEMANTIC_MEMORY_DISABLED',
            message: 'messages 语义记忆已停用，当前仅保留 knowledge RAG'
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
