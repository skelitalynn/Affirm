// 数据库连接模块
const { Pool } = require('pg');
const config = require('../config');

class Database {
    constructor() {
        this.pool = new Pool(config.database);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.pool.on('connect', () => {
            console.log('✅ 数据库连接成功');
        });

        this.pool.on('error', (err) => {
            console.error('❌ 数据库连接错误:', err);
        });
    }

    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log(`📊 SQL查询执行时间: ${duration}ms`, { text });
            return res;
        } catch (error) {
            console.error('❌ SQL查询错误:', { text, params, error: error.message });
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
        const result = await db.query('SELECT NOW() as current_time');
        console.log('✅ 数据库连接测试成功:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('❌ 数据库连接测试失败:', error.message);
        return false;
    }
}

module.exports = {
    db,
    testConnection
};
