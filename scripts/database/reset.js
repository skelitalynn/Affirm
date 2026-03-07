#!/usr/bin/env node
const { Pool } = require('pg');
require('dotenv').config();

const { runMigrate } = require('./migrate');
const { runSeed } = require('./seed');

async function runReset() {
    if (!process.env.DB_URL) {
        throw new Error('DB_URL 未配置，无法执行数据库重置');
    }

    const pool = new Pool({ connectionString: process.env.DB_URL });
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query('DROP TABLE IF EXISTS messages CASCADE');
        await client.query('DROP TABLE IF EXISTS knowledge_chunks CASCADE');
        await client.query('DROP TABLE IF EXISTS profiles CASCADE');
        await client.query('DROP TABLE IF EXISTS sync_jobs CASCADE');
        await client.query('DROP TABLE IF EXISTS users CASCADE');
        await client.query('COMMIT');
        console.log('✅ 数据表清理完成');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }

    await runMigrate();
    await runSeed();
    console.log('✅ 数据库重置完成');
}

if (require.main === module) {
    runReset().catch(error => {
        console.error('❌ 数据库重置失败:', error.message);
        process.exit(1);
    });
}

module.exports = { runReset };
