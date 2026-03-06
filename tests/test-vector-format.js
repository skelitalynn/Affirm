#!/usr/bin/env node
/**
 * Validate pgvector SQL conversion format.
 */
require('dotenv').config();

const { db } = require('../src/db/connection');
const embeddingService = require('../src/services/embedding');

async function run() {
    const vector = new Array(8).fill(0).map((_, i) => Number((i / 10).toFixed(2)));
    const sqlVector = embeddingService.toVectorSql(vector);

    if (!sqlVector) {
        throw new Error('Failed to convert vector to SQL format');
    }

    console.log(`Converted vector: ${sqlVector}`);

    const result = await db.query('SELECT pg_typeof($1::vector) AS vector_type', [sqlVector]);
    console.log(`[OK] postgres type: ${result.rows[0].vector_type}`);

    await db.close();
}

run().catch(async (error) => {
    console.error(`Vector format check failed: ${error.message}`);
    try { await db.close(); } catch (_) {}
    process.exit(1);
});
