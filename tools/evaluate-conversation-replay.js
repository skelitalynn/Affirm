#!/usr/bin/env node
const config = require('../src/config');
const AIService = require('../src/services/ai');
const Message = require('../src/models/message');
const MemoryEventService = require('../src/services/memory-event-service');
const MemoryRetrievalService = require('../src/services/memory-retrieval-service');
const Profile = require('../src/models/profile');
const TelegramService = require('../src/services/telegram');
const {
    buildAssistantMessageMetadata,
    buildUserMessageMetadata,
    createTraceId
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

function deriveFallbackPatterns(expectedEvents = []) {
    const patterns = [];

    expectedEvents.forEach((event) => {
        if (!event) {
            return;
        }

        patterns.push(event.title);
        toArray(event.keywords).slice(0, 3).forEach((keyword) => patterns.push(keyword));
        String(event.summary || '')
            .split(/[，。；;,.!?！？]/u)
            .map((fragment) => fragment.trim())
            .filter((fragment) => fragment.length >= 2)
            .slice(0, 2)
            .forEach((fragment) => patterns.push(fragment));
    });

    return Array.from(new Set(patterns.filter(Boolean)));
}

async function seedRecentMessages(userId, messages = []) {
    for (const item of toArray(messages)) {
        await Message.create({
            user_id: userId,
            role: item.role,
            content: String(item.content || ''),
            metadata: {
                source: 'tools/evaluate-conversation-replay'
            }
        });
    }
}

async function evaluateCase({ caseItem, runId, index, aiRuntime }) {
    const syntheticUser = await createSyntheticUser({
        label: caseItem.id || `case_${index + 1}`,
        usernamePrefix: caseItem.username || 'conversation_replay_eval',
        telegramIdSeed: Number(caseItem.telegram_id_seed || (950000 + index)),
        runId,
        index: index + 1
    });
    const profile = await Profile.findOrCreate(syntheticUser.id, {
        goals: caseItem.profile?.goals || '',
        status: caseItem.profile?.status || 'active',
        preferences: caseItem.profile?.preferences || Profile.buildDefaultMemory()
    });
    const memoryEventService = new MemoryEventService();
    const createdEvents = await memoryEventService.saveCandidates({
        userId: syntheticUser.id,
        metadata: {
            source: 'tools/evaluate-conversation-replay',
            fixture_case_id: caseItem.id || null
        },
        candidates: toArray(caseItem.memory_events).map((event) => ({
            ...event,
            metadata: {
                fixture_id: event.fixture_id
            }
        }))
    });
    const fixtureEventsById = new Map(createdEvents.map((event) => [event?.metadata?.fixture_id, event]));

    await seedRecentMessages(syntheticUser.id, caseItem.recent_messages);

    const traceId = createTraceId();
    const savedUserMessage = await Message.create({
        user_id: syntheticUser.id,
        role: 'user',
        content: String(caseItem.user_message || ''),
        metadata: buildUserMessageMetadata({
            traceId,
            username: syntheticUser.username
        })
    });

    const telegramService = new TelegramService(config);
    telegramService.memoryRetrievalService = new MemoryRetrievalService();
    telegramService.aiService = aiRuntime.aiService;

    const conversationContext = await telegramService.loadConversationContext(
        syntheticUser,
        syntheticUser.username,
        syntheticUser.telegram_id,
        String(caseItem.user_message || ''),
        savedUserMessage.id
    );

    if (Array.isArray(caseItem.relevant_knowledge_override)) {
        conversationContext.relevantKnowledge = caseItem.relevant_knowledge_override;
    }

    const context = {
        user: {
            id: syntheticUser.id,
            username: syntheticUser.username,
            telegram_id: syntheticUser.telegram_id
        },
        userMessage: String(caseItem.user_message || ''),
        traceId,
        profileMemory: conversationContext.profileMemory,
        recentMessages: conversationContext.recentMessages,
        recalledMemoryEvents: conversationContext.recalledMemoryEvents,
        recalledMemoryBlock: conversationContext.recalledMemoryBlock,
        relevantKnowledge: conversationContext.relevantKnowledge
    };
    const preparedMessages = aiRuntime.aiService.prepareMessages(context);

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
        traceId,
        context,
        aiService: aiRuntime.aiService
    });
    const recalledFixtureIds = conversationContext.recalledMemoryEvents
        .map((event) => event?.metadata?.fixture_id || null)
        .filter(Boolean);
    const expectedFixtureIds = toArray(caseItem.expected_event_fixture_ids);
    const expectedEvents = expectedFixtureIds
        .map((fixtureId) => fixtureEventsById.get(fixtureId))
        .filter(Boolean);
    const recallPass = expectedFixtureIds.length === 0
        ? recalledFixtureIds.length === 0
        : arraysIncludeEvery(recalledFixtureIds, expectedFixtureIds);
    const promptText = preparedMessages.map((message) => message.content).join('\n\n');
    const promptInjectionPass = expectedEvents.every((event) => (
        promptText.includes(String(event.title || ''))
        || promptText.includes(String(event.summary || ''))
    )) && Boolean(assistantMetadata?.generation?.recalled_memory_in_prompt)
        === Boolean(conversationContext.recalledMemoryEvents.length > 0);
    const expectedPatterns = toArray(caseItem.expected_response_patterns);
    const fallbackPatterns = expectedPatterns.length > 0
        ? expectedPatterns
        : deriveFallbackPatterns(expectedEvents);
    const matchedPatterns = getPatternMatches(assistantResponse, fallbackPatterns);
    const utilizationPass = fallbackPatterns.length === 0
        ? true
        : matchedPatterns.length > 0;
    const disallowedMatches = getPatternMatches(assistantResponse, caseItem.disallowed_response_patterns);
    const tracePass = (
        assistantMetadata?.generation?.recalled_memory_count === conversationContext.recalledMemoryEvents.length
        && assistantMetadata?.memory_refs?.length === Math.min(conversationContext.recalledMemoryEvents.length, 5)
        && (
            conversationContext.recalledMemoryEvents.length === 0
                ? true
                : Boolean(assistantMetadata?.generation?.memory_ranking_version)
        )
    );
    const overallPass = (
        recallPass
        && promptInjectionPass
        && utilizationPass
        && tracePass
        && disallowedMatches.length === 0
    );

    return {
        id: caseItem.id || `case_${index + 1}`,
        user_id: syntheticUser.id,
        response_mode: responseMode,
        recalled_fixture_ids: recalledFixtureIds,
        recall_pass: recallPass,
        prompt_injection_pass: promptInjectionPass,
        utilization_pass: utilizationPass,
        trace_pass: tracePass,
        matched_patterns: matchedPatterns,
        disallowed_matches: disallowedMatches,
        assistant_response: assistantResponse,
        overall_pass: overallPass
    };
}

function buildSummaryReport(fixture, results = []) {
    return {
        fixture_name: fixture.name,
        total_cases: results.length,
        recall_pass_rate: toSummaryRate(results, 'recall_pass'),
        prompt_injection_pass_rate: toSummaryRate(results, 'prompt_injection_pass'),
        memory_utilization_rate: toSummaryRate(results, 'utilization_pass'),
        trace_pass_rate: toSummaryRate(results, 'trace_pass'),
        overall_pass_rate: toSummaryRate(results, 'overall_pass')
    };
}

async function runEvaluateConversationReplay() {
    const args = parseArgs(process.argv.slice(2));
    const { fixturePath, fixture } = loadFixture('conversation-replay-eval', args.fixture || 'baseline');
    const runId = Date.now();
    const aiRuntime = await maybeInitializeAiService(args);
    const cleanupUserIds = [];

    try {
        const results = [];

        for (const [index, caseItem] of toArray(fixture.cases).entries()) {
            const caseResult = await evaluateCase({ caseItem, runId, index, aiRuntime });
            cleanupUserIds.push(caseResult.user_id);
            results.push(caseResult);
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
        console.log(`🧠 Recall Pass Rate: ${round(summary.recall_pass_rate * 100, 1)}%`);
        console.log(`🧩 Prompt Injection Pass Rate: ${round(summary.prompt_injection_pass_rate * 100, 1)}%`);
        console.log(`🗣️ Memory Utilization Rate: ${round(summary.memory_utilization_rate * 100, 1)}%`);
        console.log(`🧭 Trace Pass Rate: ${round(summary.trace_pass_rate * 100, 1)}%`);
        console.log(`✅ Overall Pass Rate: ${round(summary.overall_pass_rate * 100, 1)}%`);
        console.log('');

        results.forEach((item) => {
            console.log(`- ${item.id}: ${item.overall_pass ? 'PASS' : 'FAIL'} [${item.response_mode}]`);
            console.log(`  recalled=${item.recalled_fixture_ids.join(', ') || '-'} matched=${item.matched_patterns.join(', ') || '-'}`);
        });

        return output;
    } finally {
        await cleanupUserDataset(cleanupUserIds);
    }
}

runEvaluateConversationReplay().catch((error) => {
    console.error(`❌ conversation replay eval 执行失败: ${error.message}`);
    process.exit(1);
});
