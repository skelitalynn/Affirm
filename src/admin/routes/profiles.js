/**
 * Profiles admin routes
 */
const express = require('express');
const router = express.Router();
const Profile = require('../../models/profile');

function parsePreferences(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return null;
    }

    if (typeof raw === 'object') {
        return raw;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        const parseError = new Error('preferences must be valid JSON');
        parseError.code = 'INVALID_PREFERENCES';
        throw parseError;
    }
}

function buildProfilePayload(body, { requireUserId = false } = {}) {
    const payload = {};

    if (requireUserId) {
        if (!body.user_id || !String(body.user_id).trim()) {
            throw new Error('user_id is required');
        }
        payload.user_id = String(body.user_id).trim();
    }

    if (body.goals !== undefined) {
        payload.goals = body.goals === '' ? null : body.goals;
    }

    if (body.status !== undefined) {
        payload.status = body.status === '' ? null : body.status;
    }

    if (body.preferences !== undefined) {
        payload.preferences = parsePreferences(body.preferences);
    }

    return payload;
}

// List profiles
router.get('/', async (req, res) => {
    try {
        const profiles = await Profile.findAll();
        res.render('profiles/list', {
            title: 'Profiles',
            profiles,
            user: req.user
        });
    } catch (error) {
        console.error('Failed to load profiles:', error);
        res.status(500).render('error', {
            title: 'Profiles',
            error: 'Failed to load profiles'
        });
    }
});

// New profile form
router.get('/new', (req, res) => {
    res.render('profiles/form', {
        title: 'Create Profile',
        profile: {},
        mode: 'create',
        user: req.user,
        error: null
    });
});

// Create profile
router.post('/', async (req, res) => {
    try {
        const payload = buildProfilePayload(req.body, { requireUserId: true });
        await Profile.create(payload);
        res.redirect('/admin/profiles');
    } catch (error) {
        console.error('Failed to create profile:', error);
        res.status(400).render('profiles/form', {
            title: 'Create Profile',
            profile: req.body,
            mode: 'create',
            user: req.user,
            error: error.message || 'Failed to create profile'
        });
    }
});

// Edit profile form
router.get('/:id/edit', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.status(404).render('404', { url: req.originalUrl });
        }

        res.render('profiles/form', {
            title: 'Edit Profile',
            profile,
            mode: 'edit',
            user: req.user,
            error: null
        });
    } catch (error) {
        console.error('Failed to load profile:', error);
        res.status(500).render('error', {
            title: 'Edit Profile',
            error: 'Failed to load profile'
        });
    }
});

// Update profile
router.post('/:id/update', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.status(404).render('404', { url: req.originalUrl });
        }

        const payload = buildProfilePayload(req.body);
        await Profile.update(profile.user_id, payload);

        res.redirect('/admin/profiles');
    } catch (error) {
        console.error('Failed to update profile:', error);
        res.status(400).render('profiles/form', {
            title: 'Edit Profile',
            profile: { ...req.body, id: req.params.id },
            mode: 'edit',
            user: req.user,
            error: error.message || 'Failed to update profile'
        });
    }
});

// Delete profile
router.post('/:id/delete', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) {
            return res.status(404).render('404', { url: req.originalUrl });
        }

        await Profile.delete(profile.user_id);
        res.redirect('/admin/profiles');
    } catch (error) {
        console.error('Failed to delete profile:', error);
        res.status(500).render('error', {
            title: 'Delete Profile',
            error: 'Failed to delete profile'
        });
    }
});

module.exports = router;
