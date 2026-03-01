/**
 * 知识管理路由
 */
const express = require('express');
const router = express.Router();
const { Knowledge } = require('../../models/knowledge');
const embeddingService = require('../../services/embedding');

// 获取所有知识条目
router.get('/', async (req, res) => {
    try {
        const knowledge = await Knowledge.findAll();
        res.render('knowledge/list', {
            title: '知识管理',
            knowledge,
            user: req.user
        });
    } catch (error) {
        console.error('获取知识条目失败:', error);
        res.status(500).render('error', { error: '获取数据失败' });
    }
});

// 显示创建表单
router.get('/new', (req, res) => {
    res.render('knowledge/form', {
        title: '添加知识',
        knowledge: {},
        user: req.user
    });
});

// 创建新的知识条目
router.post('/', async (req, res) => {
    try {
        const { content, category, tags } = req.body;
        
        // 生成向量嵌入
        const embedding = await embeddingService.generateEmbedding(content);
        
        const knowledge = await Knowledge.create({
            content,
            embedding,
            category,
            tags: tags ? tags.split(',').map(t => t.trim()) : []
        });
        
        req.flash('success', '知识条目添加成功');
        res.redirect('/admin/knowledge');
    } catch (error) {
        console.error('创建知识条目失败:', error);
        res.status(500).render('knowledge/form', {
            title: '添加知识',
            knowledge: req.body,
            error: '创建失败',
            user: req.user
        });
    }
});

// 批量导入界面
router.get('/import', (req, res) => {
    res.render('knowledge/import', {
        title: '批量导入知识',
        user: req.user
    });
});

// 处理批量导入
router.post('/import', async (req, res) => {
    try {
        const { items } = req.body;
        if (!items) {
            req.flash('error', '请输入要导入的内容');
            return res.redirect('/admin/knowledge/import');
        }
        
        const lines = items.split('\n').filter(line => line.trim());
        let successCount = 0;
        let errorCount = 0;
        
        for (const line of lines) {
            try {
                const embedding = await embeddingService.generateEmbedding(line);
                await Knowledge.create({
                    content: line,
                    embedding,
                    category: 'imported',
                    tags: ['batch-import']
                });
                successCount++;
            } catch (error) {
                console.error(`导入失败: ${line}`, error);
                errorCount++;
            }
        }
        
        req.flash('success', `批量导入完成: ${successCount} 成功, ${errorCount} 失败`);
        res.redirect('/admin/knowledge');
    } catch (error) {
        console.error('批量导入失败:', error);
        req.flash('error', '批量导入失败');
        res.redirect('/admin/knowledge/import');
    }
});

// 删除知识条目
router.post('/:id/delete', async (req, res) => {
    try {
        await Knowledge.delete(req.params.id);
        req.flash('success', '知识条目删除成功');
        res.redirect('/admin/knowledge');
    } catch (error) {
        console.error('删除知识条目失败:', error);
        req.flash('error', '删除失败');
        res.redirect('/admin/knowledge');
    }
});

module.exports = router;
