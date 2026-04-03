// 知识片段数据模型
const { randomUUID } = require('crypto');
const { db } = require('../db/connection');
const knowledgeVectorStore = require('../services/rag/knowledge-vector-store');

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

class Knowledge {
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
     * 创建知识片段（通过 LangChain PGVectorStore 写入）
     * @param {Object} knowledgeData - 知识数据
     * @returns {Promise<Object>} 创建的知识片段
     */
    static async create(knowledgeData) {
        const normalized = normalizeKnowledgeData(knowledgeData);

        if (!normalized.content) {
            throw new Error('知识内容不能为空');
        }

        const id = randomUUID();

        await knowledgeVectorStore.addKnowledge({
            id,
            ...normalized
        });

        const created = await this.findById(id);
        if (!created) {
            throw new Error('知识片段写入后读取失败');
        }

        return created;
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

        const pendingItems = [];
        const successfulItems = [];
        const failedItems = [];

        for (const [index, knowledgeData] of knowledgeArray.entries()) {
            try {
                const normalized = normalizeKnowledgeData(knowledgeData);
                if (!normalized.content) {
                    throw new Error('知识内容不能为空');
                }

                pendingItems.push({
                    id: randomUUID(),
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

        if (pendingItems.length > 0) {
            try {
                await knowledgeVectorStore.addKnowledgeBatch(pendingItems);
                const createdRows = await this.findByIds(pendingItems.map((item) => item.id));
                successfulItems.push(...createdRows);
            } catch (batchError) {
                console.error('⚠️ LangChain 批量写入失败，降级为逐条写入:', batchError.message);

                for (const item of pendingItems) {
                    try {
                        await knowledgeVectorStore.addKnowledge(item);
                        const created = await this.findById(item.id);
                        if (!created) {
                            throw new Error('知识片段写入后读取失败');
                        }
                        successfulItems.push(created);
                    } catch (error) {
                        failedItems.push({
                            index: item.index,
                            source: item.source || null,
                            error: error.message
                        });
                    }
                }
            }
        }

        if (options && options.detailed === true) {
            return {
                total: knowledgeArray.length,
                successCount: successfulItems.length,
                failureCount: failedItems.length,
                successfulItems,
                failedItems
            };
        }

        return successfulItems;
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
            SELECT * FROM knowledge_chunks
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
            SELECT * FROM knowledge_chunks
            WHERE source = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [source, limit, offset]);
        return result.rows;
    }

    /**
     * 语义搜索：基于 LangChain PGVectorStore 检索知识片段
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
            const rawResults = await knowledgeVectorStore.similaritySearch(queryText, {
                limit,
                filter: userId ? { user_id: userId } : undefined
            });
            const matchedResults = rawResults.filter((item) => item.similarity >= similarityThreshold);

            if (matchedResults.length === 0) {
                return [];
            }

            const rows = await this.findByIds(matchedResults.map((item) => item.id));
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
                    source: item.metadata?.source || null,
                    user_id: item.metadata?.user_id || null,
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

        const existing = await this.findById(id);
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
                : (isPlainObject(existing.metadata) ? { ...existing.metadata } : {})
        };

        if (!normalizedUpdates.content) {
            throw new Error('知识内容不能为空');
        }

        if (normalizedUpdates.user_id && !UUID_PATTERN.test(normalizedUpdates.user_id)) {
            throw new Error('User ID 必须是有效 UUID');
        }

        const metadata = knowledgeVectorStore.buildMetadata({
            user_id: normalizedUpdates.user_id,
            source: normalizedUpdates.source,
            metadata: normalizedUpdates.metadata
        });

        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (updates.content !== undefined) {
            fields.push(`content = $${paramIndex}`);
            values.push(normalizedUpdates.content);
            paramIndex += 1;
        }

        if (updates.source !== undefined) {
            fields.push(`source = $${paramIndex}`);
            values.push(normalizedUpdates.source);
            paramIndex += 1;
        }

        if (updates.user_id !== undefined) {
            fields.push(`user_id = $${paramIndex}`);
            values.push(normalizedUpdates.user_id);
            paramIndex += 1;
        }

        fields.push(`metadata = $${paramIndex}::jsonb`);
        values.push(JSON.stringify(metadata));
        paramIndex += 1;

        if (updates.content !== undefined) {
            const embedding = await knowledgeVectorStore.embedText(normalizedUpdates.content);
            const embeddingSql = knowledgeVectorStore.toVectorSql(embedding);

            if (!embeddingSql) {
                throw new Error('知识向量生成失败');
            }

            fields.push(`embedding = $${paramIndex}::vector`);
            values.push(embeddingSql);
            paramIndex += 1;
        }

        values.push(id);
        const query = `
            UPDATE knowledge_chunks
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await db.query(query, values);
        if (result.rows.length === 0) {
            throw new Error('知识片段不存在');
        }

        return result.rows[0];
    }

    /**
     * 删除知识片段
     * @param {string} id - 知识片段UUID
     * @returns {Promise<boolean>} 是否删除成功
     */
    static async delete(id) {
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

            const created = await this.create(testKnowledge);
            if (!created || !created.id) {
                throw new Error('创建知识片段失败');
            }

            const searchResults = await this.semanticSearch('测试知识', null, 5);
            if (!Array.isArray(searchResults)) {
                throw new Error('语义搜索返回格式不正确');
            }

            await this.delete(created.id);

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
