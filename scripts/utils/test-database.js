#!/usr/bin/env node
/**
 * Database connectivity smoke script.
 */
require('dotenv').config();

const { db, testConnection } = require('../../src/db/connection.js');

async function run() {
    console.log('Database smoke check');
    console.log('===================');

    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
        return;
    }

    const tables = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    `);

    console.log(`[OK] table count: ${tables.rows.length}`);
    for (const row of tables.rows) {
        console.log(` - ${row.table_name}`);
    }

    await db.close();
    process.exit(0);
}

run().catch(async (error) => {
    console.error(`Database smoke check failed: ${error.message}`);
    try { await db.close(); } catch (_) {}
    process.exit(1);
});
