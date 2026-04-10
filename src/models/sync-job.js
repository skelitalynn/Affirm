const { db } = require('../db/connection');

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDetails(details = {}) {
    return isPlainObject(details) ? details : {};
}

function normalizeInteger(value, fallback, min = 0) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, parsed);
}

class SyncJob {
    static async create(jobData = {}) {
        const {
            job_type,
            date_key = null,
            status = 'pending',
            details = {}
        } = jobData;

        if (!job_type || !String(job_type).trim()) {
            throw new Error('job_type 不能为空');
        }

        const result = await db.query(`
            INSERT INTO sync_jobs (job_type, date_key, status, details)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING *
        `, [
            String(job_type).trim(),
            date_key,
            status,
            JSON.stringify(normalizeDetails(details))
        ]);

        return result.rows[0];
    }

    static async findById(id) {
        const result = await db.query('SELECT * FROM sync_jobs WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    static async update(id, updates = {}) {
        const existing = await SyncJob.findById(id);
        if (!existing) {
            throw new Error('同步任务不存在');
        }

        const nextStatus = updates.status || existing.status;
        const nextDetails = updates.details !== undefined
            ? normalizeDetails(updates.details)
            : normalizeDetails(existing.details);
        const shouldMarkCompleted = updates.completed === true || nextStatus === 'completed' || nextStatus === 'failed';

        const result = await db.query(`
            UPDATE sync_jobs
            SET status = $1,
                details = $2::jsonb,
                completed_at = $3
            WHERE id = $4
            RETURNING *
        `, [
            nextStatus,
            JSON.stringify(nextDetails),
            shouldMarkCompleted ? new Date().toISOString() : null,
            id
        ]);

        return result.rows[0];
    }

    static async markProcessing(id, details = {}) {
        const existing = await SyncJob.findById(id);
        return SyncJob.update(id, {
            status: 'processing',
            details: {
                ...normalizeDetails(existing?.details),
                ...normalizeDetails(details)
            }
        });
    }

    static async markCompleted(id, details = {}) {
        const existing = await SyncJob.findById(id);
        return SyncJob.update(id, {
            status: 'completed',
            completed: true,
            details: {
                ...normalizeDetails(existing?.details),
                ...normalizeDetails(details)
            }
        });
    }

    static async markFailed(id, error, details = {}) {
        const existing = await SyncJob.findById(id);
        return SyncJob.update(id, {
            status: 'failed',
            completed: true,
            details: {
                ...normalizeDetails(existing?.details),
                ...normalizeDetails(details),
                error_message: String(error?.message || error || '').trim()
            }
        });
    }

    static async count(filters = {}) {
        const clauses = [];
        const values = [];
        let paramIndex = 1;

        if (filters.status) {
            clauses.push(`status = $${paramIndex}`);
            values.push(filters.status);
            paramIndex += 1;
        }

        if (filters.jobType) {
            clauses.push(`job_type = $${paramIndex}`);
            values.push(filters.jobType);
            paramIndex += 1;
        }

        const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
        const result = await db.query(`SELECT COUNT(*) FROM sync_jobs${whereClause}`, values);
        return parseInt(result.rows[0].count, 10);
    }

    static async findRecent(limit = 10) {
        const safeLimit = normalizeInteger(limit, 10, 1);
        const result = await db.query(`
            SELECT *
            FROM sync_jobs
            ORDER BY created_at DESC
            LIMIT $1
        `, [safeLimit]);
        return result.rows;
    }

    static async findAll(filters = {}) {
        const clauses = [];
        const values = [];
        let paramIndex = 1;

        if (filters.status) {
            clauses.push(`status = $${paramIndex}`);
            values.push(filters.status);
            paramIndex += 1;
        }

        if (filters.jobType) {
            clauses.push(`job_type = $${paramIndex}`);
            values.push(filters.jobType);
            paramIndex += 1;
        }

        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const limit = normalizeInteger(filters.limit, 50, 1);
        const offset = normalizeInteger(filters.offset, 0, 0);

        values.push(limit);
        values.push(offset);

        const result = await db.query(`
            SELECT *
            FROM sync_jobs
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, values);

        return result.rows;
    }

    static async summarize() {
        const [countsResult, recentJobs] = await Promise.all([
            db.query(`
                SELECT status, COUNT(*)::int AS count
                FROM sync_jobs
                GROUP BY status
            `),
            SyncJob.findRecent(5)
        ]);

        const byStatus = {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0
        };

        countsResult.rows.forEach((row) => {
            byStatus[row.status] = parseInt(row.count, 10);
        });

        return {
            total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
            byStatus,
            recent: recentJobs
        };
    }
}

module.exports = SyncJob;
