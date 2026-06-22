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
            usernamePrefix: userFixture.username || 'memory_injection_eval',
            telegramIdSeed: Number(userFixture.telegram_id_seed || (930000 + index)),
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
                source: 'tools/evaluate-memory-injection',
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

function findMessageIndex(messages = [], role, content) {
    return messages.findIndex((message) => message.role === role && message.content === content);
}

function collectRecentMessageIndices(messages = [], recentMessages = []) {
    return toArray(recentMessages)
        .map((message) => findMessageIndex(messages, message.role, message.content))
        .filter((index) => index >= 0);
}

function buildPromptOrderPass(preparedMessages = [], context = {}) {
    const profileIndex = preparedMessages.findIndex((message) => (
        message.role === 'system'
        && String(message.content || '').includes('用户稳定记忆')
    ));
    const recalledIndex = preparedMessages.findIndex((message) => (
        message.role === 'system'
        && String(message.content || '').includes('与当前问题可能相关的历史事件')
    ));
    const knowledgeIndex = preparedMessages.findIndex((message) => (
        message.role === 'system'
        && String(message.content || '').includes('相关知识背景')
    ));
    const recentIndices = collectRecentMessageIndices(preparedMessages, context.recentMessages);
    const firstRecentIndex = recentIndices.length > 0 ? Math.min(...recentIndices) : -1;
    const lastRecentIndex = recentIndices.length > 0 ? Math.max(...recentIndices) : -1;
    const finalUserIndex = findMessageIndex(preparedMessages, 'user', context.userMessage);
    const hasRecalled = toArray(context.recalledMemoryEvents).length > 0;
    const hasKnowledge = toArray(context.relevantKnowledge).length > 0;

    const passes = [];

    if (profileIndex >= 0 && hasRecalled) {
        passes.push(profileIndex < recalledIndex);
    }

    if (hasRecalled && firstRecentIndex >= 0) {
        passes.push(recalledIndex >= 0 && recalledIndex < firstRecentIndex);
    }

    if (hasKnowledge && knowledgeIndex >= 0 && lastRecentIndex >= 0) {
        passes.push(lastRecentIndex < knowledgeIndex);
    }

    if (hasKnowledge && knowledgeIndex >= 0 && firstRecentIndex === -1 && hasRecalled) {
        passes.push(recalledIndex < knowledgeIndex);
    }

    passes.push(finalUserIndex === preparedMessages.length - 1);

    return passes.every(Boolean);
}

async function evaluateCase({ caseItem, dataset }) {
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
    const aiService = new AIService(config.ai);
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
    const preparedMessages = aiService.prepareMessages(context);
    const assistantMetadata = buildAssistantMessageMetadata({
        traceId: `eval-memory-injection-${Date.now()}-${caseItem.id || 'case'}`,
        context,
        aiService
    });
    const recalledFixtureIds = recalledMemoryEvents
        .map((event) => event?.metadata?.fixture_id || null)
        .filter(Boolean);
    const promptText = preparedMessages.map((message) => message.content).join('\n\n');
    const expectedFixtureIds = toArray(caseItem.expected_event_fixture_ids);
    const disallowedFixtureIds = toArray(caseItem.disallowed_event_fixture_ids);
    const expectedRecallPass = expectedFixtureIds.length === 0
        ? recalledFixtureIds.length === 0
        : arraysIncludeEvery(recalledFixtureIds, expectedFixtureIds);
    const promptContainsExpected = expectedFixtureIds.every((fixtureId) => {
        const event = dataset.fixtureEventsById.get(fixtureId);
        return event
            ? (
                promptText.includes(String(event.title || ''))
                || promptText.includes(String(event.summary || ''))
            )
            : false;
    });
    const disallowedLeakPass = disallowedFixtureIds.every((fixtureId) => {
        const event = dataset.fixtureEventsById.get(fixtureId);
        const leakedInRecall = recalledFixtureIds.includes(fixtureId);
        const leakedInPrompt = event
            ? (
                promptText.includes(String(event.title || ''))
                || promptText.includes(String(event.summary || ''))
            )
            : false;
        return !leakedInRecall && !leakedInPrompt;
    });
    const promptCountPass = caseItem.expected_max_recalled_count === undefined
        ? true
        : recalledMemoryEvents.length <= Number(caseItem.expected_max_recalled_count);
    const promptOrderPass = buildPromptOrderPass(preparedMessages, context);
    const metadataTracePass = (
        assistantMetadata?.generation?.recalled_memory_count === recalledMemoryEvents.length
        && Boolean(assistantMetadata?.generation?.recalled_memory_in_prompt) === Boolean(recalledMemoryBlock)
        && assistantMetadata?.memory_refs?.length === Math.min(recalledMemoryEvents.length, 5)
        && (
            recalledMemoryEvents.length === 0
                ? true
                : Boolean(assistantMetadata?.generation?.memory_ranking_version)
        )
    );
    const promptInjectionPass = expectedRecallPass
        && promptContainsExpected
        && Boolean(assistantMetadata?.generation?.recalled_memory_in_prompt) === Boolean(recalledMemoryEvents.length > 0);
    const overallPass = (
        promptInjectionPass
        && disallowedLeakPass
        && promptCountPass
        && promptOrderPass
        && metadataTracePass
    );

    return {
        id: caseItem.id || 'case',
        recalled_fixture_ids: recalledFixtureIds,
        recalled_count: recalledMemoryEvents.length,
        prompt_injection_pass: promptInjectionPass,
        disallowed_injection_pass: disallowedLeakPass,
        prompt_count_pass: promptCountPass,
        prompt_order_pass: promptOrderPass,
        metadata_trace_pass: metadataTracePass,
        memory_ranking_version: assistantMetadata?.generation?.memory_ranking_version || null,
        overall_pass: overallPass
    };
}

function buildSummaryReport(fixture, results = []) {
    return {
        fixture_name: fixture.name,
        total_cases: results.length,
        prompt_injection_rate: toSummaryRate(results, 'prompt_injection_pass'),
        disallowed_injection_pass_rate: toSummaryRate(results, 'disallowed_injection_pass'),
        prompt_order_pass_rate: toSummaryRate(results, 'prompt_order_pass'),
        metadata_trace_pass_rate: toSummaryRate(results, 'metadata_trace_pass'),
        overall_pass_rate: toSummaryRate(results, 'overall_pass')
    };
}

async function runEvaluateMemoryInjection() {
    const args = parseArgs(process.argv.slice(2));
    const { fixturePath, fixture } = loadFixture('memory-injection-eval', args.fixture || 'baseline');
    const dataset = await createFixtureDataset(fixture);

    try {
        const results = [];

        for (const caseItem of toArray(fixture.cases)) {
            results.push(await evaluateCase({ caseItem, dataset }));
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
        console.log(`🧩 Prompt Injection Rate: ${round(summary.prompt_injection_rate * 100, 1)}%`);
        console.log(`🛡️ Disallowed Injection Pass Rate: ${round(summary.disallowed_injection_pass_rate * 100, 1)}%`);
        console.log(`📐 Prompt Order Pass Rate: ${round(summary.prompt_order_pass_rate * 100, 1)}%`);
        console.log(`🧭 Metadata Trace Pass Rate: ${round(summary.metadata_trace_pass_rate * 100, 1)}%`);
        console.log(`✅ Overall Pass Rate: ${round(summary.overall_pass_rate * 100, 1)}%`);
        console.log('');

        results.forEach((item) => {
            console.log(`- ${item.id}: ${item.overall_pass ? 'PASS' : 'FAIL'}`);
            console.log(`  recalled=${item.recalled_fixture_ids.join(', ') || '-'} ranking=${item.memory_ranking_version || '-'}`);
        });

        return output;
    } finally {
        await cleanupUserDataset(dataset.cleanupUserIds);
    }
}

runEvaluateMemoryInjection().catch((error) => {
    console.error(`❌ prompt injection eval 执行失败: ${error.message}`);
    process.exit(1);
});
