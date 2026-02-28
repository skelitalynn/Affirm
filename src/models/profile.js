// 用户画像数据模型
const { db } = require('../db/connection');

class Profile {
    /**
     * 创建用户画像
     * @param {Object} profileData - 画像数据
     * @returns {Promise<Object>} 创建的画像
     */
    static async create(profileData) {
        const { user_id, goals, status, preferences } = profileData;
        const query = `
            INSERT INTO profiles (user_id, goals, status, preferences)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [user_id, goals, status, JSON.stringify(preferences || {})];
        
        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            if (error.code === '23505') { // 唯一约束冲突
                // 如果已有画像，返回现有画像
                const existing = await this.findByUserId(user_id);
                if (existing) {
                    return existing;
                }
            }
            throw error;
        }
    }

    /**
     * 根据用户ID查找画像
     * @param {string} userId - 用户UUID
     * @returns {Promise<Object|null>} 画像对象或null
     */
    static async findByUserId(userId) {
        const query = 'SELECT * FROM profiles WHERE user_id = $1';
        const result = await db.query(query, [userId]);
        return result.rows[0] || null;
    }

    /**
     * 根据用户ID查找或创建画像
     * @param {string} userId - 用户UUID
     * @param {Object} defaults - 默认值
     * @returns {Promise<Object>} 画像对象
     */
    static async findOrCreate(userId, defaults = {}) {
        const existing = await this.findByUserId(userId);
        if (existing) {
            return existing;
        }
        
        return await this.create({
            user_id: userId,
            goals: defaults.goals || '',
            status: defaults.status || 'active',
            preferences: defaults.preferences || {}
        });
    }

    /**
     * 更新用户画像
     * @param {string} userId - 用户UUID
     * @param {Object} updates - 更新字段
     * @returns {Promise<Object>} 更新后的画像
     */
    static async update(userId, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                if (key === 'preferences' && typeof value === 'object') {
                    fields.push(`${key} = $${paramIndex}`);
                    values.push(JSON.stringify(value));
                } else {
                    fields.push(`${key} = $${paramIndex}`);
                    values.push(value);
                }
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            throw new Error('没有提供更新字段');
        }

        values.push(userId);
        const query = `
            UPDATE profiles 
            SET ${fields.join(', ')}
            WHERE user_id = $${paramIndex}
            RETURNING *
        `;

        const result = await db.query(query, values);
        if (result.rows.length === 0) {
            throw new Error('用户画像不存在');
        }
        return result.rows[0];
    }

    /**
     * 删除用户画像
     * @param {string} userId - 用户UUID
     * @returns {Promise<boolean>} 是否删除成功
     */
    static async delete(userId) {
        const query = 'DELETE FROM profiles WHERE user_id = $1 RETURNING id';
        const result = await db.query(query, [userId]);
        return result.rows.length > 0;
    }

    /**
     * 获取所有画像
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 画像列表
     */
    static async findAll(limit = 100, offset = 0) {
        const query = `
            SELECT p.*, u.username, u.telegram_id 
            FROM profiles p
            LEFT JOIN users u ON p.user_id = u.id
            ORDER BY p.updated_at DESC 
            LIMIT $1 OFFSET $2
        `;
        const result = await db.query(query, [limit, offset]);
        return result.rows;
    }

    /**
     * 统计画像数量
     * @returns {Promise<number>} 画像数量
     */
    static async count() {
        const query = 'SELECT COUNT(*) FROM profiles';
        const result = await db.query(query);
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * 根据状态筛选画像
     * @param {string} status - 状态值
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 画像列表
     */
    static async findByStatus(status, limit = 100, offset = 0) {
        const query = `
            SELECT p.*, u.username, u.telegram_id 
            FROM profiles p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.status = $1
            ORDER BY p.updated_at DESC 
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [status, limit, offset]);
        return result.rows;
    }

    /**
     * 更新画像目标
     * @param {string} userId - 用户UUID
     * @param {string} goals - 新目标
     * @returns {Promise<Object>} 更新后的画像
     */
    static async updateGoals(userId, goals) {
        return await this.update(userId, { goals });
    }

    /**
     * 更新画像偏好
     * @param {string} userId - 用户UUID
     * @param {Object} preferences - 新偏好
     * @returns {Promise<Object>} 更新后的画像
     */
    static async updatePreferences(userId, preferences) {
        return await this.update(userId, { preferences });
    }

    /**
     * 更新画像状态
     * @param {string} userId - 用户UUID
     * @param {string} status - 新状态
     * @returns {Promise<Object>} 更新后的画像
     */
    static async updateStatus(userId, status) {
        return await this.update(userId, { status });
    }
}

module.exports = Profile;