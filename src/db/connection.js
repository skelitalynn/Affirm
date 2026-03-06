// 数据库连接模块
const { Pool } = require('pg');
const config = require('../config');

function parseDatabaseConfig() {
    const url = config.database.url;

    if (!url || typeof url !== 'string' || url.trim() === '') {
        throw new Error('Database connection is missing: please set DB_URL');
    }

    // 交给 pg 原生 connectionString 解析，避免手写正则导致特殊字符/参数解析错误
    return {
        connectionString: url,
        ...(config.database.pool || {})
    };
}

class Database {
    constructor() {
        const dbConfig = parseDatabaseConfig();
        if (process.env.NODE_ENV !== 'test') {
            console.log('🔧 数据库配置:', {
                host: dbConfig.host || 'from-url',
                database: dbConfig.database || 'from-url',
                user: dbConfig.user || 'from-url'
            });
        }

        if (process.env.NODE_ENV === 'test') {
            dbConfig.allowExitOnIdle = true;
        }

        this.pool = new Pool(dbConfig);
        // pgvector类型注册暂时禁用
        // try {
        //     const { registerTypes } = require('pgvector');
        //     registerTypes(this.pool);
        // } catch (error) {
        //     console.warn('⚠️  pgvector类型注册失败，向量功能可能受限:', error.message);
        // }
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.pool.on('connect', () => {
            console.log('✅ 数据库连接成功');
        });

        this.pool.on('error', (err) => {
            console.error('❌ 数据库连接错误:', err.message);
        });
    }

    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log(`📊 SQL查询执行时间: ${duration}ms`, {
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                params: params ? params.slice(0, 3) : []
            });
            return res;
        } catch (error) {
            console.error('❌ SQL查询错误:', {
                error: error.message,
                code: error.code,
                query: text.substring(0, 200)
            });
            throw error;
        }
    }

    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
    }
}

// 创建单例实例
const db = new Database();

// 测试连接
async function testConnection() {
    try {
        console.log('🔍 测试数据库连接...');
        const result = await db.query('SELECT NOW() as current_time');
        console.log('✅ 数据库连接测试成功:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('❌ 数据库连接测试失败:', error.message);
        console.error('错误详情:', {
            code: error.code,
            detail: error.detail,
            hint: error.hint
        });
        return false;
    }
}

module.exports = {
    db,
    testConnection
};
