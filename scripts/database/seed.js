#!/usr/bin/env node
const { Pool } = require('pg');
require('dotenv').config();

async function runSeed() {
    if (!process.env.DB_URL) {
        throw new Error('DB_URL 未配置，无法执行种子数据写入');
    }

    const pool = new Pool({ connectionString: process.env.DB_URL });
    const client = await pool.connect();

    try {
        await client.query(`
            INSERT INTO users (telegram_id, username)
            VALUES (7927819221, 'seed_user')
            ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username
        `);

        console.log('✅ 种子数据写入完成');
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    runSeed().catch(error => {
        console.error('❌ 种子数据写入失败:', error.message);
        process.exit(1);
    });
}

module.exports = { runSeed };
