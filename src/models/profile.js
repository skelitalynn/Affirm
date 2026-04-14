// 用户画像数据模型
const { db } = require('../db/connection');

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringArray(value, maxItems = 10) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value
            .map((item) => String(item || '').trim())
            .filter(Boolean)
    )).slice(0, maxItems);
}

class Profile {
    static buildDefaultMemory() {
        return {
            memory_version: 1,
            summary: '',
            facts: [],
            communication_preferences: [],
            open_loops: [],
            legacy_preferences: {},
            last_updated_at: null
        };
    }

    static normalizeMemory(preferences) {
        const defaults = Profile.buildDefaultMemory();
        if (!isPlainObject(preferences)) {
            return { ...defaults };
        }

        const {
            memory_version,
            summary,
            facts,
            communication_preferences,
            open_loops,
            last_updated_at,
            legacy_preferences,
            ...rest
        } = preferences;

        return {
            memory_version: Number(memory_version) || 1,
            summary: typeof summary === 'string' ? summary.trim() : '',
            facts: normalizeStringArray(facts, 12),
            communication_preferences: normalizeStringArray(communication_preferences, 12),
            open_loops: normalizeStringArray(open_loops, 12),
            legacy_preferences: {
                ...(isPlainObject(legacy_preferences) ? legacy_preferences : {}),
                ...rest
            },
            last_updated_at: typeof last_updated_at === 'string' && last_updated_at.trim()
                ? last_updated_at.trim()
                : null
        };
    }

    static buildMemoryBlock(profile) {
        if (!profile) {
            return '';
        }

        const memory = Profile.normalizeMemory(profile.preferences);
        const lines = [];

        if (profile.goals && String(profile.goals).trim()) {
            lines.push(`- 长期目标: ${String(profile.goals).trim()}`);
        }

        if (profile.status && String(profile.status).trim()) {
            lines.push(`- 当前状态: ${String(profile.status).trim()}`);
        }

        if (memory.summary) {
            lines.push(`- 用户摘要: ${memory.summary}`);
        }

        if (memory.facts.length > 0) {
            lines.push(`- 稳定事实: ${memory.facts.join('；')}`);
        }

        if (memory.communication_preferences.length > 0) {
            lines.push(`- 沟通偏好: ${memory.communication_preferences.join('；')}`);
        }

        if (memory.open_loops.length > 0) {
            lines.push(`- 待跟进事项: ${memory.open_loops.join('；')}`);
        }

        const legacyPreferences = Object.keys(memory.legacy_preferences || {}).length > 0
            ? JSON.stringify(memory.legacy_preferences)
            : '';
        if (legacyPreferences) {
            lines.push(`- 其他历史偏好: ${legacyPreferences}`);
        }

        return lines.join('\n');
    }

    static mergeMemory(existingPreferences, patch = {}) {
        const existing = Profile.normalizeMemory(existingPreferences);
        const merged = {
            ...existing,
            summary: typeof patch.summary === 'string' && patch.summary.trim()
                ? patch.summary.trim()
                : existing.summary,
            facts: Array.from(new Set([
                ...existing.facts,
                ...normalizeStringArray(patch.facts, 12)
            ])).slice(0, 12),
            communication_preferences: Array.from(new Set([
                ...existing.communication_preferences,
                ...normalizeStringArray(patch.communication_preferences, 12)
            ])).slice(0, 12),
            open_loops: Array.from(new Set([
                ...normalizeStringArray(patch.open_loops, 12),
                ...existing.open_loops
            ])).slice(0, 12),
            last_updated_at: new Date().toISOString()
        };

        if (isPlainObject(patch.legacy_preferences)) {
            merged.legacy_preferences = {
                ...existing.legacy_preferences,
                ...patch.legacy_preferences
            };
        }

        return merged;
    }

    /**
     * 创建用户画像
     * @param {Object} profileData - 画像数据
     * @returns {Promise<Object>} 创建的画像
     */
    static async create(profileData) {
        const { user_id, goals, status, preferences } = profileData;
        const existing = await this.findByUserId(user_id);
        if (existing) {
            return existing;
        }

        const query = `
            INSERT INTO profiles (user_id, goals, status, preferences)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const preferencesValue = (preferences === undefined || preferences === null)
            ? null
            : JSON.stringify(isPlainObject(preferences) ? preferences : preferences);
        const values = [user_id, goals, status, preferencesValue];
        
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
     * 根据画像ID查找画像
     * @param {string} id - 画像UUID
     * @returns {Promise<Object|null>} 画像对象或null
     */
    static async findById(id) {
        const query = 'SELECT * FROM profiles WHERE id = $1';
        const result = await db.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * 根据用户ID查找画像
     * @param {string} userId - 用户UUID
     * @returns {Promise<Object|null>} 画像对象或null
     */
    static async findByUserId(userId) {
        const query = `
            SELECT *
            FROM profiles
            WHERE user_id = $1
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
        `;
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
            preferences: defaults.preferences || Profile.buildDefaultMemory()
        });
    }

    // 允许通过 update() 修改的字段白名单（防止 mass assignment 注入）
    static UPDATABLE_FIELDS = new Set(['goals', 'status', 'preferences']);

    /**
     * 更新用户画像
     * @param {string} userId - 用户UUID
     * @param {Object} updates - 更新字段
     * @returns {Promise<Object>} 更新后的画像
     */
    static async update(userId, updates) {
        const existing = await this.findByUserId(userId);
        if (!existing) {
            throw new Error('用户画像不存在');
        }

        const fields = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (!Profile.UPDATABLE_FIELDS.has(key)) {
                throw new Error(`不允许更新字段: ${key}`);
            }
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

        values.push(existing.id);
        const query = `
            UPDATE profiles 
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await db.query(query, values);
        return result.rows[0];
    }

    static async applyMemoryPatch(userId, patch = {}, defaults = {}) {
        const profile = await this.findOrCreate(userId, {
            status: defaults.status || 'active',
            goals: defaults.goals || '',
            preferences: defaults.preferences || Profile.buildDefaultMemory()
        });
        const nextGoals = typeof patch.goals === 'string' && patch.goals.trim()
            ? patch.goals.trim()
            : profile.goals;
        const nextStatus = typeof patch.status === 'string' && patch.status.trim()
            ? patch.status.trim()
            : (profile.status || defaults.status || 'active');
        const mergedMemory = Profile.mergeMemory(profile.preferences, patch);

        return this.update(userId, {
            goals: nextGoals,
            status: nextStatus,
            preferences: mergedMemory
        });
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
