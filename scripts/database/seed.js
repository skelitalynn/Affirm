#!/usr/bin/env node
/**
 * Seed script.
 */
require('dotenv').config();

const { db } = require('../../src/db/connection');

async function run() {
    await db.query(`
        INSERT INTO users (telegram_id, username)
        VALUES ($1, $2)
        ON CONFLICT (telegram_id) DO NOTHING
    `, [7927819221, 'seed_user']);

    console.log('Database seed complete.');
}

run()
    .catch((error) => {
        console.error('Database seed failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await db.close();
        } catch (_) {
            // ignore
        }
    });
