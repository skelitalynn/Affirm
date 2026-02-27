// 消息数据模型
const { db } = require('../db/connection');

class Message {
    static async create(messageData) {
        const { user_id, role, content, embedding, metadata } = messageData;
        const query = `
            INSERT INTO messages (user_id, role, content, embedding, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [user_id, role, content, embedding || null, metadata || null];
        
        const result = await db.query(query, values);
        return result.rows[0];
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

    static async semanticSearch(embedding, userId = null, limit = 10, similarityThreshold = 0.7) {
        let query = `
            SELECT *, 
                   (1 - (embedding <=> $1::vector)) as similarity
            FROM messages 
            WHERE (1 - (embedding <=> $1::vector)) > $2
        `;
        const values = [embedding, similarityThreshold];
        let paramIndex = 3;

        if (userId) {
            query += ` AND user_id = $${paramIndex}`;
            values.push(userId);
            paramIndex++;
        }

        query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
        values.push(limit);

        const result = await db.query(query, values);
        return result.rows;
    }

    static async getRecentConversation(userId, hours = 24) {
        const query = `
            SELECT * FROM messages 
            WHERE user_id = $1 
              AND created_at > NOW() - INTERVAL '${hours} hours'
            ORDER BY created_at ASC
        `;
        const result = await db.query(query, [userId]);
        return result.rows;
    }

    static async deleteByUserId(userId) {
        const query = 'DELETE FROM messages WHERE user_id = $1 RETURNING id';
        const result = await db.query(query, [userId]);
        return result.rows.length;
    }

    static async countByUserId(userId) {
        const query = 'SELECT COUNT(*) FROM messages WHERE user_id = $1';
        const result = await db.query(query, [userId]);
        return parseInt(result.rows[0].count, 10);
    }
}

module.exports = Message;
