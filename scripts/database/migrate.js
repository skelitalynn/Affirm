#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function runMigrate() {
    if (!process.env.DB_URL) {
        throw new Error('DB_URL 未配置，无法执行迁移');
    }

    const pool = new Pool({ connectionString: process.env.DB_URL });
    const client = await pool.connect();

    try {
        const schemaPath = path.join(__dirname, 'schemas', 'init.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        try {
            await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        } catch (error) {
            console.warn('⚠️  自动创建 vector 扩展失败，继续执行 schema:', error.message);
        }

        await client.query(schemaSql);
        console.log('✅ 数据库迁移完成');
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    runMigrate().catch(error => {
        console.error('❌ 数据库迁移失败:', error.message);
        process.exit(1);
    });
}

module.exports = { runMigrate };
