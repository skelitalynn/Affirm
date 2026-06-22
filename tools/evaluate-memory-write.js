#!/usr/bin/env node
const Message = require('../src/models/message');
const MemoryEvent = require('../src/models/memory-event');
const MemoryService = require('../src/services/memory-service');
const Profile = require('../src/models/profile');
const { db } = require('../src/db/connection');
const {
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

function buildStubAiService(mockArtifacts = {}) {
    return {
        client: {},
        async generateMemoryArtifacts() {
            return mockArtifacts;
        }
    };
}

async function loadLatestMemoryUpdateJob(userId) {
    const result = await db.query(`
        SELECT *
        FROM sync_jobs
        WHERE job_type = 'memory_update'
          AND details->>'user_id' = $1
        ORDER BY created_at DESC
        LIMIT 1
    `, [String(userId || '').trim()]);

    return result.rows[0] || null;
}

function collectProfileMisses(result, updatedProfile, expectedProfile = {}) {
    const misses = [];
    const normalizedExpected = expectedProfile && typeof expectedProfile === 'object' ? expectedProfile : {};
    const normalizedMemory = Profile.normalizeMemory(updatedProfile?.preferences);

    if (typeof normalizedExpected.should_update === 'boolean'
        && Boolean(result?.profile) !== normalizedExpected.should_update) {
        misses.push(`profile.should_update expected=${normalizedExpected.should_update}`);
    }

    if (normalizedExpected.goals_equals !== undefined
        && String(updatedProfile?.goals || '') !== String(normalizedExpected.goals_equals || '')) {
        misses.push(`profile.goals expected=${normalizedExpected.goals_equals}`);
    }

    if (normalizedExpected.status_equals !== undefined
        && String(updatedProfile?.status || '') !== String(normalizedExpected.status_equals || '')) {
        misses.push(`profile.status expected=${normalizedExpected.status_equals}`);
    }

    toArray(normalizedExpected.summary_contains).forEach((pattern) => {
        if (!includesPattern(normalizedMemory.summary, pattern)) {
            misses.push(`profile.summary missing=${pattern}`);
        }
    });

    toArray(normalizedExpected.facts_contains).forEach((pattern) => {
        const hasPattern = normalizedMemory.facts.some((item) => includesPattern(item, pattern));
        if (!hasPattern) {
            misses.push(`profile.facts missing=${pattern}`);
        }
    });

    toArray(normalizedExpected.communication_preferences_contains).forEach((pattern) => {
        const hasPattern = normalizedMemory.communication_preferences.some((item) => includesPattern(item, pattern));
        if (!hasPattern) {
            misses.push(`profile.communication_preferences missing=${pattern}`);
        }
    });

    toArray(normalizedExpected.open_loops_contains).forEach((pattern) => {
        const hasPattern = normalizedMemory.open_loops.some((item) => includesPattern(item, pattern));
        if (!hasPattern) {
            misses.push(`profile.open_loops missing=${pattern}`);
        }
    });

    return misses;
}

function matchesEventExpectation(event, expectation = {}) {
    if (!event || typeof event !== 'object') {
        return false;
    }

    if (expectation.event_type && event.event_type !== expectation.event_type) {
        return false;
    }

    if (expectation.status_equals && String(event.status || '') !== String(expectation.status_equals || '')) {
        return false;
    }

    if (expectation.title_contains && !includesPattern(event.title, expectation.title_contains)) {
        return false;
    }

    if (expectation.summary_contains && !includesPattern(event.summary, expectation.summary_contains)) {
        return false;
    }

    return true;
}

function collectEventChecks(events = [], expectations = []) {
    return toArray(expectations).map((expectation) => {
        const matched = events.find((event) => matchesEventExpectation(event, expectation)) || null;
        return {
            expectation,
            matched: Boolean(matched),
            matched_event_id: matched?.id || null,
            matched_title: matched?.title || null
        };
    });
}

async function evaluateCase({ caseItem, runId, index }) {
    const syntheticUser = await createSyntheticUser({
        label: caseItem.id || `case_${index + 1}`,
        usernamePrefix: 'memory_write_eval',
        telegramIdSeed: Number(caseItem.telegram_id_seed || (920000 + index)),
        runId,
        index: index + 1
    });

    const initialProfile = await Profile.findOrCreate(syntheticUser.id, {
        goals: caseItem.initial_profile?.goals || '',
        status: caseItem.initial_profile?.status || 'active',
        preferences: caseItem.initial_profile?.preferences || Profile.buildDefaultMemory()
    });

    const savedUserMessage = await Message.create({
        user_id: syntheticUser.id,
        role: 'user',
        content: String(caseItem.user_message || ''),
        metadata: {
            source: 'tools/evaluate-memory-write',
            fixture_case_id: caseItem.id || null
        }
    });
    const savedAssistantMessage = await Message.create({
        user_id: syntheticUser.id,
        role: 'assistant',
        content: String(caseItem.ai_response || ''),
        metadata: {
            source: 'tools/evaluate-memory-write',
            fixture_case_id: caseItem.id || null
        }
    });

    const memoryEventService = caseItem.simulate_memory_event_write_error
        ? {
            async saveCandidates() {
                throw new Error(String(caseItem.simulated_error_message || 'simulated memory event write failure'));
            }
        }
        : undefined;
    const memoryService = new MemoryService({
        aiService: buildStubAiService(caseItem.mock_artifacts || {
            profile_patch: null,
            memory_event_candidates: []
        }),
        ...(memoryEventService ? { memoryEventService } : {})
    });

    const result = await memoryService.updateLongTermMemory({
        user: syntheticUser,
        username: syntheticUser.username,
        telegramUserId: syntheticUser.telegram_id,
        userMessage: String(caseItem.user_message || ''),
        aiResponse: String(caseItem.ai_response || ''),
        recentMessages: toArray(caseItem.recent_messages),
        profile: initialProfile,
        traceId: `eval-memory-write-${runId}-${index + 1}`,
        sourceMessageIds: [savedUserMessage.id, savedAssistantMessage.id]
    });

    const updatedProfile = await Profile.findByUserId(syntheticUser.id);
    const createdEvents = await MemoryEvent.findByUserId(syntheticUser.id, { limit: 20 });
    const latestJob = await loadLatestMemoryUpdateJob(syntheticUser.id);

    const profileMisses = collectProfileMisses(result, updatedProfile, caseItem.expected_profile);
    const eventChecks = collectEventChecks(createdEvents, caseItem.expected_memory_events);
    const eventExpectationPass = eventChecks.every((item) => item.matched);
    const combinedEventText = createdEvents
        .map((event) => `${event.title}\n${event.summary}\n${event.detail}\n${(event.keywords || []).join('\n')}`)
        .join('\n');
    const disallowedMatches = getPatternMatches(combinedEventText, caseItem.disallowed_event_patterns);

    const savedCountExpected = caseItem.expected_saved_event_count;
    const savedCountPass = savedCountExpected === undefined
        ? true
        : createdEvents.length === Number(savedCountExpected);
    const syncJobExpected = caseItem.sync_job_should_exist !== false;
    const syncJobPass = syncJobExpected ? Boolean(latestJob) : !latestJob;
    const expectedJobResult = caseItem.expected_job_result;
    const jobResultPass = expectedJobResult === undefined
        ? true
        : String(latestJob?.details?.result || '') === String(expectedJobResult);
    const expectedMemoryEventError = caseItem.expect_memory_event_error === true;
    const memoryEventErrorPass = expectedMemoryEventError
        ? Boolean(result.memoryEventError)
        : (caseItem.expect_memory_event_error === false ? !result.memoryEventError : true);
    const overallPass = (
        profileMisses.length === 0
        && eventExpectationPass
        && disallowedMatches.length === 0
        && savedCountPass
        && syncJobPass
        && jobResultPass
        && memoryEventErrorPass
    );

    return {
        id: caseItem.id || `case_${index + 1}`,
        user_id: syntheticUser.id,
        profile_pass: profileMisses.length === 0,
        profile_misses: profileMisses,
        event_expectation_pass: eventExpectationPass,
        event_checks: eventChecks,
        disallowed_pattern_pass: disallowedMatches.length === 0,
        disallowed_pattern_matches: disallowedMatches,
        saved_event_count: createdEvents.length,
        saved_count_pass: savedCountPass,
        sync_job_pass: syncJobPass,
        job_result_pass: jobResultPass,
        memory_event_error_pass: memoryEventErrorPass,
        job_status: latestJob?.status || null,
        job_result: latestJob?.details?.result || null,
        memory_event_error: result.memoryEventError || null,
        created_event_titles: createdEvents.map((event) => event.title),
        overall_pass: overallPass
    };
}

function buildSummaryReport(fixture, results = []) {
    return {
        fixture_name: fixture.name,
        total_cases: results.length,
        profile_update_pass_rate: toSummaryRate(results, 'profile_pass'),
        expected_event_hit_rate: toSummaryRate(results, 'event_expectation_pass'),
        disallowed_pattern_pass_rate: toSummaryRate(results, 'disallowed_pattern_pass'),
        sync_job_recorded_rate: toSummaryRate(results, 'sync_job_pass'),
        overall_pass_rate: toSummaryRate(results, 'overall_pass')
    };
}

async function runEvaluateMemoryWrite() {
    const args = parseArgs(process.argv.slice(2));
    const { fixturePath, fixture } = loadFixture('memory-write-eval', args.fixture || 'baseline');
    const runId = Date.now();
    const cleanupUserIds = [];

    try {
        const results = [];

        for (const [index, caseItem] of toArray(fixture.cases).entries()) {
            const caseResult = await evaluateCase({ caseItem, runId, index });
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
        console.log(`🧠 Profile Pass Rate: ${round(summary.profile_update_pass_rate * 100, 1)}%`);
        console.log(`📝 Expected Event Hit Rate: ${round(summary.expected_event_hit_rate * 100, 1)}%`);
        console.log(`🧹 Disallowed Pattern Pass Rate: ${round(summary.disallowed_pattern_pass_rate * 100, 1)}%`);
        console.log(`📦 Sync Job Recorded Rate: ${round(summary.sync_job_recorded_rate * 100, 1)}%`);
        console.log(`✅ Overall Pass Rate: ${round(summary.overall_pass_rate * 100, 1)}%`);
        console.log('');

        results.forEach((item) => {
            console.log(`- ${item.id}: ${item.overall_pass ? 'PASS' : 'FAIL'}`);
            console.log(`  created_events=${item.saved_event_count} job=${item.job_status || '-'} result=${item.job_result || '-'}`);
            if (!item.profile_pass) {
                console.log(`  profile_misses=${item.profile_misses.join('; ')}`);
            }
            if (!item.event_expectation_pass) {
                console.log('  event_checks=' + JSON.stringify(item.event_checks));
            }
            if (!item.disallowed_pattern_pass) {
                console.log(`  disallowed_matches=${item.disallowed_pattern_matches.join(', ')}`);
            }
            if (!item.job_result_pass || !item.sync_job_pass || !item.memory_event_error_pass) {
                console.log(`  memory_event_error=${item.memory_event_error || '-'}`);
            }
        });

        return output;
    } finally {
        await cleanupUserDataset(cleanupUserIds);
    }
}

runEvaluateMemoryWrite().catch((error) => {
    console.error(`❌ memory write eval 执行失败: ${error.message}`);
    process.exit(1);
});
