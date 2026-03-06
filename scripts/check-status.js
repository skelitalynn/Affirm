#!/usr/bin/env node
/**
 * Quick system status check.
 */
require('dotenv').config();

const config = require('../src/config');
const { db } = require('../src/db/connection');

async function checkSystemStatus() {
    console.log('Affirm system status check');
    console.log('==========================');

    const requiredEnv = ['DB_URL', 'TELEGRAM_BOT_TOKEN'];
    let ok = true;

    for (const key of requiredEnv) {
        const value = process.env[key];
        if (!value || !String(value).trim()) {
            console.log(`[FAIL] ${key} is missing`);
            ok = false;
        } else {
            console.log(`[OK] ${key}`);
        }
    }

    try {
        await db.query('SELECT 1');
        console.log('[OK] database connection');
    } catch (error) {
        console.log(`[FAIL] database connection: ${error.message}`);
        ok = false;
    }

    try {
        const users = await db.query('SELECT COUNT(*)::int AS count FROM users');
        const messages = await db.query('SELECT COUNT(*)::int AS count FROM messages');
        console.log(`[INFO] users=${users.rows[0].count}, messages=${messages.rows[0].count}`);
    } catch (error) {
        console.log(`[WARN] failed to query counters: ${error.message}`);
    }

    console.log('');
    console.log(`AI provider: ${config.ai.provider}`);
    console.log(`AI model: ${config.ai.model}`);

    await db.close();
    process.exit(ok ? 0 : 1);
}

checkSystemStatus().catch(async (error) => {
    console.error(error.stack || error.message);
    try { await db.close(); } catch (_) {}
    process.exit(1);
});
