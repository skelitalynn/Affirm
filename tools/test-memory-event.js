#!/usr/bin/env node
const User = require('../src/models/user');
const MemoryEvent = require('../src/models/memory-event');
const MemoryEventService = require('../src/services/memory-event-service');
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

async function runTestMemoryEvent() {
    const args = parseArgs(process.argv.slice(2));
    const user = await resolveUser(args);

    if (!user) {
        throw new Error('未找到可用用户，请传入 --userId=<uuid> 或 --telegramId=<id>');
    }

    const memoryEventService = new MemoryEventService();
    const [created] = await memoryEventService.saveCandidates({
        userId: user.id,
        sourceMessageIds: args.messageId ? [args.messageId] : [],
        metadata: {
            source: 'tools/test-memory-event',
            created_by: 'codex'
        },
        candidates: [{
            event_type: args.eventType || 'commitment',
            title: args.title || '开始晨间复盘',
            summary: args.summary || '用户承诺连续 7 天做晨间复盘',
            detail: args.detail || '第一步先从每天 10 分钟开始，优先验证存储链路。',
            keywords: ['晨间复盘', '习惯', '验证脚本'],
            importance: 0.9,
            confidence: 0.8
        }]
    });

    if (!created) {
        throw new Error('memory_event 未成功创建');
    }

    const latest = await MemoryEvent.findByUserId(user.id, { limit: 3 });

    console.log('✅ memory_event 写入成功');
    console.log(`👤 user_id: ${user.id}`);
    console.log(`🧠 event_id: ${created.id}`);
    console.log(`📝 title: ${created.title}`);
    console.log(`📚 最近事件数: ${latest.length}`);

    return {
        user,
        created,
        latest
    };
}

if (require.main === module) {
    runTestMemoryEvent()
        .then(async () => {
            await db.close();
            process.exit(0);
        })
        .catch(async (error) => {
            console.error('❌ memory_event 验证失败:', error.message);
            await db.close();
            process.exit(1);
        });
}

module.exports = { runTestMemoryEvent };
