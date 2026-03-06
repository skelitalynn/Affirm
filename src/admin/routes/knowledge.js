/**
 * Knowledge admin routes
 */
const express = require('express');
const router = express.Router();
const Knowledge = require('../../models/knowledge');

function buildKnowledgePayload(body, { requireUserId = true, requireContent = true } = {}) {
    const payload = {};

    if (requireUserId) {
        if (!body.user_id || !String(body.user_id).trim()) {
            throw new Error('user_id is required');
        }
        payload.user_id = String(body.user_id).trim();
    }

    if (requireContent) {
        if (!body.content || !String(body.content).trim()) {
            throw new Error('content is required');
        }
        payload.content = String(body.content).trim();
    }

    payload.source = body.source && String(body.source).trim() ? String(body.source).trim() : 'admin';

    return payload;
}

// List knowledge
router.get('/', async (req, res) => {
    try {
        const knowledge = await Knowledge.findAll();
        res.render('knowledge/list', {
            title: 'Knowledge',
            knowledge,
            user: req.user
        });
    } catch (error) {
        console.error('Failed to load knowledge:', error);
        res.status(500).render('error', {
            title: 'Knowledge',
            error: 'Failed to load knowledge'
        });
    }
});

// New knowledge form
router.get('/new', (req, res) => {
    res.render('knowledge/form', {
        title: 'Create Knowledge',
        knowledge: {},
        user: req.user,
        error: null
    });
});

// Create knowledge
router.post('/', async (req, res) => {
    try {
        const payload = buildKnowledgePayload(req.body);
        await Knowledge.create(payload);
        res.redirect('/admin/knowledge');
    } catch (error) {
        console.error('Failed to create knowledge:', error);
        res.status(400).render('knowledge/form', {
            title: 'Create Knowledge',
            knowledge: req.body,
            user: req.user,
            error: error.message || 'Failed to create knowledge'
        });
    }
});

// Import form
router.get('/import', (req, res) => {
    res.render('knowledge/import', {
        title: 'Batch Import Knowledge',
        user: req.user,
        error: null
    });
});

// Batch import
router.post('/import', async (req, res) => {
    try {
        if (!req.body.user_id || !String(req.body.user_id).trim()) {
            throw new Error('user_id is required');
        }

        const userId = String(req.body.user_id).trim();
        const source = req.body.source && String(req.body.source).trim() ? String(req.body.source).trim() : 'batch-import';
        const lines = String(req.body.items || '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        if (lines.length === 0) {
            throw new Error('items is required');
        }

        for (const line of lines) {
            await Knowledge.create({
                user_id: userId,
                content: line,
                source
            });
        }

        res.redirect('/admin/knowledge');
    } catch (error) {
        console.error('Failed to import knowledge:', error);
        res.status(400).render('knowledge/import', {
            title: 'Batch Import Knowledge',
            user: req.user,
            error: error.message || 'Failed to import knowledge'
        });
    }
});

// Delete knowledge item
router.post('/:id/delete', async (req, res) => {
    try {
        await Knowledge.delete(req.params.id);
        res.redirect('/admin/knowledge');
    } catch (error) {
        console.error('Failed to delete knowledge:', error);
        res.status(500).render('error', {
            title: 'Delete Knowledge',
            error: 'Failed to delete knowledge'
        });
    }
});

module.exports = router;
