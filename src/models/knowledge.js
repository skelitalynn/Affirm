// 知识片段数据模型
const { randomUUID } = require('crypto');
const { db } = require('../db/connection');
const ragProvider = require('../services/rag/provider');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKnowledgeData(knowledgeData = {}) {
    const normalized = {
        user_id: knowledgeData.user_id ? String(knowledgeData.user_id).trim() : null,
        content: typeof knowledgeData.content === 'string' ? knowledgeData.content.trim() : '',
        source: typeof knowledgeData.source === 'string' && knowledgeData.source.trim()
            ? knowledgeData.source.trim()
            : 'user_input',
        metadata: isPlainObject(knowledgeData.metadata) ? { ...knowledgeData.metadata } : {}
    };

    if (normalized.user_id && !UUID_PATTERN.test(normalized.user_id)) {
        throw new Error('User ID 必须是有效 UUID');
    }

    return normalized;
}

function mapRowsById(rows = []) {
    return new Map(rows.map((row) => [row.id, row]));
}

function truncateMessage(message, maxLength = 240) {
    const normalized = String(message || '').trim();
    if (!normalized) {
        return '';
    }

    return normalized.length > maxLength
        ? `${normalized.slice(0, maxLength - 3)}...`
        : normalized;
}

class Knowledge {
    static sanitizeMetadata(metadata = {}) {
        if (!isPlainObject(metadata)) {
            return {};
        }

        const sanitized = { ...metadata };
        delete sanitized.source;
        delete sanitized.user_id;
        delete sanitized.scope;

        return sanitized;
    }

    static buildSyncState(status = 'pending', errorMessage = '') {
        const now = new Date().toISOString();
        const normalizedStatus = String(status || 'pending').trim() || 'pending';
        const normalizedError = truncateMessage(errorMessage);
        const syncState = {
            provider: 'haystack',
            status: normalizedStatus,
            last_attempt_at: now
        };

        if (normalizedStatus === 'synced') {
            syncState.last_synced_at = now;
        }

        if (normalizedError) {
            syncState.last_error = normalizedError;
        }

        return syncState;
    }

    static buildMetadata({ user_id = null, source = 'user_input', metadata = {} } = {}) {
        const sanitized = Knowledge.sanitizeMetadata(metadata);

        return {
            ...sanitized,
            source: source || 'user_input',
            ...(user_id ? { user_id } : {}),
            scope: user_id ? 'user' : 'global'
        };
    }

    static buildStoredMetadata({ user_id = null, source = 'user_input', metadata = {}, syncStatus = 'pending', syncError = '' } = {}) {
        const sanitized = Knowledge.sanitizeMetadata(metadata);

        return Knowledge.buildMetadata({
            user_id,
            source,
            metadata: {
                ...sanitized,
                rag_sync: Knowledge.buildSyncState(syncStatus, syncError)
            }
        });
    }

    static getSyncInfo(row) {
        if (!row || !isPlainObject(row.metadata) || !isPlainObject(row.metadata.rag_sync)) {
            return {
                status: 'pending',
                message: '等待同步到 Haystack'
            };
        }

        const syncInfo = row.metadata.rag_sync;
        return {
            status: syncInfo.status || 'pending',
            message: syncInfo.last_error || ''
        };
    }

    static toRagDocument(row) {
        if (!row) {
            return null;
        }

        const customMetadata = Knowledge.sanitizeMetadata(row.metadata);
        delete customMetadata.rag_sync;

        return {
            id: row.id,
            content: String(row.content || ''),
            metadata: {
                ...customMetadata,
                chunk_id: row.id,
                document_id: row.id,
                source: row.source || 'user_input',
                scope: row.user_id ? 'user' : 'global',
                ...(row.user_id ? { user_id: row.user_id } : {}),
                ...(row.created_at ? { created_at: new Date(row.created_at).toISOString() } : {})
            }
        };
    }

    static async updateSyncMetadata(row, syncStatus, syncError = '') {
        if (!row) {
            return null;
        }

        const metadata = Knowledge.buildStoredMetadata({
            user_id: row.user_id,
            source: row.source,
            metadata: row.metadata,
            syncStatus,
            syncError
        });

        const result = await db.query(`
            UPDATE knowledge_chunks
            SET user_id = $1,
                source = $2,
                metadata = $3::jsonb
            WHERE id = $4
            RETURNING *
        `, [
            row.user_id,
            row.source,
            JSON.stringify(metadata),
            row.id
        ]);

        return result.rows[0] || row;
    }

    static async syncRowsToRag(rows = []) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return {
                syncedRows: [],
                pendingRows: [],
                failedRows: [],
                errorMessage: ''
            };
        }

        if (!ragProvider.isConfigured()) {
            const pendingRows = [];
            for (const row of rows) {
                pendingRows.push(await Knowledge.updateSyncMetadata(row, 'pending', 'Haystack 未配置'));
            }

            return {
                syncedRows: [],
                pendingRows,
                failedRows: [],
                errorMessage: 'Haystack 未配置'
            };
        }

        try {
            const documents = rows
                .map((row) => Knowledge.toRagDocument(row))
                .filter(Boolean);

            await ragProvider.upsertKnowledge(documents);

            const syncedRows = [];
            for (const row of rows) {
                syncedRows.push(await Knowledge.updateSyncMetadata(row, 'synced'));
            }

            return {
                syncedRows,
                pendingRows: [],
                failedRows: [],
                errorMessage: ''
            };
        } catch (error) {
            const failedRows = [];
            for (const row of rows) {
                failedRows.push(await Knowledge.updateSyncMetadata(row, 'failed', error.message));
            }

            return {
                syncedRows: [],
                pendingRows: [],
                failedRows,
                errorMessage: error.message
            };
        }
    }

    static async insertRow(knowledgeData) {
        const id = knowledgeData.id || randomUUID();
        const metadata = Knowledge.buildStoredMetadata({
            user_id: knowledgeData.user_id,
            source: knowledgeData.source,
            metadata: knowledgeData.metadata,
            syncStatus: 'pending',
            syncError: ragProvider.isConfigured() ? '' : 'Haystack 未配置'
        });

        const result = await db.query(`
            INSERT INTO knowledge_chunks (id, user_id, content, source, metadata)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            RETURNING *
        `, [
            id,
            knowledgeData.user_id,
            knowledgeData.content,
            knowledgeData.source,
            JSON.stringify(metadata)
        ]);

        return result.rows[0];
    }

    static async findByIds(ids = []) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }

        const result = await db.query(`
            SELECT *
            FROM knowledge_chunks
            WHERE id = ANY($1::uuid[])
        `, [ids]);
        const rowsById = mapRowsById(result.rows);

        return ids.map((id) => rowsById.get(id)).filter(Boolean);
    }

    /**
     * 创建知识片段（落库后同步到 Haystack）
     * @param {Object} knowledgeData - 知识数据
     * @returns {Promise<Object>} 创建的知识片段
     */
    static async create(knowledgeData) {
        const normalized = normalizeKnowledgeData(knowledgeData);

        if (!normalized.content) {
            throw new Error('知识内容不能为空');
        }

        const created = await Knowledge.insertRow(normalized);
        const syncResult = await Knowledge.syncRowsToRag([created]);

        return syncResult.syncedRows[0]
            || syncResult.pendingRows[0]
            || syncResult.failedRows[0]
            || created;
    }

    /**
     * 批量创建知识片段
     * @param {Array<Object>} knowledgeArray - 知识数据数组
     * @returns {Promise<Array<Object>|Object>} 创建结果
     */
    static async createBatch(knowledgeArray, options = {}) {
        if (!Array.isArray(knowledgeArray) || knowledgeArray.length === 0) {
            throw new Error('知识数据数组不能为空');
        }

        const normalizedItems = [];
        const failedItems = [];

        for (const [index, knowledgeData] of knowledgeArray.entries()) {
            try {
                const normalized = normalizeKnowledgeData(knowledgeData);
                if (!normalized.content) {
                    throw new Error('知识内容不能为空');
                }

                normalizedItems.push({
                    index,
                    ...normalized
                });
            } catch (error) {
                failedItems.push({
                    index,
                    source: knowledgeData?.source || null,
                    error: error.message
                });
            }
        }

        const createdRows = [];
        const rowIndexMap = new Map();
        for (const item of normalizedItems) {
            try {
                const createdRow = await Knowledge.insertRow(item);
                createdRows.push(createdRow);
                rowIndexMap.set(createdRow.id, item.index);
            } catch (error) {
                failedItems.push({
                    index: item.index,
                    source: item.source || null,
                    error: error.message
                });
            }
        }

        const syncResult = await Knowledge.syncRowsToRag(createdRows);
        const syncedRows = syncResult.syncedRows;
        const pendingRows = syncResult.pendingRows;

        if (syncResult.failedRows.length > 0) {
            syncResult.failedRows.forEach((row) => {
                failedItems.push({
                    index: rowIndexMap.get(row.id) ?? null,
                    source: row.source || null,
                    error: syncResult.errorMessage || '同步到 Haystack 失败'
                });
            });
        }

        if (options && options.detailed === true) {
            return {
                total: knowledgeArray.length,
                successCount: syncedRows.length,
                pendingCount: pendingRows.length,
                failureCount: failedItems.length,
                successfulItems: syncedRows,
                pendingItems: pendingRows,
                failedItems
            };
        }

        return [...syncedRows, ...pendingRows];
    }

    /**
     * 根据ID查找知识片段
     * @param {string} id - 知识片段UUID
     * @returns {Promise<Object|null>} 知识片段或null
     */
    static async findById(id) {
        const query = 'SELECT * FROM knowledge_chunks WHERE id = $1';
        const result = await db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * 根据用户ID查找知识片段
     * @param {string} userId - 用户UUID
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 知识片段列表
     */
    static async findByUserId(userId, limit = 100, offset = 0) {
        const query = `
            SELECT *
            FROM knowledge_chunks
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [userId, limit, offset]);
        return result.rows;
    }

    /**
     * 根据来源查找知识片段
     * @param {string} source - 来源
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 知识片段列表
     */
    static async findBySource(source, limit = 100, offset = 0) {
        const query = `
            SELECT *
            FROM knowledge_chunks
            WHERE source = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [source, limit, offset]);
        return result.rows;
    }

    /**
     * 语义搜索：通过 Haystack 检索知识片段
     * @param {string} queryText - 查询文本
     * @param {string} userId - 用户UUID（可选）
     * @param {number} limit - 返回数量
     * @param {number} similarityThreshold - 相似度阈值 (0-1)
     * @returns {Promise<Array>} 相关知识和相似度分数
     */
    static async semanticSearch(queryText, userId = null, limit = 10, similarityThreshold = 0.7) {
        if (!queryText || queryText.trim().length === 0) {
            throw new Error('查询文本不能为空');
        }

        try {
            const rawResults = await ragProvider.searchKnowledge(queryText, {
                userId,
                limit,
                similarityThreshold
            });
            const matchedResults = rawResults.filter((item) => item.similarity >= similarityThreshold);

            if (matchedResults.length === 0) {
                return [];
            }

            const validIds = matchedResults
                .map((item) => item.id)
                .filter((id) => typeof id === 'string' && UUID_PATTERN.test(id));
            const rows = await Knowledge.findByIds(validIds);
            const rowsById = mapRowsById(rows);

            return matchedResults.map((item) => {
                const row = rowsById.get(item.id);
                if (row) {
                    return {
                        ...row,
                        similarity: item.similarity
                    };
                }

                return {
                    id: item.id,
                    content: item.content,
                    source: item.source || null,
                    user_id: item.user_id || null,
                    metadata: item.metadata || {},
                    similarity: item.similarity
                };
            });
        } catch (error) {
            console.error('❌ 知识语义搜索失败:', error.message);
            return [];
        }
    }

    /**
     * 更新知识片段内容
     * @param {string} id - 知识片段UUID
     * @param {Object} updates - 更新字段
     * @returns {Promise<Object>} 更新后的知识片段
     */
    static async update(id, updates) {
        if (
            updates.content === undefined
            && updates.source === undefined
            && updates.user_id === undefined
            && updates.metadata === undefined
        ) {
            throw new Error('没有提供更新字段');
        }

        const existing = await Knowledge.findById(id);
        if (!existing) {
            throw new Error('知识片段不存在');
        }

        const normalizedUpdates = {
            content: updates.content !== undefined ? String(updates.content).trim() : existing.content,
            source: updates.source !== undefined
                ? (String(updates.source).trim() || 'user_input')
                : existing.source,
            user_id: updates.user_id !== undefined
                ? (updates.user_id ? String(updates.user_id).trim() : null)
                : existing.user_id,
            metadata: updates.metadata !== undefined
                ? (isPlainObject(updates.metadata) ? { ...updates.metadata } : {})
                : Knowledge.sanitizeMetadata(existing.metadata)
        };

        if (!normalizedUpdates.content) {
            throw new Error('知识内容不能为空');
        }

        if (normalizedUpdates.user_id && !UUID_PATTERN.test(normalizedUpdates.user_id)) {
            throw new Error('User ID 必须是有效 UUID');
        }

        const metadata = Knowledge.buildStoredMetadata({
            user_id: normalizedUpdates.user_id,
            source: normalizedUpdates.source,
            metadata: normalizedUpdates.metadata,
            syncStatus: 'pending',
            syncError: ragProvider.isConfigured() ? '' : 'Haystack 未配置'
        });

        const result = await db.query(`
            UPDATE knowledge_chunks
            SET user_id = $1,
                content = $2,
                source = $3,
                metadata = $4::jsonb,
                embedding = NULL
            WHERE id = $5
            RETURNING *
        `, [
            normalizedUpdates.user_id,
            normalizedUpdates.content,
            normalizedUpdates.source,
            JSON.stringify(metadata),
            id
        ]);

        if (result.rows.length === 0) {
            throw new Error('知识片段不存在');
        }

        const updatedRow = result.rows[0];
        const syncResult = await Knowledge.syncRowsToRag([updatedRow]);

        return syncResult.syncedRows[0]
            || syncResult.pendingRows[0]
            || syncResult.failedRows[0]
            || updatedRow;
    }

    static async resyncById(id) {
        const existing = await Knowledge.findById(id);
        if (!existing) {
            throw new Error('知识片段不存在');
        }

        const syncResult = await Knowledge.syncRowsToRag([existing]);

        return syncResult.syncedRows[0]
            || syncResult.pendingRows[0]
            || syncResult.failedRows[0]
            || existing;
    }

    /**
     * 删除知识片段
     * @param {string} id - 知识片段UUID
     * @returns {Promise<boolean>} 是否删除成功
     */
    static async delete(id) {
        const existing = await Knowledge.findById(id);
        if (!existing) {
            return false;
        }

        if (ragProvider.isConfigured()) {
            await ragProvider.deleteKnowledge([id]);
        }

        const query = 'DELETE FROM knowledge_chunks WHERE id = $1 RETURNING id';
        const result = await db.query(query, [id]);
        return result.rows.length > 0;
    }

    /**
     * 删除用户的所有知识片段
     * @param {string} userId - 用户UUID
     * @returns {Promise<number>} 删除的数量
     */
    static async deleteByUserId(userId) {
        const rows = await Knowledge.findByUserId(userId, 10000, 0);
        const ids = rows.map((row) => row.id);

        if (ids.length === 0) {
            return 0;
        }

        if (ragProvider.isConfigured()) {
            await ragProvider.deleteKnowledge(ids);
        }

        const query = 'DELETE FROM knowledge_chunks WHERE user_id = $1 RETURNING id';
        const result = await db.query(query, [userId]);
        return result.rows.length;
    }

    /**
     * 统计知识片段数量
     * @param {string} userId - 用户UUID（可选）
     * @returns {Promise<number>} 知识片段数量
     */
    static async count(userId = null) {
        let query = 'SELECT COUNT(*) FROM knowledge_chunks';
        let values = [];

        if (userId) {
            query += ' WHERE user_id = $1';
            values = [userId];
        }

        const result = await db.query(query, values);
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * 获取所有知识片段
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 知识片段列表
     */
    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT k.*, u.username, u.telegram_id
            FROM knowledge_chunks k
            LEFT JOIN users u ON k.user_id = u.id
            ORDER BY k.created_at DESC
            LIMIT $1 OFFSET $2
        `;
        const result = await db.query(query, [limit, offset]);
        return result.rows;
    }

    /**
     * 测试知识片段功能
     * @returns {Promise<boolean>} 测试是否成功
     */
    static async test() {
        try {
            const testKnowledge = {
                user_id: '00000000-0000-0000-0000-000000000000',
                content: '这是一个测试知识片段',
                source: 'test'
            };

            const created = await Knowledge.create(testKnowledge);
            if (!created || !created.id) {
                throw new Error('创建知识片段失败');
            }

            const searchResults = await Knowledge.semanticSearch('测试知识', null, 5, 0.1);
            if (!Array.isArray(searchResults)) {
                throw new Error('语义搜索返回格式不正确');
            }

            await Knowledge.delete(created.id);

            console.log('✅ 知识片段功能测试成功');
            console.log(`📊 语义搜索返回: ${searchResults.length} 个结果`);

            return true;
        } catch (error) {
            console.error('❌ 知识片段功能测试失败:', error.message);
            return false;
        }
    }
}

module.exports = Knowledge;
