/**
 * Profiles管理路由
 */
const express = require('express');
const router = express.Router();
const db = require('../../db/connection');
const { Profile } = require('../../models/profile');

// 获取所有profiles
router.get('/', async (req, res) => {
    try {
        const profiles = await Profile.findAll();
        res.render('profiles/list', {
            title: 'Profiles管理',
            profiles,
            user: req.user
        });
    } catch (error) {
        console.error('获取profiles失败:', error);
        res.status(500).render('error', { error: '获取数据失败' });
    }
});

// 显示创建表单
router.get('/new', (req, res) => {
    res.render('profiles/form', {
        title: '创建Profile',
        profile: {},
        user: req.user
    });
});

// 创建新的profile
router.post('/', async (req, res) => {
    try {
        const { name, description, keywords, is_default } = req.body;
        
        const profile = await Profile.create({
            name,
            description,
            keywords: keywords ? keywords.split(',').map(k => k.trim()) : [],
            is_default: is_default === 'on'
        });
        
        req.flash = req.flash || (() => {});
        req.flash('success', 'Profile创建成功');
        res.redirect('/admin/profiles');
    } catch (error) {
        console.error('创建profile失败:', error);
        res.status(500).render('profiles/form', {
            title: '创建Profile',
            profile: req.body,
            error: '创建失败',
            user: req.user
        });
    }
});

// 显示编辑表单
router.get('/:id/edit', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.status(404).render('404');
        }
        
        res.render('profiles/form', {
            title: '编辑Profile',
            profile,
            user: req.user
        });
    } catch (error) {
        console.error('获取profile失败:', error);
        res.status(500).render('error', { error: '获取数据失败' });
    }
});

// 更新profile
router.post('/:id/update', async (req, res) => {
    try {
        const { name, description, keywords, is_default } = req.body;
        
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.status(404).render('404');
        }
        
        await Profile.update(req.params.id, {
            name,
            description,
            keywords: keywords ? keywords.split(',').map(k => k.trim()) : [],
            is_default: is_default === 'on'
        });
        
        req.flash('success', 'Profile更新成功');
        res.redirect('/admin/profiles');
    } catch (error) {
        console.error('更新profile失败:', error);
        res.status(500).render('profiles/form', {
            title: '编辑Profile',
            profile: req.body,
            error: '更新失败',
            user: req.user
        });
    }
});

// 删除profile
router.post('/:id/delete', async (req, res) => {
    try {
        await Profile.delete(req.params.id);
        req.flash('success', 'Profile删除成功');
        res.redirect('/admin/profiles');
    } catch (error) {
        console.error('删除profile失败:', error);
        req.flash('error', '删除失败');
        res.redirect('/admin/profiles');
    }
});

module.exports = router;
