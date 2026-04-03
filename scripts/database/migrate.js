#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const MIGRATIONS_TABLE = 'schema_migrations';

async function ensureMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
            filename VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

function getMigrationFiles() {
    const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    return fs.readdirSync(migrationsDir)
        .filter((filename) => filename.endsWith('.sql'))
        .sort()
        .map((filename) => ({
            filename,
            filepath: path.join(migrationsDir, filename)
        }));
}

async function getAppliedMigrations(client) {
    const result = await client.query(`SELECT filename FROM ${MIGRATIONS_TABLE}`);
    return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(client, migration) {
    const sql = fs.readFileSync(migration.filepath, 'utf8').trim();

    if (!sql) {
        console.log(`⏭️  跳过空迁移: ${migration.filename}`);
        return;
    }

    await client.query('BEGIN');

    try {
        await client.query(sql);
        await client.query(
            `INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1)`,
            [migration.filename]
        );
        await client.query('COMMIT');
        console.log(`✅ 已应用迁移: ${migration.filename}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${migration.filename} 执行失败: ${error.message}`);
    }
}

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
        await ensureMigrationsTable(client);

        const migrations = getMigrationFiles();
        const appliedMigrations = await getAppliedMigrations(client);

        for (const migration of migrations) {
            if (appliedMigrations.has(migration.filename)) {
                console.log(`⏭️  已跳过迁移: ${migration.filename}`);
                continue;
            }

            await applyMigration(client, migration);
        }

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
