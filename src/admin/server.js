#!/usr/bin/env node
/**
 * Affirm 后台管理服务
 * 提供 Web 界面用于配置管理
 */
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const config = require('../config');
const { healthCheck } = require('../health');
const Profile = require('../models/profile');
const Knowledge = require('../models/knowledge');
const Message = require('../models/message');
const MemoryEvent = require('../models/memory-event');
const SyncJob = require('../models/sync-job');
const ragProvider = require('../services/rag/provider');
const { messageQueue } = require('../utils/message-queue');
const authMiddleware = require('./middleware/auth');
const profilesRouter = require('./routes/profiles');
const knowledgeRouter = require('./routes/knowledge');
const syncJobsRouter = require('./routes/sync-jobs');
const memoryEventsRouter = require('./routes/memory-events');

const app = express();
const PORT = config.admin.port;

app.use(helmet());

const configuredOrigins = (config.security.corsOrigins || [])
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = Array.from(new Set([
    `http://localhost:${PORT}`,
    ...configuredOrigins
]));

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function csrfProtection(req, res, next) {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    let requestOrigin = null;
    if (origin) {
        requestOrigin = origin;
    } else if (referer) {
        try {
            requestOrigin = new URL(referer).origin;
        } catch {
            requestOrigin = null;
        }
    }

    if (!requestOrigin) {
        return res.status(403).json({ error: 'CSRF protection: Origin header required' });
    }

    if (!allowedOrigins.includes(requestOrigin)) {
        console.warn(`[CSRF] 拒绝来自非法来源的请求: ${requestOrigin}`);
        return res.status(403).json({ error: 'CSRF protection: origin not allowed' });
    }

    return next();
}

app.use('/static', express.static(path.join(__dirname, 'static')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

async function getSafeCount(model, fallback = 0) {
    try {
        return await model.count();
    } catch (error) {
        console.error('统计数据获取失败:', error.message);
        return fallback;
    }
}

async function getSafeJobSummary() {
    try {
        return await SyncJob.summarize();
    } catch (error) {
        console.error('同步任务摘要获取失败:', error.message);
        return {
            total: 0,
            byStatus: {
                pending: 0,
                processing: 0,
                completed: 0,
                failed: 0
            },
            recent: []
        };
    }
}

app.use('/admin', authMiddleware);
app.use('/admin', csrfProtection);

app.get('/admin', async (req, res) => {
    try {
        const [profilesCount, knowledgeCount, messagesCount, memoryEventsCount, syncJobSummary, ragStatus] = await Promise.all([
            getSafeCount(Profile),
            getSafeCount(Knowledge),
            getSafeCount(Message),
            getSafeCount(MemoryEvent),
            getSafeJobSummary(),
            ragProvider.getStatus().catch(() => ({
                enabled: false,
                healthy: false,
                configured: false,
                message: 'Haystack 状态获取失败'
            }))
        ]);
        const memoryHitMessagesCount = await Message.countAssistantMessagesWithMemoryRefs()
            .catch(() => 0);
        const queueStats = messageQueue.getStats();

        res.render('dashboard', {
            title: 'Affirm后台管理',
            user: req.user,
            version: '1.0.0',
            stats: {
                profilesCount,
                knowledgeCount,
                messagesCount,
                memoryEventsCount,
                syncJobsCount: syncJobSummary.total,
                memoryHitMessagesCount,
                queueMode: queueStats.mode || 'uninitialized',
                ragStatus: ragStatus.enabled ? 'enabled' : (ragStatus.configured ? 'degraded' : 'not_configured')
            },
            systemOverview: {
                queueStats,
                ragStatus,
                syncJobSummary
            },
            recentActivity: (syncJobSummary.recent || []).map((job) => ({
                time: new Date(job.created_at).toLocaleString('zh-CN'),
                text: `${job.job_type} - ${job.status}`
            }))
        });
    } catch (error) {
        console.error('仪表盘渲染失败:', error);
        res.status(500).render('500', {
            error: '仪表盘渲染失败',
            layout: false,
            nodeEnv: config.app.nodeEnv
        });
    }
});

app.use('/admin/profiles', profilesRouter);
app.use('/admin/knowledge', knowledgeRouter);
app.use('/admin/sync-jobs', syncJobsRouter);
app.use('/admin/memory-events', memoryEventsRouter);

app.get('/health', async (req, res) => {
    const result = await healthCheck();
    const statusCode = result.status === 'degraded' ? 503 : 200;
    res.status(statusCode).json(result);
});

app.use((req, res) => {
    res.status(404).render('404', { url: req.url, layout: false });
});

app.use((err, req, res, next) => {
    console.error('管理服务错误:', err.stack);
    res.status(500).render('500', {
        error: err.message,
        layout: false,
        nodeEnv: config.app.nodeEnv
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('🚀 Affirm后台管理服务已启动');
        console.log(`📳 环境: ${config.app.nodeEnv || 'development'}`);
        console.log(`🌐 地址: http://localhost:${PORT}/admin`);
        console.log('🔐 认证: 基础HTTP认证 (用户: admin)');
        console.log(`🛡️ CORS 允许来源: ${allowedOrigins.join(', ')}`);
    });
}

module.exports = app;
