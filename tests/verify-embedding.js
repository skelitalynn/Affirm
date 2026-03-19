#!/usr/bin/env node
const { runEmbeddingVerification } = require('../tools/verify-embedding');

runEmbeddingVerification()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
        console.error('❌ Embedding 验证失败:', error.message);
        process.exit(1);
    });
