// 用户数据模型
const { db } = require('../db/connection');

class User {
    static async create(userData) {
        const { telegram_id, username } = userData;
        const query = `
            INSERT INTO users (telegram_id, username)
            VALUES ($1, $2)
            RETURNING *
        `;
        const values = [telegram_id, username];
        
        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            if (error.code === '23505') {
                return await this.findByTelegramId(telegram_id);
            }
            throw error;
        }
    }

    static async findByTelegramId(telegramId) {
        const query = 'SELECT * FROM users WHERE telegram_id = $1';
        const result = await db.query(query, [telegramId]);
        return result.rows[0] || null;
    }

    static async update(telegramId, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            throw new Error('没有提供更新字段');
        }

        values.push(telegramId);
        const query = `
            UPDATE users 
            SET ${fields.join(', ')}
            WHERE telegram_id = $${paramIndex}
            RETURNING *
        `;

        const result = await db.query(query, values);
        if (result.rows.length === 0) {
            throw new Error('用户不存在');
        }
        return result.rows[0];
    }

    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT * FROM users 
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `;
        const result = await db.query(query, [limit, offset]);
        return result.rows;
    }

    static async delete(telegramId) {
        const query = 'DELETE FROM users WHERE telegram_id = $1 RETURNING id';
        const result = await db.query(query, [telegramId]);
        return result.rows.length > 0;
    }

    static async count() {
        const query = 'SELECT COUNT(*) FROM users';
        const result = await db.query(query);
        return parseInt(result.rows[0].count, 10);
    }
}

module.exports = User;
