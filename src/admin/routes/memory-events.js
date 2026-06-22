const express = require('express');
const router = express.Router();
const MemoryEvent = require('../../models/memory-event');
const Message = require('../../models/message');

function getFlashFromQuery(query = {}) {
    const flash = {};
    if (query.success) flash.success = query.success;
    if (query.error) flash.error = query.error;
    return flash;
}

function buildQueryString(params = {}) {
    return Object.entries(params)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
}

function normalizeFilters(query = {}) {
    return {
        userId: typeof query.user_id === 'string' ? query.user_id.trim() : '',
        eventType: typeof query.event_type === 'string' ? query.event_type.trim() : '',
        search: typeof query.search === 'string' ? query.search.trim() : '',
        status: typeof query.status === 'string' ? query.status.trim() : '',
        reviewStatus: typeof query.review_status === 'string' ? query.review_status.trim() : '',
        recalledOnly: query.recalled_only === 'true',
        eventId: typeof query.event_id === 'string' ? query.event_id.trim() : '',
        limit: 50
    };
}

function parseKeywordsInput(rawValue) {
    return String(rawValue || '')
        .split(/[\n,，]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeUpdatePayload(body = {}) {
    const status = body.status ? body.status.trim() : '';
    if (status === 'merged') {
        throw new Error('merged 状态请使用专门的 merge 动作');
    }

    return {
        event_type: body.event_type ? body.event_type.trim() : '',
        title: body.title ? body.title.trim() : '',
        summary: body.summary ? body.summary.trim() : '',
        detail: body.detail ? body.detail.trim() : '',
        keywords: parseKeywordsInput(body.keywords),
        importance: body.importance,
        confidence: body.confidence,
        happened_at: body.happened_at ? body.happened_at.trim() : '',
        status,
        review_status: body.review_status ? body.review_status.trim() : ''
    };
}

function getActor(req) {
    return req.user?.username || 'admin';
}

async function buildEditViewData(event, req, extra = {}) {
    const hitMessages = await Message.findAssistantMessagesWithMemoryRefs({
        eventId: event.id,
        limit: 20
    }).catch(() => []);
    const mergeCandidates = await MemoryEvent.findByUserId(event.user_id, {
        limit: 50,
        status: 'active'
    }).catch(() => []);

    return {
        title: '编辑 Memory Event',
        event,
        hitMessages,
        mergeCandidates: mergeCandidates.filter((item) => item.id !== event.id),
        eventTypes: MemoryEvent.EVENT_TYPES,
        eventStatuses: MemoryEvent.STATUS_VALUES,
        reviewStatuses: MemoryEvent.REVIEW_STATUS_VALUES,
        user: req.user,
        ...extra
    };
}

router.get('/', async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const [events, totalCount, recalledCount, pendingReviewCount, hitMessagesCount] = await Promise.all([
            MemoryEvent.findAll(filters),
            MemoryEvent.count(),
            MemoryEvent.count({ recalledOnly: true }),
            MemoryEvent.count({ reviewStatus: 'pending' }),
            Message.countAssistantMessagesWithMemoryRefs()
        ]);

        res.render('memory-events/list', {
            title: 'Memory Events',
            events,
            filters,
            stats: {
                totalCount,
                recalledCount,
                pendingReviewCount,
                hitMessagesCount
            },
            eventTypes: MemoryEvent.EVENT_TYPES,
            eventStatuses: MemoryEvent.STATUS_VALUES,
            reviewStatuses: MemoryEvent.REVIEW_STATUS_VALUES,
            flash: getFlashFromQuery(req.query),
            user: req.user
        });
    } catch (error) {
        console.error('获取 memory events 失败:', error);
        res.status(500).render('500', {
            error: '获取 memory events 失败',
            layout: false
        });
    }
});

router.get('/hits', async (req, res) => {
    try {
        const filters = normalizeFilters(req.query);
        const messages = await Message.findAssistantMessagesWithMemoryRefs({
            userId: filters.userId,
            eventId: filters.eventId,
            limit: 50
        });

        res.render('memory-events/hits', {
            title: 'Memory 命中回复',
            messages,
            filters,
            flash: getFlashFromQuery(req.query),
            user: req.user
        });
    } catch (error) {
        console.error('获取 memory 命中回复失败:', error);
        res.status(500).render('500', {
            error: '获取 memory 命中回复失败',
            layout: false
        });
    }
});

router.get('/hits/:messageId', async (req, res) => {
    try {
        const message = await Message.findAssistantMessageWithMemoryRefsById(req.params.messageId);
        if (!message) {
            return res.status(404).render('404', { url: req.originalUrl, layout: false });
        }

        const memoryRefs = Array.isArray(message?.metadata?.memory_refs) ? message.metadata.memory_refs : [];
        const linkedEvents = await MemoryEvent.findByIds(memoryRefs.map((item) => item.id));
        const linkedEventsMap = new Map(linkedEvents.map((event) => [event.id, event]));
        const memoryRefDetails = memoryRefs.map((ref) => ({
            ref,
            event: linkedEventsMap.get(ref.id) || null
        }));

        res.render('memory-events/hit-detail', {
            title: 'Memory 命中详情',
            message,
            memoryRefDetails,
            user: req.user
        });
    } catch (error) {
        console.error('获取 memory 命中详情失败:', error);
        res.status(500).render('500', {
            error: '获取 memory 命中详情失败',
            layout: false
        });
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const event = await MemoryEvent.findById(req.params.id);
        if (!event) {
            return res.status(404).render('404', { url: req.originalUrl, layout: false });
        }

        res.render('memory-events/form', await buildEditViewData(event, req));
    } catch (error) {
        console.error('获取 memory event 失败:', error);
        res.status(500).render('500', {
            error: '获取 memory event 失败',
            layout: false
        });
    }
});

router.post('/:id/update', async (req, res) => {
    try {
        const event = await MemoryEvent.findById(req.params.id);
        if (!event) {
            return res.status(404).render('404', { url: req.originalUrl, layout: false });
        }

        const payload = normalizeUpdatePayload(req.body);
        await MemoryEvent.update(event.id, payload);

        res.redirect('/admin/memory-events?' + buildQueryString({
            success: 'Memory Event 更新成功'
        }));
    } catch (error) {
        console.error('更新 memory event 失败:', error);

        const currentEvent = await MemoryEvent.findById(req.params.id).catch(() => null);
        const mergedEvent = {
            ...(currentEvent || {}),
            ...req.body,
            id: req.params.id
        };

        res.status(500).render('memory-events/form', await buildEditViewData(mergedEvent, req, {
            error: error.message || '更新失败'
        }));
    }
});

router.post('/:id/suppress', async (req, res) => {
    try {
        await MemoryEvent.suppress(req.params.id, {
            actor: getActor(req),
            reason: req.body.reason || 'manual_review'
        });

        res.redirect('/admin/memory-events?' + buildQueryString({
            success: 'Memory Event 已 suppress'
        }));
    } catch (error) {
        console.error('suppress memory event 失败:', error);
        res.redirect('/admin/memory-events?' + buildQueryString({
            error: error.message || 'suppress 失败'
        }));
    }
});

router.post('/:id/restore', async (req, res) => {
    try {
        await MemoryEvent.restore(req.params.id, {
            actor: getActor(req),
            reason: req.body.reason || 'manual_restore'
        });

        res.redirect('/admin/memory-events?' + buildQueryString({
            success: 'Memory Event 已恢复为 active'
        }));
    } catch (error) {
        console.error('restore memory event 失败:', error);
        res.redirect('/admin/memory-events?' + buildQueryString({
            error: error.message || 'restore 失败'
        }));
    }
});

router.post('/:id/review', async (req, res) => {
    try {
        await MemoryEvent.setReviewStatus(req.params.id, req.body.review_status, {
            actor: getActor(req),
            reason: req.body.reason || 'manual_review'
        });

        res.redirect('/admin/memory-events?' + buildQueryString({
            success: 'Memory Event review_status 已更新'
        }));
    } catch (error) {
        console.error('更新 review_status 失败:', error);
        res.redirect('/admin/memory-events?' + buildQueryString({
            error: error.message || 'review 更新失败'
        }));
    }
});

router.post('/:id/merge', async (req, res) => {
    try {
        const result = await MemoryEvent.mergeInto(req.params.id, req.body.target_event_id, {
            actor: getActor(req),
            reason: req.body.reason || 'duplicate_event'
        });

        res.redirect('/admin/memory-events?' + buildQueryString({
            success: `Memory Event 已合并到 canonical event: ${result.target.id}`
        }));
    } catch (error) {
        console.error('merge memory event 失败:', error);
        res.redirect('/admin/memory-events?' + buildQueryString({
            error: error.message || 'merge 失败'
        }));
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const existing = await MemoryEvent.findById(req.params.id);
        if (!existing) {
            return res.redirect('/admin/memory-events?' + buildQueryString({
                error: 'Memory Event 不存在'
            }));
        }

        await MemoryEvent.delete(req.params.id);
        res.redirect('/admin/memory-events?' + buildQueryString({
            success: 'Memory Event 删除成功'
        }));
    } catch (error) {
        console.error('删除 memory event 失败:', error);
        res.redirect('/admin/memory-events?' + buildQueryString({
            error: '删除失败'
        }));
    }
});

module.exports = router;
