#!/usr/bin/env node
/**
 * Reset script: drop core tables and rerun schema bootstrap.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db } = require('../../src/db/connection');

async function run() {
    await db.query(`
        DROP TABLE IF EXISTS sync_jobs CASCADE;
        DROP TABLE IF EXISTS knowledge_chunks CASCADE;
        DROP TABLE IF EXISTS messages CASCADE;
        DROP TABLE IF EXISTS profiles CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
    `);

    const schemaPath = path.join(__dirname, 'schemas', 'init.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await db.query(sql);

    console.log('Database reset complete.');
}

run()
    .catch((error) => {
        console.error('Database reset failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await db.close();
        } catch (_) {
            // ignore
        }
    });
