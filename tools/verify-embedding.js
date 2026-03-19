#!/usr/bin/env node
require('dotenv').config();

const embeddingService = require('../src/services/embedding');

async function runEmbeddingVerification() {
    if (!embeddingService.isAvailable()) {
        console.error('⚠️ Embedding 服务不可用：未配置 EMBEDDING_API_KEY 或客户端初始化失败');
        return false;
    }

    const testText = 'Affirm embedding health check';
    const embedding = await embeddingService.generateEmbedding(testText);

    if (!Array.isArray(embedding) || embedding.length !== embeddingService.dimensions) {
        console.error('❌ Embedding 结果格式异常');
        return false;
    }

    console.log(`✅ Embedding 验证通过，维度: ${embedding.length}`);
    return true;
}

if (require.main === module) {
    runEmbeddingVerification()
        .then((success) => process.exit(success ? 0 : 1))
        .catch((error) => {
            console.error('❌ Embedding 验证失败:', error.message);
            process.exit(1);
        });
}

module.exports = { runEmbeddingVerification };
