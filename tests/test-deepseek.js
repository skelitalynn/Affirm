#!/usr/bin/env node
/**
 * DeepSeek/OpenAI compatibility quick check.
 */
require('dotenv').config();

const OpenAI = require('openai');
const config = require('../src/config');

async function run() {
    console.log('AI connectivity check');
    console.log('=====================');
    console.log(`provider=${config.ai.provider}`);
    console.log(`model=${config.ai.model}`);
    console.log(`baseURL=${config.ai.baseURL}`);

    if (!config.ai.apiKey) {
        console.error('Missing AI API key for selected provider');
        process.exit(1);
        return;
    }

    const client = new OpenAI({
        apiKey: config.ai.apiKey,
        baseURL: config.ai.baseURL
    });

    const models = await client.models.list();
    console.log(`[OK] models discovered: ${models.data.length}`);
}

run().catch((error) => {
    console.error(`AI connectivity check failed: ${error.message}`);
    process.exit(1);
});
