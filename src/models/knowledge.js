// 知识片段数据模型
const { db } = require('../db/connection');
const embeddingService = require('../services/embedding');

class Knowledge {
    /**
     * 创建知识片段（自动生成向量嵌入）
     * @param {Object} knowledgeData - 知识数据
     * @returns {Promise<Object>} 创建的知识片段
     */
    static async create(knowledgeData) {
        const { user_id, content, source } = knowledgeData;
        
        if (!content || content.trim().length === 0) {
            throw new Error('知识内容不能为空');
        }

        // 生成向量嵌入
        let embedding;
        try {
            embedding = await embeddingService.generateEmbedding(content);
        } catch (error) {
            console.error('❌ 生成向量嵌入失败，返回null:', error.message);
            embedding = null; // 禁止随机向量降级
        }

        // 处理嵌入格式：如果是数组，使用embeddingService转换为pgvector SQL格式
        let embeddingForQuery = null;
        if (embedding !== null && embedding !== undefined) {
            if (Array.isArray(embedding)) {
                // 使用embeddingService转换为pgvector SQL格式
                embeddingForQuery = embeddingService.toVectorSql(embedding);
            } else if (typeof embedding === 'string') {
                // 已经是字符串格式
                embeddingForQuery = embedding;
            } else {
                console.warn('⚠️ 未知的嵌入格式，存储为NULL:', typeof embedding);
                embeddingForQuery = null;
            }
        }

        const query = `
            INSERT INTO knowledge_chunks (user_id, content, source, embedding)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [user_id, content, source || 'user_input', embeddingForQuery];

        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('❌ 创建知识片段失败:', error.message);
            console.error('错误详情:', error.code, error.detail);
            throw error;
        }
    }

    /**
     * 批量创建知识片段
     * @param {Array<Object>} knowledgeArray - 知识数据数组
     * @returns {Promise<Array<Object>>} 创建的知识片段数组
     */
    static async createBatch(knowledgeArray) {
        if (!Array.isArray(knowledgeArray) || knowledgeArray.length === 0) {
            throw new Error('知识数据数组不能为空');
        }

        const results = [];
        for (const knowledgeData of knowledgeArray) {
            try {
                const result = await this.create(knowledgeData);
                results.push(result);
            } catch (error) {
                console.error(`❌ 创建知识片段失败 (跳过):`, error.message);
                // 继续处理其他项目
            }
        }

        return results;
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
     * 语义搜索：根据查询文本查找相关知识片段
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

        // 生成查询文本的向量嵌入
        let queryEmbedding;
        try {
            queryEmbedding = await embeddingService.generateEmbedding(queryText);
        } catch (error) {
            console.error('❌ 生成查询向量失败:', error.message);
            return [];
        }

        // 构建查询
        let query;
        let values;
        
        if (userId) {
            query = `
                SELECT *, 
                       (1 - (embedding <=> $1::vector)) as similarity
                FROM knowledge_chunks 
                WHERE user_id = $2 
                  AND (1 - (embedding <=> $1::vector)) > $3
                ORDER BY embedding <=> $1::vector
                LIMIT $4
            `;
            values = [queryEmbedding, userId, similarityThreshold, limit];
        } else {
            query = `
                SELECT *, 
                       (1 - (embedding <=> $1::vector)) as similarity
                FROM knowledge_chunks 
                WHERE (1 - (embedding <=> $1::vector)) > $2
                ORDER BY embedding <=> $1::vector
                LIMIT $3
            `;
            values = [queryEmbedding, similarityThreshold, limit];
        }

        try {
            const result = await db.query(query, values);
            return result.rows;
        } catch (error) {
            console.error('❌ 语义搜索失败:', error.message);
            return [];
        }
    }

    /**
     * 更新知识片段内容（重新生成向量嵌入）
     * @param {string} id - 知识片段UUID
     * @param {Object} updates - 更新字段
     * @returns {Promise<Object>} 更新后的知识片段
     */
    static async update(id, updates) {
        const { content, source } = updates;
        
        // 如果更新了内容，需要重新生成向量嵌入
        let embedding = null;
        if (content && content.trim().length > 0) {
            try {
                embedding = await embeddingService.generateEmbedding(content);
            } catch (error) {
                console.error('❌ 重新生成向量嵌入失败:', error.message);
                // 不更新嵌入，保持原样
            }
        }

        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (content !== undefined) {
            fields.push(`content = $${paramIndex}`);
            values.push(content);
            paramIndex++;
        }

        if (source !== undefined) {
            fields.push(`source = $${paramIndex}`);
            values.push(source);
            paramIndex++;
        }

        if (embedding) {
            fields.push(`embedding = $${paramIndex}::vector`);
            values.push(embedding);
            paramIndex++;
        }

        if (fields.length === 0) {
            throw new Error('没有提供更新字段');
        }

        values.push(id);
        const query = `
            UPDATE knowledge_chunks 
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        try {
            const result = await db.query(query, values);
            if (result.rows.length === 0) {
                throw new Error('知识片段不存在');
            }
            return result.rows[0];
        } catch (error) {
            console.error('❌ 更新知识片段失败:', error.message);
            throw error;
        }
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
            // 测试创建
            const testKnowledge = {
                user_id: '00000000-0000-0000-0000-000000000000', // 测试用户ID
                content: '这是一个测试知识片段',
                source: 'test'
            };

            const created = await this.create(testKnowledge);
            if (!created || !created.id) {
                throw new Error('创建知识片段失败');
            }

            // 测试语义搜索
            const searchResults = await this.semanticSearch('测试知识', null, 5);
            if (!Array.isArray(searchResults)) {
                throw new Error('语义搜索返回格式不正确');
            }

            // 清理测试数据
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