// 消息数据模型
const { db } = require('../db/connection');
const embeddingService = require('../services/embedding');

class Message {
    /**
     * 创建消息（可选生成向量嵌入）
     * @param {Object} messageData - 消息数据
     * @returns {Promise<Object>} 创建的消息
     */
    static async create(messageData) {
        const { user_id, role, content, embedding, metadata } = messageData;
        
        let finalEmbedding = embedding;
        
        // 如果未提供嵌入且内容不为空，自动生成嵌入
        if (finalEmbedding === undefined && content && content.trim().length > 0) {
            try {
                finalEmbedding = await embeddingService.generateEmbedding(content);
            } catch (error) {
                console.error('❌ 生成消息向量嵌入失败:', error.message);
                // 嵌入生成失败，存储为NULL（禁用语义检索）
                finalEmbedding = null;
            }
        }

        // 处理嵌入格式：如果是数组，使用embeddingService转换为pgvector SQL格式
        let embeddingForQuery = null;
        if (finalEmbedding !== null && finalEmbedding !== undefined) {
            if (Array.isArray(finalEmbedding)) {
                // 使用embeddingService转换为pgvector SQL格式
                embeddingForQuery = embeddingService.toVectorSql(finalEmbedding);
            } else if (typeof finalEmbedding === 'string') {
                // 已经是字符串格式
                embeddingForQuery = finalEmbedding;
            } else {
                console.warn('⚠️ 未知的嵌入格式，存储为NULL:', typeof finalEmbedding);
                embeddingForQuery = null;
            }
        }

        const query = `
            INSERT INTO messages (user_id, role, content, embedding, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [user_id, role, content, embeddingForQuery, metadata || null];
        
        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('❌ 创建消息失败:', error.message);
            console.error('错误详情:', error.code, error.detail);
            throw error;
        }
    }

    static async findByUserId(userId, limit = 50, offset = 0) {
        const query = `
            SELECT * FROM messages 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [userId, limit, offset]);
        return result.rows;
    }

    /**
     * 语义搜索：根据向量查找相似消息
     * @param {Array<number>} embedding - 查询向量
     * @param {string} userId - 用户UUID（可选）
     * @param {number} limit - 返回数量
     * @param {number} similarityThreshold - 相似度阈值 (0-1)
     * @returns {Promise<Array>} 相似消息和分数
     */
    static async semanticSearch(embedding, userId = null, limit = 10, similarityThreshold = 0.7) {
        // 如果embedding为null，返回空数组（禁用语义检索）
        if (embedding === null) {
            console.log('ℹ️  向量嵌入不可用，语义搜索被禁用');
            return [];
        }
        
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error('查询向量必须是非空数组');
        }

        // 将向量数组转换为pgvector SQL格式
        const vectorSql = embeddingService.toVectorSql(embedding);
        if (!vectorSql) {
            console.warn('⚠️  无法转换向量格式，返回空数组');
            return [];
        }

        let query = `
            SELECT *, 
                   (1 - (embedding <=> $1::vector)) as similarity
            FROM messages 
            WHERE embedding IS NOT NULL 
            AND (1 - (embedding <=> $1::vector)) > $2
        `;
        const values = [vectorSql, similarityThreshold];
        let paramIndex = 3;

        if (userId) {
            query += ` AND user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
        values.push(limit);

        try {
            const result = await db.query(query, values);
            console.log(`🔍 语义搜索完成: 找到 ${result.rows.length} 条相关消息`);
            return result.rows;
        } catch (error) {
            console.error('❌ 语义搜索失败:', error.message);
            console.error('错误详情:', error.code);
            return [];
        }
    }

    /**
     * 文本语义搜索：根据查询文本查找相似消息
     * @param {string} queryText - 查询文本
     * @param {string} userId - 用户UUID（可选）
     * @param {number} limit - 返回数量
     * @param {number} similarityThreshold - 相似度阈值 (0-1)
     * @returns {Promise<Array>} 相似消息和分数（如果embedding不可用则返回空数组）
     */
    static async semanticSearchByText(queryText, userId = null, limit = 10, similarityThreshold = 0.7) {
        if (!queryText || queryText.trim().length === 0) {
            throw new Error('查询文本不能为空');
        }

        // 生成查询文本的向量嵌入
        const queryEmbedding = await embeddingService.generateEmbedding(queryText);
        
        // 如果embedding不可用（返回null），返回空数组
        if (queryEmbedding === null) {
            console.log('ℹ️  向量嵌入不可用，语义搜索被禁用');
            return [];
        }

        return await this.semanticSearch(queryEmbedding, userId, limit, similarityThreshold);
    }

    /**
     * 获取最近的对话记录
     * @param {string} userId - 用户UUID
     * @param {number} hours - 时间范围（小时）
     * @returns {Promise<Array>} 消息列表
     */
    static async getRecentConversation(userId, hours = 24) {
        // 强制转为整数，防止模板字面量 SQL 注入（2.7）
        const safeHours = Math.floor(Math.abs(Number(hours))) || 24;
        const query = `
            SELECT * FROM messages
            WHERE user_id = $1
              AND created_at > NOW() - ($2 * INTERVAL '1 hour')
            ORDER BY created_at ASC
        `;
        const result = await db.query(query, [userId, safeHours]);
        return result.rows;
    }

    /**
     * 根据ID查找消息
     * @param {string} id - 消息UUID
     * @returns {Promise<Object|null>} 消息或null
     */
    static async findById(id) {
        const query = 'SELECT * FROM messages WHERE id = $1';
        const result = await db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * 更新消息
     * @param {string} id - 消息UUID
     * @param {Object} updates - 更新字段
     * @returns {Promise<Object>} 更新后的消息
     */
    static async update(id, updates) {
        const { content, metadata } = updates;
        
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

        if (metadata !== undefined) {
            fields.push(`metadata = $${paramIndex}`);
            values.push(metadata);
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
            UPDATE messages 
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        try {
            const result = await db.query(query, values);
            if (result.rows.length === 0) {
                throw new Error('消息不存在');
            }
            return result.rows[0];
        } catch (error) {
            console.error('❌ 更新消息失败:', error.message);
            throw error;
        }
    }

    /**
     * 删除消息
     * @param {string} id - 消息UUID
     * @returns {Promise<boolean>} 是否删除成功
     */
    static async delete(id) {
        const query = 'DELETE FROM messages WHERE id = $1 RETURNING id';
        const result = await db.query(query, [id]);
        return result.rows.length > 0;
    }

    /**
     * 删除用户的所有消息
     * @param {string} userId - 用户UUID
     * @returns {Promise<number>} 删除的数量
     */
    static async deleteByUserId(userId) {
        const query = 'DELETE FROM messages WHERE user_id = $1 RETURNING id';
        const result = await db.query(query, [userId]);
        return result.rows.length;
    }

    /**
     * 统计消息数量
     * @param {string} userId - 用户UUID（可选）
     * @returns {Promise<number>} 消息数量
     */
    static async count(userId = null) {
        let query = 'SELECT COUNT(*) FROM messages';
        let values = [];

        if (userId) {
            query += ' WHERE user_id = $1';
            values = [userId];
        }

        const result = await db.query(query, values);
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * 获取所有消息
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 消息列表
     */
    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT m.*, u.username, u.telegram_id 
            FROM messages m
            LEFT JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at DESC 
            LIMIT $1 OFFSET $2
        `;
        const result = await db.query(query, [limit, offset]);
        return result.rows;
    }

    /**
     * 根据角色筛选消息
     * @param {string} role - 角色（user/assistant/system）
     * @param {string} userId - 用户UUID（可选）
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 消息列表
     */
    static async findByRole(role, userId = null, limit = 100, offset = 0) {
        let query = 'SELECT * FROM messages WHERE role = $1';
        const values = [role];
        let paramIndex = 2;

        if (userId) {
            query += ` AND user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await db.query(query, values);
        return result.rows;
    }

    /**
     * 获取用户最近的消息（用于embedding不可用时的fallback）
     * @param {string} userId - 用户UUID
     * @param {number} limit - 限制数量（默认20）
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 最近的消息列表
     */
    static async getRecentMessages(userId, limit = 20, offset = 0) {
        const query = `
            SELECT * FROM (
                SELECT * FROM messages
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            ) sub
            ORDER BY created_at ASC
        `;
        const result = await db.query(query, [userId, limit, offset]);
        return result.rows;
    }

    /**
     * 获取用户指定日期的消息（用于每日归档）
     * @param {string} userId - 用户UUID
     * @param {Date|string} date - 日期对象或日期字符串（如'2026-02-28'）
     * @returns {Promise<Array>} 指定日期的消息列表（按时间升序）
     */
    static async getDailyMessages(userId, date = new Date()) {
        // 确保date是Date对象
        const targetDate = date instanceof Date ? date : new Date(date);
        if (isNaN(targetDate.getTime())) {
            throw new Error('无效的日期格式');
        }
        
        // 计算当天的开始和结束时间（UTC）
        const startDate = new Date(Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            0, 0, 0, 0
        ));
        const endDate = new Date(Date.UTC(
            targetDate.getUTCFullYear(),
            targetDate.getUTCMonth(),
            targetDate.getUTCDate(),
            23, 59, 59, 999
        ));
        
        const query = `
            SELECT * FROM messages 
            WHERE user_id = $1
            AND created_at >= $2
            AND created_at <= $3
            ORDER BY created_at ASC
        `;
        const result = await db.query(query, [userId, startDate.toISOString(), endDate.toISOString()]);
        return result.rows;
    }

    /**
     * 测试消息功能
     * @returns {Promise<boolean>} 测试是否成功
     */
    static async test() {
        try {
            // 测试创建
            const testMessage = {
                user_id: '00000000-0000-0000-0000-000000000000', // 测试用户ID
                role: 'user',
                content: '这是一个测试消息',
                metadata: { test: true }
            };

            const created = await this.create(testMessage);
            if (!created || !created.id) {
                throw new Error('创建消息失败');
            }

            // 测试语义搜索
            const searchResults = await this.semanticSearchByText('测试消息', null, 5);
            if (!Array.isArray(searchResults)) {
                throw new Error('语义搜索返回格式不正确');
            }

            // 测试更新
            const updated = await this.update(created.id, { content: '更新后的测试消息' });
            if (!updated || updated.content !== '更新后的测试消息') {
                throw new Error('更新消息失败');
            }

            // 清理测试数据
            await this.delete(created.id);

            console.log('✅ 消息功能测试成功');
            console.log(`📊 语义搜索返回: ${searchResults.length} 个结果`);
            
            return true;
        } catch (error) {
            console.error('❌ 消息功能测试失败:', error.message);
            return false;
        }
    }
}

module.exports = Message;
