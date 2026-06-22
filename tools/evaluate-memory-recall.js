#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
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

function extractCjkTerms(segment, maxItems = 8) {
    const normalizedSegment = String(segment || '').trim().toLowerCase();
    if (!normalizedSegment) {
        return [];
    }

    const compactSegment = normalizedSegment
        .replace(/(我|你|他|她|它|我们|你们|他们|之前|现在|最近|继续|重新|还是|已经|不要|太|一下|就是|这个|那个|一个|一些|如果|因为|所以|真的|还是会|开始|时候|请|继续|一点|出来的|别人|自己|过|了|的|得|地|吗|呢|啊|吧)/gu, ' ')
        .split(/\s+/u)
        .map((item) => item.trim())
        .filter(Boolean);
    const terms = [];

    compactSegment.forEach((item) => {
        if (item.length <= 4) {
            terms.push(item);
            return;
        }

        for (let size = 2; size <= 3; size += 1) {
            for (let index = 0; index <= item.length - size; index += 1) {
                terms.push(item.slice(index, index + size));
            }
        }
    });

    return Array.from(new Set(terms.filter((item) => item.length >= 2))).slice(0, maxItems);
}

function extractQueryTerms(queryText, maxItems = 8) {
    const normalized = String(queryText || '').trim().toLowerCase();
    if (!normalized) {
        return [];
    }

    const lexicalTerms = normalized
        .split(/[^\p{L}\p{N}_-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2);
    const cjkTerms = normalized
        .split(/[^\p{Script=Han}\p{L}\p{N}_-]+/u)
        .flatMap((segment) => extractCjkTerms(segment, maxItems));

    return Array.from(new Set([
        ...lexicalTerms,
        ...cjkTerms
    ])).slice(0, maxItems);
}

function loadFixture(fixtureName = 'baseline') {
    const normalizedName = fixtureName.endsWith('.json') ? fixtureName : `${fixtureName}.json`;
    const fixturePath = path.resolve(__dirname, '..', 'tests', 'fixtures', 'memory-recall-eval', normalizedName);

    if (!fs.existsSync(fixturePath)) {
        throw new Error(`未找到评估样本: ${fixturePath}`);
    }

    return {
        fixturePath,
        fixture: JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    };
}

function round(value) {
    return Number(Number(value || 0).toFixed(3));
}

async function createFixtureDataset(fixture) {
    const runId = Date.now();
    const memoryEventService = new MemoryEventService();
    const usersByLabel = new Map();
    const cleanupUserIds = [];

    for (const [index, userFixture] of fixture.users.entries()) {
        const telegramId = (runId * 10) + Number(userFixture.telegram_id_seed || (index + 1));
        const username = `${userFixture.username}_${runId}`;
        const user = await User.create({
            telegram_id: telegramId,
            username
        });

        usersByLabel.set(userFixture.label, user);
        cleanupUserIds.push(user.id);

        await memoryEventService.saveCandidates({
            userId: user.id,
            metadata: {
                source: 'tools/evaluate-memory-recall',
                fixture_name: fixture.name
            },
            candidates: userFixture.events.map((event) => ({
                ...event,
                metadata: {
                    fixture_id: event.fixture_id,
                    fixture_user_label: userFixture.label
                }
            }))
        });
    }

    return {
        usersByLabel,
        cleanupUserIds
    };
}

async function cleanupFixtureDataset(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return;
    }

    await db.query('DELETE FROM memory_events WHERE user_id = ANY($1::uuid[])', [userIds]);
    await db.query('DELETE FROM messages WHERE user_id = ANY($1::uuid[])', [userIds]);
    await db.query('DELETE FROM profiles WHERE user_id = ANY($1::uuid[])', [userIds]);
    await db.query('DELETE FROM knowledge_chunks WHERE user_id = ANY($1::uuid[])', [userIds]);
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
}

async function evaluateCase({ caseItem, retrievalService, usersByLabel }) {
    const user = usersByLabel.get(caseItem.user_label);
    if (!user) {
        throw new Error(`未找到样本用户: ${caseItem.user_label}`);
    }

    const queryEmbedding = await retrievalService.buildQueryEmbedding(caseItem.query);
    const queryTerms = extractQueryTerms(caseItem.query);
    const rawRows = await retrievalService.model.searchHybrid({
        userId: user.id,
        queryText: caseItem.query,
        queryEmbedding,
        queryTerms,
        limit: retrievalService.getCandidateLimit(caseItem.limit || 5),
        vectorWeight: queryEmbedding ? 0.7 : 0,
        keywordWeight: queryEmbedding ? 0.3 : 1,
        minScore: queryEmbedding ? 0.15 : 0.2
    });
    const rerankedRows = retrievalService.rerankEvents(rawRows, {
        queryText: caseItem.query,
        limit: caseItem.limit || 5
    });

    const expectedIds = new Set(caseItem.expected_event_fixture_ids || []);
    const rawTopFixtureId = rawRows[0]?.metadata?.fixture_id || null;
    const rerankedTopFixtureId = rerankedRows[0]?.metadata?.fixture_id || null;
    const hits = rerankedRows
        .map((row) => row?.metadata?.fixture_id || null)
        .filter((fixtureId) => expectedIds.has(fixtureId));
    const wrongUserResults = rerankedRows.filter((row) => row.user_id !== user.id);
    const topHit = caseItem.expected_top_event_fixture_id
        ? rerankedTopFixtureId === caseItem.expected_top_event_fixture_id
        : hits.length > 0;

    return {
        id: caseItem.id,
        query: caseItem.query,
        limit: caseItem.limit || 5,
        expected_event_fixture_ids: caseItem.expected_event_fixture_ids || [],
        expected_top_event_fixture_id: caseItem.expected_top_event_fixture_id || null,
        raw_top_fixture_id: rawTopFixtureId,
        reranked_top_fixture_id: rerankedTopFixtureId,
        ranking_changed: rawTopFixtureId !== rerankedTopFixtureId,
        hits,
        expected_hit: hits.length > 0,
        top_hit: topHit,
        precision_at_k: round(hits.length / Math.max(1, caseItem.limit || 5)),
        user_isolation_pass: wrongUserResults.length === 0,
        results: rerankedRows.map((row) => ({
            fixture_id: row?.metadata?.fixture_id || null,
            id: row.id,
            title: row.title,
            event_type: row.event_type,
            final_score: row.final_score,
            rerank_score: row.rerank_score,
            recency_score: row.recency_score,
            event_type_boost: row.event_type_boost,
            user_id: row.user_id,
            memory_ranking_version: row.memory_ranking_version
        }))
    };
}

function buildSummaryReport(fixture, results = []) {
    const totalCases = results.length || 1;
    const expectedHitCount = results.filter((item) => item.expected_hit).length;
    const topHitCount = results.filter((item) => item.top_hit).length;
    const isolationPassCount = results.filter((item) => item.user_isolation_pass).length;
    const rankingChangedCases = results.filter((item) => item.ranking_changed).length;
    const avgPrecisionAtK = round(
        results.reduce((sum, item) => sum + item.precision_at_k, 0) / totalCases
    );

    return {
        fixture_name: fixture.name,
        total_cases: results.length,
        expected_hit_rate_at_k: round(expectedHitCount / totalCases),
        top1_hit_rate: round(topHitCount / totalCases),
        precision_at_k: avgPrecisionAtK,
        user_isolation_pass_rate: round(isolationPassCount / totalCases),
        ranking_changed_case_rate: round(rankingChangedCases / totalCases),
        ranking_version: MemoryRetrievalService.RANKING_VERSION,
        unsupported_metrics: {
            prompt_injection_rate: null,
            memory_utilization_rate: null
        }
    };
}

async function runEvaluateMemoryRecall() {
    const args = parseArgs(process.argv.slice(2));
    const { fixturePath, fixture } = loadFixture(args.fixture || 'baseline');
    const retrievalService = new MemoryRetrievalService();
    const dataset = await createFixtureDataset(fixture);

    try {
        const results = [];

        for (const caseItem of fixture.cases || []) {
            results.push(await evaluateCase({
                caseItem,
                retrievalService,
                usersByLabel: dataset.usersByLabel
            }));
        }

        const summary = buildSummaryReport(fixture, results);
        const output = {
            fixture_path: fixturePath,
            summary,
            cases: results
        };

        if (args.json === '1' || args.json === 'true') {
            console.log(JSON.stringify(output, null, 2));
            return output;
        }

        console.log(`📘 Fixture: ${fixture.name}`);
        console.log(`📂 Path: ${fixturePath}`);
        console.log(`🧠 Ranking Version: ${summary.ranking_version}`);
        console.log(`✅ expected_hit_rate@k: ${summary.expected_hit_rate_at_k}`);
        console.log(`🥇 top1_hit_rate: ${summary.top1_hit_rate}`);
        console.log(`🎯 precision@k: ${summary.precision_at_k}`);
        console.log(`🔒 user_isolation_pass_rate: ${summary.user_isolation_pass_rate}`);
        console.log(`🔀 ranking_changed_case_rate: ${summary.ranking_changed_case_rate}`);
        console.log('');

        results.forEach((item) => {
            const lines = [
                `- ${item.id}`,
                `  query: ${item.query}`,
                `  raw_top: ${item.raw_top_fixture_id || '-'}`,
                `  reranked_top: ${item.reranked_top_fixture_id || '-'}`,
                `  expected: ${item.expected_event_fixture_ids.join(', ') || '-'}`,
                `  hits: ${item.hits.join(', ') || '-'}`,
                `  isolation: ${item.user_isolation_pass ? 'pass' : 'fail'}`
            ];

            console.log(lines.join('\n'));
        });

        return output;
    } finally {
        await cleanupFixtureDataset(dataset.cleanupUserIds);
    }
}

if (require.main === module) {
    runEvaluateMemoryRecall()
        .then(async () => {
            await db.close();
            process.exit(0);
        })
        .catch(async (error) => {
            console.error('❌ memory recall 评估失败:', error.message);
            await db.close();
            process.exit(1);
        });
}

module.exports = { runEvaluateMemoryRecall };
