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
const authMiddleware = require('./middleware/auth');
const profilesRouter = require('./routes/profiles');
const knowledgeRouter = require('./routes/knowledge');

// 创建Express应用
const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

// 安全中间件
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'static')));

// 设置视图引擎（使用EJS）
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 基本认证中间件（生产环境应使用更安全的方案）
app.use('/admin', authMiddleware);

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

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404处理
app.use((req, res) => {
    res.status(404).render('404', { url: req.url });
});

// 错误处理中间件
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
    });
}

module.exports = app;
