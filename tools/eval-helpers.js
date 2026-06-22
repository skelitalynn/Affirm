const fs = require('fs');
const path = require('path');
const User = require('../src/models/user');
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

function loadFixture(fixtureDir, fixtureName = 'baseline') {
    const normalizedName = fixtureName.endsWith('.json') ? fixtureName : `${fixtureName}.json`;
    const fixturePath = path.resolve(__dirname, '..', 'tests', 'fixtures', fixtureDir, normalizedName);

    if (!fs.existsSync(fixturePath)) {
        throw new Error(`未找到评估样本: ${fixturePath}`);
    }

    return {
        fixturePath,
        fixture: JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    };
}

function round(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function includesPattern(text, pattern) {
    const normalizedPattern = normalizeText(pattern);
    if (!normalizedPattern) {
        return false;
    }

    return normalizeText(text).includes(normalizedPattern);
}

function getPatternMatches(text, patterns = []) {
    return Array.from(new Set(
        Array.isArray(patterns)
            ? patterns.filter((pattern) => includesPattern(text, pattern))
            : []
    ));
}

function arraysIncludeEvery(target = [], expected = []) {
    const targetSet = new Set(Array.isArray(target) ? target : []);
    return Array.isArray(expected) ? expected.every((item) => targetSet.has(item)) : true;
}

async function createSyntheticUser({
    label = 'eval',
    usernamePrefix = 'eval_user',
    telegramIdSeed = 900001,
    runId = Date.now(),
    index = 1
} = {}) {
    const telegramId = (runId * 100) + Number(telegramIdSeed || index);
    const username = `${usernamePrefix}_${label}_${runId}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);

    return User.create({
        telegram_id: telegramId,
        username
    });
}

async function cleanupUserDataset(userIds = []) {
    const normalizedUserIds = Array.from(new Set(
        Array.isArray(userIds)
            ? userIds.map((userId) => String(userId || '').trim()).filter(Boolean)
            : []
    ));

    if (normalizedUserIds.length === 0) {
        return;
    }

    await db.query(`
        DELETE FROM sync_jobs
        WHERE job_type = 'memory_update'
          AND details->>'user_id' = ANY($1::text[])
    `, [normalizedUserIds]);
    await db.query('DELETE FROM memory_events WHERE user_id = ANY($1::uuid[])', [normalizedUserIds]);
    await db.query('DELETE FROM messages WHERE user_id = ANY($1::uuid[])', [normalizedUserIds]);
    await db.query('DELETE FROM profiles WHERE user_id = ANY($1::uuid[])', [normalizedUserIds]);
    await db.query('DELETE FROM knowledge_chunks WHERE user_id = ANY($1::uuid[])', [normalizedUserIds]);
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [normalizedUserIds]);
}

function toSummaryRate(results = [], key) {
    const total = Array.isArray(results) ? results.length : 0;
    if (total === 0) {
        return 0;
    }

    return round(results.filter((item) => Boolean(item?.[key])).length / total);
}

module.exports = {
    arraysIncludeEvery,
    cleanupUserDataset,
    createSyntheticUser,
    getPatternMatches,
    includesPattern,
    loadFixture,
    normalizeText,
    parseArgs,
    round,
    toSummaryRate
};
