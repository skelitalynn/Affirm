#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const { Pool } = require('pg');

const TABLE_NAME = 'knowledge_chunks';
const PROBE_SOURCE = 'langchain-pgvector-poc';
const DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS, 10) || 768;

class DeterministicEmbeddings {
    constructor(dimensions) {
        this.dimensions = dimensions;
    }

    buildVector(text) {
        const digest = crypto.createHash('sha256').update(String(text || '')).digest();
        const vector = new Array(this.dimensions);
        let norm = 0;

        for (let index = 0; index < this.dimensions; index += 1) {
            const byte = digest[index % digest.length];
            const sign = index % 2 === 0 ? 1 : -1;
            const value = sign * ((byte + 1) / 255);
            vector[index] = value;
            norm += value * value;
        }

        const safeNorm = Math.sqrt(norm) || 1;
        return vector.map((value) => Number((value / safeNorm).toFixed(8)));
    }

    async embedQuery(text) {
        return this.buildVector(text);
    }

    async embedDocuments(texts) {
        return texts.map((text) => this.buildVector(text));
    }
}

async function loadPGVectorStore() {
    return import('@langchain/community/vectorstores/pgvector');
}

function toVectorSql(vector) {
    return `[${vector.join(',')}]`;
}

async function getTableDiagnostics(pool) {
    const [columnsResult, countResult] = await Promise.all([
        pool.query(`
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
        `, [TABLE_NAME]),
        pool.query(`
            SELECT
                COUNT(*)::int AS total_count,
                COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedding_count
            FROM knowledge_chunks
        `)
    ]);

    return {
        columns: columnsResult.rows,
        totalCount: countResult.rows[0].total_count,
        embeddingCount: countResult.rows[0].embedding_count,
        hasMetadataColumn: columnsResult.rows.some((row) => row.column_name === 'metadata')
    };
}

async function insertProbeRow(pool, content, vectorSql, metadata = {}) {
    const result = await pool.query(`
        INSERT INTO knowledge_chunks (content, source, embedding, metadata)
        VALUES ($1, $2, $3::vector, $4::jsonb)
        RETURNING id
    `, [content, PROBE_SOURCE, vectorSql, JSON.stringify(metadata)]);

    return result.rows[0].id;
}

async function cleanupProbeRows(pool, contents) {
    const filteredContents = contents.filter(Boolean);
    await pool.query(`
        DELETE FROM knowledge_chunks
        WHERE source = $1
           OR metadata->>'source' = $1
           OR content = ANY($2::text[])
    `, [PROBE_SOURCE, filteredContents]);
}

async function runPoC() {
    if (!process.env.DB_URL) {
        throw new Error('DB_URL 未配置，无法执行 PoC');
    }

    const pool = new Pool({ connectionString: process.env.DB_URL });
    const embeddings = new DeterministicEmbeddings(DIMENSIONS);
    const suffix = Date.now();
    const probeContent = `LANGCHAIN_PGVECTOR_READ_PROBE_${suffix}`;
    const addDocContent = `LANGCHAIN_PGVECTOR_ADD_PROBE_${suffix}`;
    const summary = {
        tableName: TABLE_NAME,
        dimensions: DIMENSIONS,
        initializeOk: false,
        similaritySearchOk: false,
        filteredSearchOk: false,
        addDocumentsInsertOk: false,
        addDocumentsColumnMappingOk: false
    };

    let vectorStore;

    try {
        const diagnostics = await getTableDiagnostics(pool);
        console.log('## knowledge_chunks diagnostics');
        console.log(JSON.stringify(diagnostics, null, 2));

        const { PGVectorStore } = await loadPGVectorStore();
        vectorStore = await PGVectorStore.initialize(embeddings, {
            pool,
            tableName: TABLE_NAME,
            columns: {
                idColumnName: 'id',
                contentColumnName: 'content',
                vectorColumnName: 'embedding',
                metadataColumnName: 'metadata'
            },
            distanceStrategy: 'cosine'
        });
        summary.initializeOk = true;
        console.log('✅ PGVectorStore.initialize() 成功');

        const probeVector = await embeddings.embedQuery(probeContent);
        await insertProbeRow(pool, probeContent, toVectorSql(probeVector), {
            source: PROBE_SOURCE,
            scope: 'global'
        });

        const similarityResults = await vectorStore.similaritySearch(probeContent, 3);
        summary.similaritySearchOk = similarityResults.some((doc) => doc.pageContent === probeContent);
        console.log('## similaritySearch results');
        console.log(JSON.stringify(similarityResults.map((doc) => ({
            pageContent: doc.pageContent,
            metadata: doc.metadata || {}
        })), null, 2));
        console.log(summary.similaritySearchOk
            ? '✅ 无过滤 similaritySearch 可命中探针数据'
            : '❌ 无过滤 similaritySearch 未命中探针数据');

        try {
            const filteredResults = await vectorStore.similaritySearch(probeContent, 3, {
                source: PROBE_SOURCE
            });
            summary.filteredSearchOk = filteredResults.some((doc) => doc.pageContent === probeContent);
            console.log('## filtered similaritySearch results');
            console.log(JSON.stringify(filteredResults.map((doc) => ({
                pageContent: doc.pageContent,
                metadata: doc.metadata || {}
            })), null, 2));
            console.log(summary.filteredSearchOk
                ? '✅ metadata filter 可用'
                : '❌ metadata filter 未报错，但也未命中探针数据');
        } catch (error) {
            console.log('❌ metadata filter 失败:', error.message);
        }

        try {
            await vectorStore.addDocuments([
                {
                    pageContent: addDocContent,
                    metadata: {
                        source: PROBE_SOURCE,
                        scope: 'global'
                    }
                }
            ]);

            const addDocCheck = await pool.query(`
                SELECT id, user_id, source, metadata
                FROM knowledge_chunks
                WHERE content = $1
                LIMIT 1
            `, [addDocContent]);

            summary.addDocumentsInsertOk = addDocCheck.rows.length > 0;

            if (summary.addDocumentsInsertOk) {
                const insertedRow = addDocCheck.rows[0];
                summary.addDocumentsColumnMappingOk = insertedRow.source === PROBE_SOURCE;
                console.log('## addDocuments inserted row');
                console.log(JSON.stringify(insertedRow, null, 2));
            }

            console.log(summary.addDocumentsInsertOk
                ? '✅ addDocuments() 已写入 knowledge_chunks'
                : '❌ addDocuments() 未报错，但未找到写入记录');

            if (summary.addDocumentsInsertOk) {
                console.log(summary.addDocumentsColumnMappingOk
                    ? '✅ addDocuments() 同时保留了现有 source 列语义'
                    : '❌ addDocuments() 虽然写入成功，但未保留现有 source/user_id 列语义');
            }
        } catch (error) {
            console.log('❌ addDocuments() 失败:', error.message);
        }

        console.log('## summary');
        console.log(JSON.stringify(summary, null, 2));

        if (
            summary.initializeOk
            && summary.similaritySearchOk
            && summary.filteredSearchOk
            && summary.addDocumentsInsertOk
            && summary.addDocumentsColumnMappingOk
        ) {
            console.log('✅ 结论：现有 knowledge_chunks 可被 PGVectorStore 直接完整挂载');
            return true;
        }

        console.log('⚠️  结论：现有 knowledge_chunks 只能部分兼容，不能直接完整替换现有 Knowledge 链路');
        return false;
    } finally {
        try {
            await cleanupProbeRows(pool, [probeContent, addDocContent]);
        } catch (cleanupError) {
            console.error('⚠️  清理探针数据失败:', cleanupError.message);
        }

        if (vectorStore) {
            await vectorStore.end().catch((error) => {
                console.error('⚠️  关闭 PGVectorStore 失败:', error.message);
            });
        } else {
            await pool.end().catch((error) => {
                console.error('⚠️  关闭数据库连接失败:', error.message);
            });
        }
    }
}

if (require.main === module) {
    runPoC()
        .then((success) => process.exit(success ? 0 : 1))
        .catch((error) => {
            console.error('❌ PGVectorStore PoC 失败:', error.message);
            process.exit(1);
        });
}

module.exports = {
    runPoC
};
