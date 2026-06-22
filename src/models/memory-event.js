const { db } = require('../db/connection');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toVectorSql(embedding) {
    if (Array.isArray(embedding) && embedding.length > 0) {
        return `[${embedding.join(',')}]`;
    }

    if (typeof embedding === 'string' && embedding.trim()) {
        return embedding.trim();
    }

    return null;
}

function normalizeText(value, { required = false, field = '字段', maxLength = null } = {}) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (required && !normalized) {
        throw new Error(`${field} 不能为空`);
    }

    if (!normalized) {
        return '';
    }

    if (Number.isInteger(maxLength) && maxLength > 0) {
        return normalized.slice(0, maxLength);
    }

    return normalized;
}

function normalizeEnum(value, allowedValues = [], { fallback, required = false, field = '字段' } = {}) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized) {
        if (fallback !== undefined) {
            return fallback;
        }

        if (required) {
            throw new Error(`${field} 不能为空`);
        }

        return fallback;
    }

    if (!allowedValues.includes(normalized)) {
        throw new Error(`${field} 不合法: ${normalized}`);
    }

    return normalized;
}

function normalizeStringArray(value, maxItems = 12) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value
            .map((item) => String(item || '').trim())
            .filter(Boolean)
    )).slice(0, maxItems);
}

function normalizeUuid(value, { allowNull = true, field = '字段' } = {}) {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === '') {
        return allowNull ? null : undefined;
    }

    const normalized = String(value).trim();
    if (!UUID_PATTERN.test(normalized)) {
        throw new Error(`${field} 必须是有效 UUID`);
    }

    return normalized;
}

function normalizeUuidArray(value, maxItems = 20) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value
            .map((item) => String(item || '').trim())
            .filter((item) => UUID_PATTERN.test(item))
    )).slice(0, maxItems);
}

function normalizeScore(value, fallback = 0.5) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(0, Math.min(1, Number(parsed.toFixed(3))));
}

function normalizeInteger(value, fallback = 0, min = 0) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, parsed);
}

function normalizeTimestamp(value, { allowNull = true, field = '时间' } = {}) {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === '') {
        return allowNull ? null : undefined;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${field} 格式无效`);
    }

    return date.toISOString();
}

function normalizeStringArrayLowercase(value, maxItems = 12) {
    return Array.from(new Set(
        normalizeStringArray(value, maxItems)
            .map((item) => item.toLowerCase())
            .filter(Boolean)
    )).slice(0, maxItems);
}

function normalizeNumericField(value) {
    if (value === null || value === undefined || value === '') {
        return value ?? null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
}

function hydrateRow(row) {
    if (!row || typeof row !== 'object') {
        return row;
    }

    const hydrated = { ...row };

    if (Object.prototype.hasOwnProperty.call(row, 'importance')) {
        hydrated.importance = normalizeNumericField(row.importance);
    }

    if (Object.prototype.hasOwnProperty.call(row, 'confidence')) {
        hydrated.confidence = normalizeNumericField(row.confidence);
    }

    if (Object.prototype.hasOwnProperty.call(row, 'recall_count')) {
        hydrated.recall_count = Number.isFinite(Number(row.recall_count))
            ? Number(row.recall_count)
            : row.recall_count;
    }

    if (Object.prototype.hasOwnProperty.call(row, 'vector_score')) {
        hydrated.vector_score = normalizeNumericField(row.vector_score);
    }

    if (Object.prototype.hasOwnProperty.call(row, 'keyword_score')) {
        hydrated.keyword_score = normalizeNumericField(row.keyword_score);
    }

    if (Object.prototype.hasOwnProperty.call(row, 'final_score')) {
        hydrated.final_score = normalizeNumericField(row.final_score);
    }

    if (Object.prototype.hasOwnProperty.call(row, 'rerank_score')) {
        hydrated.rerank_score = normalizeNumericField(row.rerank_score);
    }

    if (Object.prototype.hasOwnProperty.call(row, 'recency_score')) {
        hydrated.recency_score = normalizeNumericField(row.recency_score);
    }

    if (Object.prototype.hasOwnProperty.call(row, 'event_type_boost')) {
        hydrated.event_type_boost = normalizeNumericField(row.event_type_boost);
    }

    return hydrated;
}

class MemoryEvent {
    static EVENT_TYPES = [
        'goal_progress',
        'breakthrough',
        'setback',
        'commitment',
        'fear_pattern',
        'belief_shift',
        'preference_signal',
        'relationship_context'
    ];

    static STATUS_VALUES = [
        'active',
        'suppressed',
        'merged',
        'archived'
    ];

    static REVIEW_STATUS_VALUES = [
        'pending',
        'verified',
        'edited',
        'rejected'
    ];

    static buildGovernanceMetadata(metadata = {}, updates = {}) {
        const baseMetadata = isPlainObject(metadata) ? { ...metadata } : {};
        const existingGovernance = isPlainObject(baseMetadata.governance)
            ? { ...baseMetadata.governance }
            : {};
        const nextGovernance = { ...existingGovernance };

        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined) {
                return;
            }

            if (key === 'merged_from_event_ids') {
                const mergedFromIds = normalizeUuidArray([
                    ...(Array.isArray(existingGovernance.merged_from_event_ids) ? existingGovernance.merged_from_event_ids : []),
                    ...(Array.isArray(value) ? value : [])
                ], 50);

                if (mergedFromIds.length > 0) {
                    nextGovernance.merged_from_event_ids = mergedFromIds;
                }
                return;
            }

            nextGovernance[key] = value;
        });

        return {
            ...baseMetadata,
            governance: nextGovernance
        };
    }

    static normalizeEventData(eventData = {}, { partial = false } = {}) {
        const normalized = {};

        if (!partial || eventData.user_id !== undefined) {
            const userId = String(eventData.user_id || '').trim();
            if (!UUID_PATTERN.test(userId)) {
                throw new Error('user_id 必须是有效 UUID');
            }
            normalized.user_id = userId;
        }

        if (!partial || eventData.event_type !== undefined) {
            normalized.event_type = normalizeText(eventData.event_type, {
                required: !partial,
                field: 'event_type',
                maxLength: 50
            });
        }

        if (!partial || eventData.title !== undefined) {
            normalized.title = normalizeText(eventData.title, {
                required: !partial,
                field: 'title',
                maxLength: 160
            });
        }

        if (!partial || eventData.summary !== undefined) {
            normalized.summary = normalizeText(eventData.summary, {
                required: !partial,
                field: 'summary',
                maxLength: 600
            });
        }

        if (!partial || eventData.detail !== undefined) {
            normalized.detail = normalizeText(eventData.detail, {
                required: false,
                field: 'detail',
                maxLength: 4000
            });
        }

        if (!partial || eventData.keywords !== undefined) {
            normalized.keywords = normalizeStringArray(eventData.keywords, 16);
        }

        if (!partial || eventData.source_message_ids !== undefined) {
            normalized.source_message_ids = normalizeUuidArray(eventData.source_message_ids, 20);
        }

        if (!partial || eventData.importance !== undefined) {
            normalized.importance = normalizeScore(eventData.importance, 0.5);
        }

        if (!partial || eventData.confidence !== undefined) {
            normalized.confidence = normalizeScore(eventData.confidence, 0.5);
        }

        if (!partial || eventData.happened_at !== undefined) {
            normalized.happened_at = normalizeTimestamp(eventData.happened_at, {
                allowNull: true,
                field: 'happened_at'
            });
        }

        if (!partial || eventData.last_recalled_at !== undefined) {
            normalized.last_recalled_at = normalizeTimestamp(eventData.last_recalled_at, {
                allowNull: true,
                field: 'last_recalled_at'
            });
        }

        if (!partial || eventData.recall_count !== undefined) {
            normalized.recall_count = normalizeInteger(eventData.recall_count, 0, 0);
        }

        if (!partial || eventData.status !== undefined) {
            normalized.status = normalizeEnum(eventData.status, MemoryEvent.STATUS_VALUES, {
                fallback: 'active',
                required: !partial,
                field: 'status'
            });
        }

        if (!partial || eventData.review_status !== undefined) {
            normalized.review_status = normalizeEnum(eventData.review_status, MemoryEvent.REVIEW_STATUS_VALUES, {
                fallback: 'pending',
                required: !partial,
                field: 'review_status'
            });
        }

        if (!partial || eventData.merged_into_event_id !== undefined) {
            normalized.merged_into_event_id = normalizeUuid(eventData.merged_into_event_id, {
                allowNull: true,
                field: 'merged_into_event_id'
            });
        }

        if (!partial || eventData.last_reviewed_at !== undefined) {
            normalized.last_reviewed_at = normalizeTimestamp(eventData.last_reviewed_at, {
                allowNull: true,
                field: 'last_reviewed_at'
            });
        }

        if (!partial || eventData.embedding !== undefined) {
            normalized.embedding = eventData.embedding === null
                ? null
                : toVectorSql(eventData.embedding);
        }

        if (!partial || eventData.metadata !== undefined) {
            normalized.metadata = isPlainObject(eventData.metadata) ? { ...eventData.metadata } : {};
        }

        return normalized;
    }

    static async create(eventData = {}) {
        const normalized = MemoryEvent.normalizeEventData(eventData);

        const result = await db.query(`
            INSERT INTO memory_events (
                user_id,
                event_type,
                title,
                summary,
                detail,
                keywords,
                source_message_ids,
                importance,
                confidence,
                happened_at,
                last_recalled_at,
                recall_count,
                status,
                review_status,
                merged_into_event_id,
                last_reviewed_at,
                embedding,
                metadata
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6::text[],
                $7::uuid[],
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15,
                $16,
                $17::vector,
                $18::jsonb
            )
            RETURNING *
        `, [
            normalized.user_id,
            normalized.event_type,
            normalized.title,
            normalized.summary,
            normalized.detail,
            normalized.keywords,
            normalized.source_message_ids,
            normalized.importance,
            normalized.confidence,
            normalized.happened_at || null,
            normalized.last_recalled_at || null,
            normalized.recall_count,
            normalized.status,
            normalized.review_status,
            normalized.merged_into_event_id || null,
            normalized.last_reviewed_at || null,
            normalized.embedding,
            JSON.stringify(normalized.metadata)
        ]);

        return hydrateRow(result.rows[0]);
    }

    static async findById(id) {
        const result = await db.query(`
            SELECT *
            FROM memory_events
            WHERE id = $1
        `, [id]);

        return hydrateRow(result.rows[0]) || null;
    }

    static async findByIds(ids = []) {
        const normalizedIds = normalizeUuidArray(ids, 100);
        if (normalizedIds.length === 0) {
            return [];
        }

        const result = await db.query(`
            SELECT *
            FROM memory_events
            WHERE id = ANY($1::uuid[])
        `, [normalizedIds]);

        const order = new Map(normalizedIds.map((id, index) => [id, index]));
        return result.rows
            .map(hydrateRow)
            .sort((left, right) => {
                const leftIndex = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
                const rightIndex = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
                return leftIndex - rightIndex;
            });
    }

    static async count(options = {}) {
        const clauses = [];
        const values = [];
        let paramIndex = 1;

        if (options.userId) {
            const normalizedUserId = String(options.userId || '').trim();
            if (!UUID_PATTERN.test(normalizedUserId)) {
                throw new Error('userId 必须是有效 UUID');
            }
            clauses.push(`user_id = $${paramIndex}`);
            values.push(normalizedUserId);
            paramIndex += 1;
        }

        if (options.eventType) {
            clauses.push(`event_type = $${paramIndex}`);
            values.push(normalizeText(options.eventType, { field: 'eventType', maxLength: 50 }));
            paramIndex += 1;
        }

        if (options.recalledOnly) {
            clauses.push('recall_count > 0');
        }

        if (options.status) {
            clauses.push(`status = $${paramIndex}`);
            values.push(normalizeEnum(options.status, MemoryEvent.STATUS_VALUES, {
                field: 'status'
            }));
            paramIndex += 1;
        }

        if (options.reviewStatus) {
            clauses.push(`review_status = $${paramIndex}`);
            values.push(normalizeEnum(options.reviewStatus, MemoryEvent.REVIEW_STATUS_VALUES, {
                field: 'reviewStatus'
            }));
            paramIndex += 1;
        }

        const whereClause = clauses.length > 0
            ? `WHERE ${clauses.join(' AND ')}`
            : '';

        const result = await db.query(`
            SELECT COUNT(*)::int AS count
            FROM memory_events
            ${whereClause}
        `, values);

        return result.rows[0]?.count || 0;
    }

    static async findByUserId(userId, options = {}) {
        const normalizedUserId = String(userId || '').trim();
        if (!UUID_PATTERN.test(normalizedUserId)) {
            throw new Error('userId 必须是有效 UUID');
        }

        const clauses = ['me.user_id = $1'];
        const values = [normalizedUserId];
        let paramIndex = 2;

        if (options.eventType) {
            clauses.push(`me.event_type = $${paramIndex}`);
            values.push(String(options.eventType).trim());
            paramIndex += 1;
        }

        if (options.status) {
            clauses.push(`me.status = $${paramIndex}`);
            values.push(normalizeEnum(options.status, MemoryEvent.STATUS_VALUES, {
                field: 'status'
            }));
            paramIndex += 1;
        }

        if (options.reviewStatus) {
            clauses.push(`me.review_status = $${paramIndex}`);
            values.push(normalizeEnum(options.reviewStatus, MemoryEvent.REVIEW_STATUS_VALUES, {
                field: 'reviewStatus'
            }));
            paramIndex += 1;
        }

        const limit = normalizeInteger(options.limit, 20, 1);
        const offset = normalizeInteger(options.offset, 0, 0);
        values.push(limit, offset);

        const result = await db.query(`
            SELECT
                me.*,
                merged_target.title AS merged_into_title
            FROM memory_events me
            LEFT JOIN memory_events merged_target ON merged_target.id = me.merged_into_event_id
            WHERE ${clauses.join(' AND ')}
            ORDER BY COALESCE(me.happened_at, me.created_at) DESC, me.importance DESC, me.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, values);

        return result.rows.map(hydrateRow);
    }

    static async findAll(options = {}) {
        const clauses = [];
        const values = [];
        let paramIndex = 1;

        if (options.userId) {
            const normalizedUserId = String(options.userId || '').trim();
            if (!UUID_PATTERN.test(normalizedUserId)) {
                throw new Error('userId 必须是有效 UUID');
            }
            clauses.push(`me.user_id = $${paramIndex}`);
            values.push(normalizedUserId);
            paramIndex += 1;
        }

        if (options.eventType) {
            clauses.push(`me.event_type = $${paramIndex}`);
            values.push(normalizeText(options.eventType, { field: 'eventType', maxLength: 50 }));
            paramIndex += 1;
        }

        const normalizedSearch = normalizeText(options.search, { field: 'search', maxLength: 120 });
        if (normalizedSearch) {
            clauses.push(`(
                me.title ILIKE $${paramIndex}
                OR me.summary ILIKE $${paramIndex}
                OR me.detail ILIKE $${paramIndex}
                OR array_to_string(me.keywords, ' ') ILIKE $${paramIndex}
                OR COALESCE(u.username, '') ILIKE $${paramIndex}
            )`);
            values.push(`%${normalizedSearch}%`);
            paramIndex += 1;
        }

        if (options.recalledOnly) {
            clauses.push('me.recall_count > 0');
        }

        if (options.status) {
            clauses.push(`me.status = $${paramIndex}`);
            values.push(normalizeEnum(options.status, MemoryEvent.STATUS_VALUES, {
                field: 'status'
            }));
            paramIndex += 1;
        }

        if (options.reviewStatus) {
            clauses.push(`me.review_status = $${paramIndex}`);
            values.push(normalizeEnum(options.reviewStatus, MemoryEvent.REVIEW_STATUS_VALUES, {
                field: 'reviewStatus'
            }));
            paramIndex += 1;
        }

        const limit = normalizeInteger(options.limit, 50, 1);
        const offset = normalizeInteger(options.offset, 0, 0);
        const whereClause = clauses.length > 0
            ? `WHERE ${clauses.join(' AND ')}`
            : '';

        values.push(limit, offset);

        const result = await db.query(`
            SELECT
                me.*,
                u.username,
                u.telegram_id,
                merged_target.title AS merged_into_title
            FROM memory_events me
            LEFT JOIN users u ON u.id = me.user_id
            LEFT JOIN memory_events merged_target ON merged_target.id = me.merged_into_event_id
            ${whereClause}
            ORDER BY COALESCE(me.happened_at, me.created_at) DESC, me.importance DESC, me.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, values);

        return result.rows.map(hydrateRow);
    }

    static async update(id, updates = {}) {
        const existing = await MemoryEvent.findById(id);
        if (!existing) {
            throw new Error('memory event 不存在');
        }

        const normalized = MemoryEvent.normalizeEventData(updates, { partial: true });
        const fields = [];
        const values = [];
        let paramIndex = 1;

        const assign = (field, value, cast = '') => {
            fields.push(`${field} = $${paramIndex}${cast}`);
            values.push(value);
            paramIndex += 1;
        };

        if (normalized.event_type !== undefined) {
            assign('event_type', normalized.event_type);
        }

        if (normalized.title !== undefined) {
            assign('title', normalized.title);
        }

        if (normalized.summary !== undefined) {
            assign('summary', normalized.summary);
        }

        if (normalized.detail !== undefined) {
            assign('detail', normalized.detail);
        }

        if (normalized.keywords !== undefined) {
            assign('keywords', normalized.keywords, '::text[]');
        }

        if (normalized.source_message_ids !== undefined) {
            assign('source_message_ids', normalized.source_message_ids, '::uuid[]');
        }

        if (normalized.importance !== undefined) {
            assign('importance', normalized.importance);
        }

        if (normalized.confidence !== undefined) {
            assign('confidence', normalized.confidence);
        }

        if (normalized.happened_at !== undefined) {
            assign('happened_at', normalized.happened_at);
        }

        if (normalized.last_recalled_at !== undefined) {
            assign('last_recalled_at', normalized.last_recalled_at);
        }

        if (normalized.recall_count !== undefined) {
            assign('recall_count', normalized.recall_count);
        }

        if (normalized.status !== undefined) {
            assign('status', normalized.status);
        }

        if (normalized.review_status !== undefined) {
            assign('review_status', normalized.review_status);
        }

        if (normalized.merged_into_event_id !== undefined) {
            if (normalized.merged_into_event_id === null) {
                fields.push('merged_into_event_id = NULL');
            } else {
                assign('merged_into_event_id', normalized.merged_into_event_id);
            }
        }

        if (normalized.last_reviewed_at !== undefined) {
            assign('last_reviewed_at', normalized.last_reviewed_at);
        }

        if (normalized.embedding !== undefined) {
            if (normalized.embedding === null) {
                fields.push('embedding = NULL');
            } else {
                assign('embedding', normalized.embedding, '::vector');
            }
        }

        if (normalized.metadata !== undefined) {
            assign('metadata', JSON.stringify(normalized.metadata), '::jsonb');
        }

        if (fields.length === 0) {
            throw new Error('没有提供更新字段');
        }

        values.push(id);
        const result = await db.query(`
            UPDATE memory_events
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, values);

        return hydrateRow(result.rows[0]);
    }

    static async delete(id) {
        const result = await db.query(`
            DELETE FROM memory_events
            WHERE id = $1
            RETURNING id
        `, [id]);

        return result.rows.length > 0;
    }

    static async markRecalled(id, recalledAt = new Date()) {
        const timestamp = normalizeTimestamp(recalledAt, {
            allowNull: false,
            field: 'recalledAt'
        });

        const result = await db.query(`
            UPDATE memory_events
            SET recall_count = recall_count + 1,
                last_recalled_at = $1
            WHERE id = $2
            RETURNING *
        `, [timestamp, id]);

        if (result.rows.length === 0) {
            throw new Error('memory event 不存在');
        }

        return hydrateRow(result.rows[0]);
    }

    static async markManyRecalled(ids = [], recalledAt = new Date()) {
        const normalizedIds = Array.from(new Set(
            Array.isArray(ids)
                ? ids.map((id) => String(id || '').trim()).filter(Boolean)
                : []
        ));

        if (normalizedIds.length === 0) {
            return [];
        }

        const timestamp = normalizeTimestamp(recalledAt, {
            allowNull: false,
            field: 'recalledAt'
        });

        const result = await db.query(`
            UPDATE memory_events
            SET recall_count = recall_count + 1,
                last_recalled_at = $1
            WHERE id = ANY($2::uuid[])
            RETURNING *
        `, [timestamp, normalizedIds]);

        return result.rows.map(hydrateRow);
    }

    static async suppress(id, { actor = 'admin', reason = 'manual_review' } = {}) {
        const existing = await MemoryEvent.findById(id);
        if (!existing) {
            throw new Error('memory event 不存在');
        }

        const metadata = MemoryEvent.buildGovernanceMetadata(existing.metadata, {
            last_action: 'suppress',
            last_reason: reason,
            last_actor: actor,
            last_action_at: new Date().toISOString()
        });

        return MemoryEvent.update(id, {
            status: 'suppressed',
            metadata
        });
    }

    static async restore(id, { actor = 'admin', reason = 'manual_restore' } = {}) {
        const existing = await MemoryEvent.findById(id);
        if (!existing) {
            throw new Error('memory event 不存在');
        }

        if (existing.status === 'merged') {
            throw new Error('merged 状态的 memory event 不能直接 restore，请重新选择 canonical event');
        }

        const metadata = MemoryEvent.buildGovernanceMetadata(existing.metadata, {
            last_action: 'restore',
            last_reason: reason,
            last_actor: actor,
            last_action_at: new Date().toISOString()
        });

        return MemoryEvent.update(id, {
            status: 'active',
            merged_into_event_id: null,
            metadata
        });
    }

    static async setReviewStatus(id, reviewStatus, { actor = 'admin', reason = 'manual_review' } = {}) {
        const existing = await MemoryEvent.findById(id);
        if (!existing) {
            throw new Error('memory event 不存在');
        }

        const normalizedReviewStatus = normalizeEnum(reviewStatus, MemoryEvent.REVIEW_STATUS_VALUES, {
            required: true,
            field: 'review_status'
        });
        const reviewedAt = new Date().toISOString();
        const metadata = MemoryEvent.buildGovernanceMetadata(existing.metadata, {
            last_action: `review_${normalizedReviewStatus}`,
            last_reason: reason,
            last_actor: actor,
            last_action_at: reviewedAt
        });

        return MemoryEvent.update(id, {
            review_status: normalizedReviewStatus,
            last_reviewed_at: reviewedAt,
            metadata
        });
    }

    static async mergeInto(id, canonicalEventId, { actor = 'admin', reason = 'duplicate_event' } = {}) {
        const sourceId = normalizeUuid(id, {
            allowNull: false,
            field: 'id'
        });
        const targetId = normalizeUuid(canonicalEventId, {
            allowNull: false,
            field: 'canonicalEventId'
        });

        if (sourceId === targetId) {
            throw new Error('不能将 memory event 合并到自己');
        }

        const mergedAt = new Date().toISOString();

        return db.transaction(async (client) => {
            const sourceResult = await client.query(`
                SELECT *
                FROM memory_events
                WHERE id = $1
                FOR UPDATE
            `, [sourceId]);
            const targetResult = await client.query(`
                SELECT *
                FROM memory_events
                WHERE id = $1
                FOR UPDATE
            `, [targetId]);

            const source = hydrateRow(sourceResult.rows[0]) || null;
            const target = hydrateRow(targetResult.rows[0]) || null;

            if (!source) {
                throw new Error('待合并的 memory event 不存在');
            }

            if (!target) {
                throw new Error('目标 canonical memory event 不存在');
            }

            if (source.user_id !== target.user_id) {
                throw new Error('只能合并同一用户的 memory event');
            }

            if (target.status !== 'active') {
                throw new Error('目标 canonical memory event 必须处于 active 状态');
            }

            const targetMetadata = MemoryEvent.buildGovernanceMetadata(target.metadata, {
                last_action: 'merge_target',
                last_reason: reason,
                last_actor: actor,
                last_action_at: mergedAt,
                merged_from_event_ids: [source.id]
            });
            const sourceMetadata = MemoryEvent.buildGovernanceMetadata(source.metadata, {
                last_action: 'merge',
                last_reason: reason,
                last_actor: actor,
                last_action_at: mergedAt,
                canonical_event_id: target.id
            });
            const mergedKeywords = normalizeStringArray([
                ...(Array.isArray(target.keywords) ? target.keywords : []),
                ...(Array.isArray(source.keywords) ? source.keywords : [])
            ], 16);
            const mergedSourceMessageIds = normalizeUuidArray([
                ...(Array.isArray(target.source_message_ids) ? target.source_message_ids : []),
                ...(Array.isArray(source.source_message_ids) ? source.source_message_ids : [])
            ], 20);

            const updatedTargetResult = await client.query(`
                UPDATE memory_events
                SET keywords = $1::text[],
                    source_message_ids = $2::uuid[],
                    importance = GREATEST(importance, $3),
                    confidence = GREATEST(confidence, $4),
                    metadata = $5::jsonb
                WHERE id = $6
                RETURNING *
            `, [
                mergedKeywords,
                mergedSourceMessageIds,
                normalizeScore(source.importance, 0.5),
                normalizeScore(source.confidence, 0.5),
                JSON.stringify(targetMetadata),
                target.id
            ]);
            const updatedSourceResult = await client.query(`
                UPDATE memory_events
                SET status = 'merged',
                    review_status = 'verified',
                    merged_into_event_id = $1,
                    last_reviewed_at = $2,
                    metadata = $3::jsonb
                WHERE id = $4
                RETURNING *
            `, [
                target.id,
                mergedAt,
                JSON.stringify(sourceMetadata),
                source.id
            ]);

            return {
                target: hydrateRow(updatedTargetResult.rows[0]),
                source: hydrateRow(updatedSourceResult.rows[0])
            };
        });
    }

    static buildSearchText(event = {}) {
        const title = typeof event.title === 'string' ? event.title.trim() : '';
        const summary = typeof event.summary === 'string' ? event.summary.trim() : '';
        const detail = typeof event.detail === 'string' ? event.detail.trim() : '';
        const keywords = normalizeStringArray(event.keywords, 16);

        return [title, summary, detail, keywords.join(' ')].filter(Boolean).join('\n');
    }

    static async searchHybrid({
        userId,
        queryText,
        queryEmbedding = null,
        queryTerms = [],
        limit = 5,
        eventTypes = [],
        vectorWeight = 0.7,
        keywordWeight = 0.3,
        minScore = 0.15
    } = {}) {
        const normalizedUserId = String(userId || '').trim();
        if (!UUID_PATTERN.test(normalizedUserId)) {
            throw new Error('userId 必须是有效 UUID');
        }

        const normalizedQueryText = normalizeText(queryText, {
            required: true,
            field: 'queryText',
            maxLength: 500
        });
        const normalizedTerms = normalizeStringArrayLowercase(queryTerms, 12);
        const normalizedEventTypes = normalizeStringArray(eventTypes, 12);
        const safeLimit = normalizeInteger(limit, 5, 1);
        const safeVectorWeight = normalizeScore(vectorWeight, 0.7);
        const safeKeywordWeight = normalizeScore(keywordWeight, 0.3);
        const safeMinScore = normalizeScore(minScore, 0.15);
        const normalizedEmbedding = queryEmbedding ? toVectorSql(queryEmbedding) : null;

        const values = [
            normalizedUserId,
            normalizedEmbedding,
            normalizedQueryText,
            normalizedTerms,
            safeVectorWeight,
            safeKeywordWeight,
            safeMinScore
        ];
        let paramIndex = values.length + 1;
        let eventTypeClause = '';

        if (normalizedEventTypes.length > 0) {
            eventTypeClause = ` AND event_type = ANY($${paramIndex}::text[])`;
            values.push(normalizedEventTypes);
            paramIndex += 1;
        }

        values.push(safeLimit);

        const result = await db.query(`
            WITH candidate_events AS (
                SELECT
                    me.*,
                    lower(concat_ws(' ', me.title, me.summary, me.detail, array_to_string(me.keywords, ' '))) AS search_text
                FROM memory_events me
                WHERE me.user_id = $1
                  AND me.status = 'active'
                  AND me.merged_into_event_id IS NULL
                ${eventTypeClause}
            ),
            scored_events AS (
                SELECT
                    candidate_events.*,
                    CASE
                        WHEN $2::vector IS NULL OR candidate_events.embedding IS NULL THEN 0
                        ELSE GREATEST(0, 1 - (candidate_events.embedding <=> $2::vector))
                    END AS vector_score,
                    CASE
                        WHEN COALESCE($3, '') = '' THEN 0
                        ELSE LEAST(
                            1,
                            CASE
                                WHEN candidate_events.search_text LIKE '%' || lower($3) || '%' THEN 0.4
                                ELSE 0
                            END
                            + CASE
                                WHEN COALESCE(array_length($4::text[], 1), 0) = 0 THEN 0
                                ELSE COALESCE((
                                    SELECT COUNT(*)::float / GREATEST(array_length($4::text[], 1), 1)
                                    FROM unnest($4::text[]) AS term
                                    WHERE term <> ''
                                      AND (
                                          candidate_events.search_text LIKE '%' || term || '%'
                                          OR EXISTS (
                                              SELECT 1
                                              FROM unnest(candidate_events.keywords) AS keyword
                                              WHERE lower(keyword) = term
                                          )
                                      )
                                ), 0) * 0.6
                            END
                        )
                    END AS keyword_score
                FROM candidate_events
            )
            SELECT
                scored_events.*,
                (($5 * scored_events.vector_score) + ($6 * scored_events.keyword_score)) AS final_score
            FROM scored_events
            WHERE (($5 * scored_events.vector_score) + ($6 * scored_events.keyword_score)) >= $7
            ORDER BY final_score DESC, importance DESC, confidence DESC, COALESCE(happened_at, created_at) DESC
            LIMIT $${paramIndex}
        `, values);

        return result.rows.map(hydrateRow);
    }

    static buildPromptBlock(events = [], limit = 5) {
        if (!Array.isArray(events) || events.length === 0) {
            return '';
        }

        return events
            .slice(0, Math.max(1, limit))
            .map((event, index) => {
                const parts = [
                    `${index + 1}. [${event.event_type || 'memory'}] ${String(event.title || '').trim()}`,
                    `摘要: ${String(event.summary || '').trim()}`
                ];

                const keywords = normalizeStringArray(event.keywords, 8);
                if (keywords.length > 0) {
                    parts.push(`关键词: ${keywords.join(' / ')}`);
                }

                return parts.join('\n');
            })
            .join('\n\n');
    }
}

module.exports = MemoryEvent;
