#!/usr/bin/env node
/**
 * Affirm后台管理服务器
 * 提供Web界面用于配置管理
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

// 创建Express应用
const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

// 安全中间件
app.use(helmet());

// CORS：仅允许配置的来源，不再通配符（修复 2.3）
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : [`http://localhost:${PORT}`];

app.use(cors({
    origin: (origin, callback) => {
        // 允许无 origin 的请求（如 curl、服务端直接调用）
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * CSRF 防护中间件（修复 2.4）
 * 对所有状态变更请求（POST/PUT/DELETE/PATCH）检查 Origin 或 Referer 头，
 * 确保请求来自同源，阻止跨站伪造。
 * Basic Auth 在浏览器保存凭证后仍可被 CSRF 利用，因此此检查是必要的。
 */
function csrfProtection(req, res, next) {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) return next();

    const origin = req.headers['origin'];
    const referer = req.headers['referer'];

    // 提取来源 host
    let requestOrigin = null;
    if (origin) {
        requestOrigin = origin;
    } else if (referer) {
        try {
            const url = new URL(referer);
            requestOrigin = url.origin;
        } catch {
            // referer 格式无效，拒绝
        }
    }

    if (!requestOrigin) {
        // 无法确定来源的请求，拒绝（防止无头工具提交表单）
        // 注意：API 客户端应设置 Origin 头
        return res.status(403).json({ error: 'CSRF protection: Origin header required' });
    }

    if (!allowedOrigins.includes(requestOrigin)) {
        console.warn(`[CSRF] 拒绝来自非法来源的请求: ${requestOrigin}`);
        return res.status(403).json({ error: 'CSRF protection: origin not allowed' });
    }

    next();
}

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'static')));

// 设置视图引擎（使用EJS）
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 认证中间件（所有 /admin 路由）
app.use('/admin', authMiddleware);

// CSRF 防护（认证后的所有状态变更请求）
app.use('/admin', csrfProtection);

// 路由
app.get('/admin', (req, res) => {
    res.render('dashboard', {
        title: 'Affirm后台管理',
        user: req.user,
        version: '1.0.0'
    });
});

app.use('/admin/profiles', profilesRouter);
app.use('/admin/knowledge', knowledgeRouter);

// 健康检查端点：接入 health.js 实际检查数据库状态（修复 3.4）
app.get('/health', async (req, res) => {
    const result = await healthCheck();
    const statusCode = result.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(result);
});

// 404处理（修复 4.4：视图文件已创建）
app.use((req, res) => {
    res.status(404).render('404', { url: req.url });
});

// 错误处理中间件（修复 4.4：视图文件已创建）
app.use((err, req, res, next) => {
    console.error('管理服务器错误:', err.stack);
    res.status(500).render('500', { error: err.message });
});

// 启动服务器
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🎨 Affirm后台管理服务器启动`);
        console.log(`📊 环境: ${config.app.nodeEnv || 'development'}`);
        console.log(`🌐 地址: http://localhost:${PORT}/admin`);
        console.log(`🔒 认证: 基础HTTP认证 (用户: admin)`);
        console.log(`🛡️  CORS 允许来源: ${allowedOrigins.join(', ')}`);
    });
}

module.exports = app;
