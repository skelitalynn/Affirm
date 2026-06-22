#!/usr/bin/env node
const config = require('../src/config');
const AIService = require('../src/services/ai');
const MemoryEventService = require('../src/services/memory-event-service');
const MemoryRetrievalService = require('../src/services/memory-retrieval-service');
const Profile = require('../src/models/profile');
const {
    buildAssistantMessageMetadata
} = require('../src/services/conversation-trace');
const {
    arraysIncludeEvery,
    cleanupUserDataset,
    createSyntheticUser,
    getPatternMatches,
    includesPattern,
    loadFixture,
    parseArgs,
    round,
    toSummaryRate
} = require('./eval-helpers');

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

async function createFixtureDataset(fixture) {
    const runId = Date.now();
    const memoryEventService = new MemoryEventService();
    const usersByLabel = new Map();
    const fixtureEventsById = new Map();
    const cleanupUserIds = [];

    for (const [index, userFixture] of toArray(fixture.users).entries()) {
        const syntheticUser = await createSyntheticUser({
            label: userFixture.label || `user_${index + 1}`,
            usernamePrefix: userFixture.username || 'memory_utilization_eval',
            telegramIdSeed: Number(userFixture.telegram_id_seed || (940000 + index)),
            runId,
            index: index + 1
        });

        cleanupUserIds.push(syntheticUser.id);
        usersByLabel.set(userFixture.label, {
            ...syntheticUser,
            fixture: userFixture
        });

        await Profile.findOrCreate(syntheticUser.id, {
            goals: userFixture.profile?.goals || '',
            status: userFixture.profile?.status || 'active',
            preferences: userFixture.profile?.preferences || Profile.buildDefaultMemory()
        });

        const createdEvents = await memoryEventService.saveCandidates({
            userId: syntheticUser.id,
            metadata: {
                source: 'tools/evaluate-memory-utilization',
                fixture_name: fixture.name,
                fixture_user_label: userFixture.label
            },
            candidates: toArray(userFixture.events).map((event) => ({
                ...event,
                metadata: {
                    fixture_id: event.fixture_id,
                    fixture_user_label: userFixture.label
                }
            }))
        });

        createdEvents.forEach((event) => {
            const fixtureId = event?.metadata?.fixture_id;
            if (fixtureId) {
                fixtureEventsById.set(fixtureId, event);
            }
        });
    }

    return {
        cleanupUserIds,
        fixtureEventsById,
        usersByLabel
    };
}

async function maybeInitializeAiService(args) {
    const aiService = new AIService(config.ai);
    const liveAiRequested = args.live_ai === '1' || args.live_ai === 'true';

    if (!liveAiRequested) {
        return {
            aiService,
            liveAiEnabled: false
        };
    }

    const initialized = await aiService.initialize().catch(() => false);
    return {
        aiService,
        liveAiEnabled: Boolean(initialized && aiService.isAvailable())
    };
}

function deriveFallbackPatterns(expectedFixtureIds = [], fixtureEventsById) {
    const patterns = [];

    expectedFixtureIds.forEach((fixtureId) => {
        const event = fixtureEventsById.get(fixtureId);
        if (!event) {
            return;
        }

        patterns.push(event.title);
        toArray(event.keywords).slice(0, 3).forEach((keyword) => patterns.push(keyword));
        const summaryFragments = String(event.summary || '')
            .split(/[，。；;,.!?！？]/u)
            .map((fragment) => fragment.trim())
            .filter((fragment) => fragment.length >= 2)
            .slice(0, 2);
        summaryFragments.forEach((fragment) => patterns.push(fragment));
    });

    return Array.from(new Set(patterns.filter(Boolean)));
}

async function evaluateCase({ caseItem, dataset, aiRuntime }) {
    const userEntry = dataset.usersByLabel.get(caseItem.user_label);
    if (!userEntry) {
        throw new Error(`未找到样本用户: ${caseItem.user_label}`);
    }

    const profile = await Profile.findOrCreate(userEntry.id, {
        goals: userEntry.fixture.profile?.goals || '',
        status: userEntry.fixture.profile?.status || 'active',
        preferences: userEntry.fixture.profile?.preferences || Profile.buildDefaultMemory()
    });
    const retrievalService = new MemoryRetrievalService();
    const recalledMemoryEvents = await retrievalService.searchRelevantEvents({
        userId: userEntry.id,
        queryText: caseItem.query,
        limit: caseItem.limit || 5
    });
    const recalledMemoryBlock = retrievalService.buildPromptBlock(recalledMemoryEvents, caseItem.limit || 5);
    const context = {
        user: {
            id: userEntry.id,
            username: userEntry.username,
            telegram_id: userEntry.telegram_id
        },
        userMessage: caseItem.query,
        profileMemory: Profile.buildMemoryBlock(profile),
        recentMessages: toArray(caseItem.recent_messages),
        recalledMemoryEvents,
        recalledMemoryBlock,
        relevantKnowledge: toArray(caseItem.relevant_knowledge)
    };

    let assistantResponse = String(caseItem.assistant_response || '');
    let responseMode = 'fixture';

    if (aiRuntime.liveAiEnabled) {
        const generated = await aiRuntime.aiService.generateResponse(context);
        if (generated && String(generated).trim()) {
            assistantResponse = String(generated).trim();
            responseMode = 'live-ai';
        }
    }

    const assistantMetadata = buildAssistantMessageMetadata({
        traceId: `eval-memory-utilization-${Date.now()}-${caseItem.id || 'case'}`,
        context,
        aiService: aiRuntime.aiService
    });
    const recalledFixtureIds = recalledMemoryEvents
        .map((event) => event?.metadata?.fixture_id || null)
        .filter(Boolean);
    const expectedFixtureIds = toArray(caseItem.expected_event_fixture_ids);
    const retrievalSupportPass = expectedFixtureIds.length === 0
        ? recalledFixtureIds.length === 0
        : arraysIncludeEvery(recalledFixtureIds, expectedFixtureIds);
    const promptInjectionPass = Boolean(assistantMetadata?.generation?.recalled_memory_in_prompt)
        === Boolean(recalledMemoryEvents.length > 0);
    const expectedPatterns = toArray(caseItem.expected_response_patterns);
    const fallbackPatterns = expectedPatterns.length > 0
        ? expectedPatterns
        : deriveFallbackPatterns(expectedFixtureIds, dataset.fixtureEventsById);
    const matchedPatterns = getPatternMatches(assistantResponse, fallbackPatterns);
    const memoryUtilizationPass = fallbackPatterns.length === 0
        ? true
        : matchedPatterns.length > 0;
    const disallowedMatches = getPatternMatches(assistantResponse, caseItem.disallowed_response_patterns);
    const disallowedReferencePass = disallowedMatches.length === 0;
    const overallPass = (
        retrievalSupportPass
        && promptInjectionPass
        && memoryUtilizationPass
        && disallowedReferencePass
    );

    return {
        id: caseItem.id || 'case',
        response_mode: responseMode,
        recalled_fixture_ids: recalledFixtureIds,
        retrieval_support_pass: retrievalSupportPass,
        prompt_injection_pass: promptInjectionPass,
        memory_utilization_pass: memoryUtilizationPass,
        matched_patterns: matchedPatterns,
        disallowed_reference_pass: disallowedReferencePass,
        disallowed_matches: disallowedMatches,
        assistant_response: assistantResponse,
        overall_pass: overallPass
    };
}

function buildSummaryReport(fixture, results = []) {
    return {
        fixture_name: fixture.name,
        total_cases: results.length,
        retrieval_support_rate: toSummaryRate(results, 'retrieval_support_pass'),
        prompt_injection_rate: toSummaryRate(results, 'prompt_injection_pass'),
        memory_utilization_rate: toSummaryRate(results, 'memory_utilization_pass'),
        disallowed_reference_pass_rate: toSummaryRate(results, 'disallowed_reference_pass'),
        overall_pass_rate: toSummaryRate(results, 'overall_pass')
    };
}

async function runEvaluateMemoryUtilization() {
    const args = parseArgs(process.argv.slice(2));
    const { fixturePath, fixture } = loadFixture('memory-utilization-eval', args.fixture || 'baseline');
    const dataset = await createFixtureDataset(fixture);
    const aiRuntime = await maybeInitializeAiService(args);

    try {
        const results = [];

        for (const caseItem of toArray(fixture.cases)) {
            results.push(await evaluateCase({ caseItem, dataset, aiRuntime }));
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
        console.log(`🧠 Retrieval Support Rate: ${round(summary.retrieval_support_rate * 100, 1)}%`);
        console.log(`🧩 Prompt Injection Rate: ${round(summary.prompt_injection_rate * 100, 1)}%`);
        console.log(`🗣️ Memory Utilization Rate: ${round(summary.memory_utilization_rate * 100, 1)}%`);
        console.log(`🛡️ Disallowed Reference Pass Rate: ${round(summary.disallowed_reference_pass_rate * 100, 1)}%`);
        console.log(`✅ Overall Pass Rate: ${round(summary.overall_pass_rate * 100, 1)}%`);
        console.log('');

        results.forEach((item) => {
            console.log(`- ${item.id}: ${item.overall_pass ? 'PASS' : 'FAIL'} [${item.response_mode}]`);
            console.log(`  recalled=${item.recalled_fixture_ids.join(', ') || '-'} matched=${item.matched_patterns.join(', ') || '-'}`);
        });

        return output;
    } finally {
        await cleanupUserDataset(dataset.cleanupUserIds);
    }
}

runEvaluateMemoryUtilization().catch((error) => {
    console.error(`❌ memory utilization eval 执行失败: ${error.message}`);
    process.exit(1);
});
