#!/usr/bin/env node
/**
 * Verify embedding service availability and model path.
 */
require('dotenv').config();

const embeddingService = require('../src/services/embedding');

async function run() {
    console.log('Embedding service check');
    console.log('======================');
    console.log(`provider=${embeddingService.provider}`);
    console.log(`model=${embeddingService.model}`);
    console.log(`dimensions=${embeddingService.dimensions}`);

    const embedding = await embeddingService.generateEmbedding('embedding smoke test');
    if (embedding === null) {
        console.log('[WARN] embedding service unavailable (returned null)');
        return;
    }

    console.log(`[OK] embedding length=${embedding.length}`);
}

run().catch((error) => {
    console.error(`Embedding check failed: ${error.message}`);
    process.exit(1);
});
