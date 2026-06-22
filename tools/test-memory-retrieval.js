#!/usr/bin/env node
const User = require('../src/models/user');
const MemoryEventService = require('../src/services/memory-event-service');
const MemoryRetrievalService = require('../src/services/memory-retrieval-service');
const { db } = require('../src/db/connection');

function parseArgs(argv = []) {
    const parsed = {};

    argv.forEach((arg) => {
        const [key, value = ''] = String(arg).split('=');
        if (key.startsWith('--')) {
            parsed[key.slice(2)] = value;
        }
    });

    return parsed;
}

async function resolveUser(args = {}) {
    if (args.userId) {
        const result = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [args.userId]);
        return result.rows[0] || null;
    }

    if (args.telegramId) {
        return User.findByTelegramId(args.telegramId);
    }

    const result = await db.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 1');
    return result.rows[0] || null;
}

async function runTestMemoryRetrieval() {
    const args = parseArgs(process.argv.slice(2));
    const query = String(args.query || '晨间复盘承诺').trim();
    const user = await resolveUser(args);

    if (!user) {
        throw new Error('未找到可用用户，请传入 --userId=<uuid> 或 --telegramId=<id>');
    }

    const memoryEventService = new MemoryEventService();
    await memoryEventService.saveCandidates({
        userId: user.id,
        metadata: {
            source: 'tools/test-memory-retrieval'
        },
        candidates: [
            {
                event_type: 'commitment',
                title: '晨间复盘承诺验证样本',
                summary: '用户准备连续 7 天做晨间复盘',
                detail: '第一步先从每天 10 分钟开始，观察执行阻力。',
                keywords: ['晨间复盘', '承诺', '习惯'],
                importance: 0.92,
                confidence: 0.88
            },
            {
                event_type: 'setback',
                title: '拖延反复出现',
                summary: '用户在开始前常被完美主义卡住',
                detail: '每次要开始新习惯时都会先想把方案做得过度完整。',
                keywords: ['拖延', '完美主义'],
                importance: 0.84,
                confidence: 0.9
            }
        ]
    });

    const retrievalService = new MemoryRetrievalService();
    const rows = await retrievalService.searchRelevantEvents({
        userId: user.id,
        queryText: query,
        limit: 5
    });

    console.log(JSON.stringify({
        user_id: user.id,
        query,
        count: rows.length,
        results: rows.map((row) => ({
            id: row.id,
            event_type: row.event_type,
            title: row.title,
            final_score: row.final_score,
            vector_score: row.vector_score,
            keyword_score: row.keyword_score
        }))
    }, null, 2));
}

if (require.main === module) {
    runTestMemoryRetrieval()
        .then(async () => {
            await db.close();
            process.exit(0);
        })
        .catch(async (error) => {
            console.error('❌ memory retrieval 验证失败:', error.message);
            await db.close();
            process.exit(1);
        });
}

module.exports = { runTestMemoryRetrieval };
