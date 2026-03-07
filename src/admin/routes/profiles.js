/**
 * Profiles管理路由
 */
const express = require('express');
const router = express.Router();
const Profile = require('../../models/profile');

function getFlashFromQuery(query = {}) {
    const flash = {};
    if (query.success) flash.success = query.success;
    if (query.error) flash.error = query.error;
    return flash;
}

function parsePreferencesInput(preferencesInput) {
    if (preferencesInput === undefined || preferencesInput === null || preferencesInput === '') {
        return null;
    }

    if (typeof preferencesInput === 'object') {
        return preferencesInput;
    }

    return JSON.parse(preferencesInput);
}

function normalizeProfilePayload(body = {}) {
    return {
        user_id: body.user_id ? body.user_id.trim() : '',
        goals: body.goals ? body.goals.trim() : null,
        status: body.status ? body.status.trim() : null,
        preferences: parsePreferencesInput(body.preferences)
    };
}

// 获取所有profiles
router.get('/', async (req, res) => {
    try {
        const profiles = await Profile.findAll();
        res.render('profiles/list', {
            title: 'Profiles管理',
            profiles,
            flash: getFlashFromQuery(req.query),
            user: req.user
        });
    } catch (error) {
        console.error('获取profiles失败:', error);
        res.status(500).render('500', { error: '获取数据失败', layout: false });
    }
});

// 显示创建表单
router.get('/new', (req, res) => {
    res.render('profiles/form', {
        title: '创建Profile',
        profile: { status: 'active' },
        isEdit: false,
        user: req.user
    });
});

// 创建新的profile
router.post('/', async (req, res) => {
    try {
        const payload = normalizeProfilePayload(req.body);
        if (!payload.user_id) {
            throw new Error('user_id 不能为空');
        }

        await Profile.create(payload);

        res.redirect('/admin/profiles?success=' + encodeURIComponent('Profile创建成功'));
    } catch (error) {
        console.error('创建profile失败:', error);
        res.status(500).render('profiles/form', {
            title: '创建Profile',
            profile: req.body,
            error: '创建失败',
            isEdit: false,
            user: req.user
        });
    }
});

// 显示编辑表单
router.get('/:id/edit', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.status(404).render('404', { url: req.originalUrl, layout: false });
        }

        res.render('profiles/form', {
            title: '编辑Profile',
            profile,
            isEdit: true,
            user: req.user
        });
    } catch (error) {
        console.error('获取profile失败:', error);
        res.status(500).render('500', { error: '获取数据失败', layout: false });
    }
});

// 更新profile
router.post('/:id/update', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.status(404).render('404', { url: req.originalUrl, layout: false });
        }

        const payload = normalizeProfilePayload(req.body);
        await Profile.update(profile.user_id, {
            goals: payload.goals,
            status: payload.status,
            preferences: payload.preferences
        });

        res.redirect('/admin/profiles?success=' + encodeURIComponent('Profile更新成功'));
    } catch (error) {
        console.error('更新profile失败:', error);
        res.status(500).render('profiles/form', {
            title: '编辑Profile',
            profile: {
                ...req.body,
                id: req.params.id
            },
            error: '更新失败',
            isEdit: true,
            user: req.user
        });
    }
});

// 删除profile
router.post('/:id/delete', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.redirect('/admin/profiles?error=' + encodeURIComponent('Profile不存在'));
        }

        await Profile.delete(profile.user_id);
        res.redirect('/admin/profiles?success=' + encodeURIComponent('Profile删除成功'));
    } catch (error) {
        console.error('删除profile失败:', error);
        res.redirect('/admin/profiles?error=' + encodeURIComponent('删除失败'));
    }
});

module.exports = router;
