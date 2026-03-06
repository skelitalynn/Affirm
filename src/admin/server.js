#!/usr/bin/env node
/**
 * Affirm admin server
 */
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const config = require('../config');
const { healthCheck } = require('../health');
const authMiddleware = require('./middleware/auth');
const profilesRouter = require('./routes/profiles');
const knowledgeRouter = require('./routes/knowledge');

const Profile = require('../models/profile');
const Knowledge = require('../models/knowledge');
const Message = require('../models/message');

const app = express();
const PORT = Number(process.env.ADMIN_PORT || 3001);

app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [`http://localhost:${PORT}`];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Keep route handlers safe even without express-session/connect-flash.
app.use((req, res, next) => {
    req.flash = (type, message) => {
        if (!res.locals.flash) res.locals.flash = {};
        if (type && message) {
            res.locals.flash[type] = message;
        }
        return res.locals.flash;
    };
    next();
});

function csrfProtection(req, res, next) {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) return next();

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    let requestOrigin = null;
    if (origin) {
        requestOrigin = origin;
    } else if (referer) {
        try {
            requestOrigin = new URL(referer).origin;
        } catch (_) {
            requestOrigin = null;
        }
    }

    if (!requestOrigin) {
        return res.status(403).json({ error: 'CSRF protection: Origin header required' });
    }

    if (!allowedOrigins.includes(requestOrigin)) {
        console.warn(`[CSRF] Rejected origin: ${requestOrigin}`);
        return res.status(403).json({ error: 'CSRF protection: origin not allowed' });
    }

    next();
}

app.use('/static', express.static(path.join(__dirname, 'static')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/admin', authMiddleware);
app.use('/admin', csrfProtection);

async function buildStats() {
    try {
        const [profilesCount, knowledgeCount, messagesCount] = await Promise.all([
            Profile.count(),
            Knowledge.count(),
            Message.count()
        ]);

        return {
            profilesCount,
            knowledgeCount,
            messagesCount
        };
    } catch (error) {
        console.error('Failed to build admin stats:', error.message);
        return {
            profilesCount: 0,
            knowledgeCount: 0,
            messagesCount: 0
        };
    }
}

app.get('/admin', async (req, res) => {
    const stats = await buildStats();

    res.render('dashboard', {
        title: 'Affirm Admin',
        user: req.user,
        version: '1.0.0',
        stats,
        recentActivity: []
    });
});

app.get('/admin/logout', (req, res) => {
    // Basic auth has no server-side session. Respond 401 to force browser credential prompt.
    res.set('WWW-Authenticate', 'Basic realm="Affirm Admin"');
    res.status(401).send('Logged out');
});

app.get('/admin/settings', async (req, res) => {
    const stats = await buildStats();
    res.render('dashboard', {
        title: 'Affirm Admin Settings',
        user: req.user,
        version: '1.0.0',
        stats,
        recentActivity: []
    });
});

app.use('/admin/profiles', profilesRouter);
app.use('/admin/knowledge', knowledgeRouter);

app.get('/health', async (req, res) => {
    const result = await healthCheck();
    const statusCode = result.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(result);
});

app.use((req, res) => {
    res.status(404).render('404', { url: req.url });
});

app.use((err, req, res, next) => {
    console.error('Admin server error:', err && err.stack ? err.stack : err);
    res.status(500).render('500', { error: err.message });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Admin server listening on http://localhost:${PORT}/admin`);
        console.log(`Environment: ${config.app.nodeEnv || 'development'}`);
        console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
    });
}

module.exports = app;
