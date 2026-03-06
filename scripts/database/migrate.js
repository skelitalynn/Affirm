#!/usr/bin/env node
/**
 * Basic DB migration runner (schema bootstrap).
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db } = require('../../src/db/connection');

async function run() {
    const schemaPath = path.join(__dirname, 'schemas', 'init.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    await db.query(sql);
    console.log('Database migration complete.');
}

run()
    .catch((error) => {
        console.error('Database migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await db.close();
        } catch (_) {
            // ignore
        }
    });
