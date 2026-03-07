// 健康检查模块
const { db } = require('./db/connection');
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
            env: process.env.NODE_ENV
        }
    });

    // Embedding 配置状态（缺失时不会阻断主流程，但会影响语义检索）
    if (config.embedding && config.embedding.apiKey) {
        checks.push({
            name: 'embedding',
            status: 'healthy',
            details: {
                provider: config.embedding.provider,
                model: config.embedding.model,
                dimensions: config.embedding.dimensions
            }
        });
    } else {
        checks.push({
            name: 'embedding',
            status: 'warning',
            details: {
                code: 'EMBEDDING_API_KEY_MISSING',
                message: 'EMBEDDING_API_KEY 未配置，RAG/语义检索已降级（fallback 模式）',
                action: '请配置 EMBEDDING_API_KEY 以恢复向量检索能力'
            }
        });
    }

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
