const express = require('express');
const router = express.Router();
const SyncJob = require('../../models/sync-job');

const ALLOWED_STATUSES = new Set(['pending', 'processing', 'completed', 'failed']);

function getFlashFromQuery(query = {}) {
    const flash = {};
    if (query.success) flash.success = query.success;
    if (query.error) flash.error = query.error;
    return flash;
}

function normalizeFilters(query = {}) {
    const status = typeof query.status === 'string' ? query.status.trim() : '';
    const jobType = typeof query.job_type === 'string' ? query.job_type.trim() : '';

    return {
        status: ALLOWED_STATUSES.has(status) ? status : '',
        jobType,
        limit: 50
    };
}

router.get('/', async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const [jobs, summary] = await Promise.all([
            SyncJob.findAll(filters),
            SyncJob.summarize()
        ]);

        res.render('sync-jobs/list', {
            title: '同步任务',
            jobs,
            summary,
            filters,
            flash: getFlashFromQuery(req.query),
            user: req.user
        });
    } catch (error) {
        console.error('获取同步任务失败:', error);
        res.status(500).render('500', {
            error: '获取同步任务失败',
            layout: false
        });
    }
});

module.exports = router;
