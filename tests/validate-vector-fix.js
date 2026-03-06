#!/usr/bin/env node
/**
 * Validate message embedding fallback behavior.
 */
require('dotenv').config();

const Message = require('../src/models/message');
const { db } = require('../src/db/connection');

async function run() {
    const user = await db.query(`
        INSERT INTO users (telegram_id, username)
        VALUES ($1, $2)
        ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username
        RETURNING id
    `, [8999990001, 'vector_validation_user']);

    const userId = user.rows[0].id;

    const created = await Message.create({
        user_id: userId,
        role: 'user',
        content: 'embedding validation message'
    });

    console.log(`[OK] message created: ${created.id}`);

    await db.query('DELETE FROM messages WHERE id = $1', [created.id]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.close();
}

run().catch(async (error) => {
    console.error(`Validation failed: ${error.message}`);
    try { await db.close(); } catch (_) {}
    process.exit(1);
});
