#!/usr/bin/env node
const MemoryEmbeddingService = require('../src/services/memory-embedding-service');
const MemoryRetrievalService = require('../src/services/memory-retrieval-service');
const ragProvider = require('../src/services/rag/provider');
const haystackClient = require('../src/services/rag/haystack-client');
const {
    loadFixture,
    parseArgs,
    round,
    toSummaryRate
} = require('./eval-helpers');

const DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000001';

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

async function evaluateEmbeddingFallback(caseItem) {
    const service = new MemoryEmbeddingService();
    const simulatedErrorMessage = String(caseItem.error_message || 'incorrect api key');
    const originalRuntime = service.runtime;

    try {
        service.runtime = {
            mode: 'openai-compatible',
            provider: 'mock-remote',
            model: 'mock-embedding-model',
            dimensions: service.dimensions,
            embeddings: {
                async embedQuery() {
                    const error = new Error(simulatedErrorMessage);
                    error.status = Number(caseItem.error_status || 401);
                    throw error;
                },
                async embedDocuments() {
                    const error = new Error(simulatedErrorMessage);
                    error.status = Number(caseItem.error_status || 401);
                    throw error;
                }
            }
        };

        const vector = await service.embedText(caseItem.text || 'fallback evaluation query');
        const status = service.getStatus();
        const pass = (
            Array.isArray(vector)
            && vector.length === service.dimensions
            && status.mode === 'deterministic'
            && status.degraded === true
        );

        return {
            id: caseItem.id,
            type: caseItem.type,
            status,
            vector_dimensions: Array.isArray(vector) ? vector.length : 0,
            pass
        };
    } finally {
        service.runtime = originalRuntime;
    }
}

async function evaluateRetrievalFailure(caseItem) {
    const retrievalService = new MemoryRetrievalService({
        model: {
            async searchHybrid() {
                throw new Error(String(caseItem.error_message || 'simulated retrieval failure'));
            }
        }
    });

    const results = await retrievalService.searchRelevantEvents({
        userId: caseItem.user_id || DEFAULT_USER_ID,
        queryText: caseItem.query || 'simulated retrieval degradation case',
        limit: Number(caseItem.limit || 3)
    });

    return {
        id: caseItem.id,
        type: caseItem.type,
        result_count: Array.isArray(results) ? results.length : 0,
        pass: Array.isArray(results) && results.length === 0
    };
}

async function withPatchedHaystack({ configured, searchImpl }, fn) {
    const originalIsConfigured = haystackClient.isConfigured;
    const originalSearchKnowledge = haystackClient.searchKnowledge;

    try {
        haystackClient.isConfigured = () => configured;
        haystackClient.searchKnowledge = searchImpl;
        return await fn();
    } finally {
        haystackClient.isConfigured = originalIsConfigured;
        haystackClient.searchKnowledge = originalSearchKnowledge;
    }
}

async function evaluateKnowledgeFailure(caseItem) {
    const results = await withPatchedHaystack({
        configured: true,
        searchImpl: async () => {
            throw new Error(String(caseItem.error_message || 'simulated haystack failure'));
        }
    }, () => ragProvider.searchKnowledge(caseItem.query || 'knowledge degradation case', {
        userId: caseItem.user_id || null,
        limit: Number(caseItem.limit || 3)
    }));

    return {
        id: caseItem.id,
        type: caseItem.type,
        result_count: Array.isArray(results) ? results.length : 0,
        pass: Array.isArray(results) && results.length === 0
    };
}

async function evaluateKnowledgeUnconfigured(caseItem) {
    let searchCalled = false;
    const results = await withPatchedHaystack({
        configured: false,
        searchImpl: async () => {
            searchCalled = true;
            return [];
        }
    }, () => ragProvider.searchKnowledge(caseItem.query || 'knowledge unconfigured case', {
        userId: caseItem.user_id || null,
        limit: Number(caseItem.limit || 3)
    }));

    return {
        id: caseItem.id,
        type: caseItem.type,
        result_count: Array.isArray(results) ? results.length : 0,
        search_called: searchCalled,
        pass: Array.isArray(results) && results.length === 0 && searchCalled === false
    };
}

async function evaluateCase(caseItem) {
    switch (caseItem.type) {
    case 'embedding_fallback':
        return evaluateEmbeddingFallback(caseItem);
    case 'retrieval_failure':
        return evaluateRetrievalFailure(caseItem);
    case 'knowledge_failure':
        return evaluateKnowledgeFailure(caseItem);
    case 'knowledge_unconfigured':
        return evaluateKnowledgeUnconfigured(caseItem);
    default:
        throw new Error(`不支持的 degradation eval 类型: ${caseItem.type}`);
    }
}

function buildSummaryReport(fixture, results = []) {
    return {
        fixture_name: fixture.name,
        total_cases: results.length,
        overall_pass_rate: toSummaryRate(results, 'pass'),
        embedding_fallback_pass_rate: toSummaryRate(
            results.filter((item) => item.type === 'embedding_fallback'),
            'pass'
        ),
        retrieval_degrade_pass_rate: toSummaryRate(
            results.filter((item) => item.type === 'retrieval_failure'),
            'pass'
        ),
        knowledge_degrade_pass_rate: toSummaryRate(
            results.filter((item) => item.type === 'knowledge_failure' || item.type === 'knowledge_unconfigured'),
            'pass'
        )
    };
}

async function runEvaluateDegradation() {
    const args = parseArgs(process.argv.slice(2));
    const { fixturePath, fixture } = loadFixture('degradation-eval', args.fixture || 'baseline');
    const results = [];

    for (const caseItem of toArray(fixture.cases)) {
        results.push(await evaluateCase(caseItem));
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
    console.log(`🧱 Overall Pass Rate: ${round(summary.overall_pass_rate * 100, 1)}%`);
    console.log(`🧠 Embedding Fallback Pass Rate: ${round(summary.embedding_fallback_pass_rate * 100, 1)}%`);
    console.log(`🔎 Retrieval Degrade Pass Rate: ${round(summary.retrieval_degrade_pass_rate * 100, 1)}%`);
    console.log(`📚 Knowledge Degrade Pass Rate: ${round(summary.knowledge_degrade_pass_rate * 100, 1)}%`);
    console.log('');

    results.forEach((item) => {
        console.log(`- ${item.id}: ${item.pass ? 'PASS' : 'FAIL'} [${item.type}]`);
    });

    return output;
}

runEvaluateDegradation().catch((error) => {
    console.error(`❌ degradation eval 执行失败: ${error.message}`);
    process.exit(1);
});
