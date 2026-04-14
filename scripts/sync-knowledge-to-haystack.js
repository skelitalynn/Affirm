#!/usr/bin/env node
require('dotenv').config();

const Knowledge = require('../src/models/knowledge');
const ragProvider = require('../src/services/rag/provider');
const { db } = require('../src/db/connection');

async function main() {
    const batchSize = Math.max(1, parseInt(process.env.KNOWLEDGE_SYNC_BATCH_SIZE, 10) || 50);
    let offset = 0;
    let total = 0;
    let synced = 0;
    let pending = 0;
    let failed = 0;

    if (!ragProvider.isConfigured()) {
        throw new Error('未配置 HAYSTACK_BASE_URL，无法执行知识回填');
    }

    console.log(`🚚 开始回填 knowledge_chunks -> Haystack，批大小 ${batchSize}`);

    while (true) {
        const rows = await Knowledge.findAll(batchSize, offset);
        if (rows.length === 0) {
            break;
        }

        const result = await Knowledge.syncRowsToRag(rows);
        total += rows.length;
        synced += result.syncedRows.length;
        pending += result.pendingRows.length;
        failed += result.failedRows.length;

        console.log(`📦 已处理 ${total} 条知识：synced=${synced}, pending=${pending}, failed=${failed}`);
        offset += batchSize;
    }

    console.log('✅ 知识回填完成', { total, synced, pending, failed });

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error('❌ 知识回填失败:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await db.close();
        } catch (error) {
            console.error('⚠️ 关闭数据库连接失败:', error.message);
        }
    });
