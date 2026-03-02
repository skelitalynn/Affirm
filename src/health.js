// 健康检查模块
const { db } = require('./db/connection');

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
    
    const allHealthy = checks.every(check => check.status === 'healthy');
    
    return {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        checks
    };
}

module.exports = { healthCheck };
