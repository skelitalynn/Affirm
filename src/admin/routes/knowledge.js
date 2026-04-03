/**
 * 知识管理路由
 */
const express = require('express');
const router = express.Router();
const Knowledge = require('../../models/knowledge');
const chunkingService = require('../../services/chunking');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getFlashFromQuery(query = {}) {
    const flash = {};
    if (query.success) flash.success = query.success;
    if (query.error) flash.error = query.error;
    return flash;
}

function isValidUuid(value) {
    return UUID_PATTERN.test(value);
}

function normalizeKnowledgePayload(body = {}) {
    return {
        user_id: body.user_id ? body.user_id.trim() : null,
        content: body.content ? body.content.trim() : '',
        source: body.source ? body.source.trim() : 'admin',
        metadata: {
            created_by: 'admin'
        }
    };
}

// 获取所有知识条目
router.get('/', async (req, res) => {
    try {
        const knowledge = await Knowledge.findAll();
        res.render('knowledge/list', {
            title: '知识管理',
            knowledge,
            flash: getFlashFromQuery(req.query),
            user: req.user
        });
    } catch (error) {
        console.error('获取知识条目失败:', error);
        res.status(500).render('500', { error: '获取数据失败', layout: false });
    }
});

// 显示创建表单
router.get('/new', (req, res) => {
    res.render('knowledge/form', {
        title: '添加知识',
        knowledge: { source: 'admin' },
        isEdit: false,
        user: req.user
    });
});

// 创建新的知识条目
router.post('/', async (req, res) => {
    try {
        const payload = normalizeKnowledgePayload(req.body);
        await Knowledge.create(payload);

        res.redirect('/admin/knowledge?success=' + encodeURIComponent('知识条目添加成功'));
    } catch (error) {
        console.error('创建知识条目失败:', error);
        res.status(500).render('knowledge/form', {
            title: '添加知识',
            knowledge: req.body,
            error: '创建失败',
            isEdit: false,
            user: req.user
        });
    }
});

// 显示编辑表单
router.get('/:id/edit', async (req, res) => {
    try {
        const knowledge = await Knowledge.findById(req.params.id);
        if (!knowledge) {
            return res.status(404).render('404', { url: req.originalUrl, layout: false });
        }

        res.render('knowledge/form', {
            title: '编辑知识',
            knowledge,
            isEdit: true,
            user: req.user
        });
    } catch (error) {
        console.error('获取知识条目失败:', error);
        res.status(500).render('500', { error: '获取数据失败', layout: false });
    }
});

// 更新知识条目
router.post('/:id/update', async (req, res) => {
    try {
        const existing = await Knowledge.findById(req.params.id);
        if (!existing) {
            return res.status(404).render('404', { url: req.originalUrl, layout: false });
        }

        const payload = normalizeKnowledgePayload(req.body);
        await Knowledge.update(req.params.id, {
            content: payload.content,
            source: payload.source
        });

        res.redirect('/admin/knowledge?success=' + encodeURIComponent('知识条目更新成功'));
    } catch (error) {
        console.error('更新知识条目失败:', error);
        res.status(500).render('knowledge/form', {
            title: '编辑知识',
            knowledge: {
                ...req.body,
                id: req.params.id
            },
            error: '更新失败',
            isEdit: true,
            user: req.user
        });
    }
});

// 批量导入界面
router.get('/import', (req, res) => {
    res.render('knowledge/import', {
        title: '批量导入知识',
        flash: getFlashFromQuery(req.query),
        user: req.user
    });
});

// 处理批量导入
router.post('/import', async (req, res) => {
    try {
        const { items, user_id, source } = req.body;
        if (!items) {
            return res.redirect('/admin/knowledge/import?error=' + encodeURIComponent('请输入要导入的内容'));
        }

        const normalizedUserId = user_id ? user_id.trim() : null;
        if (normalizedUserId && !isValidUuid(normalizedUserId)) {
            return res.redirect('/admin/knowledge/import?error=' + encodeURIComponent('User ID 必须是有效 UUID'));
        }

        const knowledgeItems = chunkingService.buildKnowledgeItems({
            userId: normalizedUserId,
            source: source ? source.trim() : 'admin-import',
            text: items
        });
        const importBatch = `admin-import-${Date.now()}`;

        if (knowledgeItems.length === 0) {
            return res.redirect('/admin/knowledge/import?error=' + encodeURIComponent('未生成有效的知识片段，请检查输入内容'));
        }

        const result = await Knowledge.createBatch(knowledgeItems.map((item, index) => ({
            ...item,
            metadata: {
                created_by: 'admin',
                import_batch: importBatch,
                chunk_index: index,
                chunk_count: knowledgeItems.length
            }
        })), { detailed: true });
        const { total, successCount, failureCount, failedItems } = result;

        if (failureCount > 0) {
            const errorMessages = Array.from(new Set(
                failedItems.map(item => item.error).filter(Boolean)
            )).slice(0, 3);

            const errorDetails = errorMessages.length > 0
                ? `；失败原因：${errorMessages.join('；')}`
                : '';

            return res.redirect('/admin/knowledge?error=' + encodeURIComponent(
                `批量导入部分失败: 共 ${total} 个片段，${successCount} 成功，${failureCount} 失败${errorDetails}`
            ));
        }

        res.redirect('/admin/knowledge?success=' + encodeURIComponent(`批量导入完成: 共 ${total} 个片段，全部成功`));
    } catch (error) {
        console.error('批量导入失败:', error);
        res.redirect('/admin/knowledge/import?error=' + encodeURIComponent('批量导入失败'));
    }
});

// 删除知识条目
router.post('/:id/delete', async (req, res) => {
    try {
        await Knowledge.delete(req.params.id);
        res.redirect('/admin/knowledge?success=' + encodeURIComponent('知识条目删除成功'));
    } catch (error) {
        console.error('删除知识条目失败:', error);
        res.redirect('/admin/knowledge?error=' + encodeURIComponent('删除失败'));
    }
});

module.exports = router;
