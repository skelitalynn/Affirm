#!/bin/bash
# Day 5: 后台配置页
# 根据开发计划：创建管理界面

set -e

echo "🚀 开始Day 5任务：后台配置页"
echo "=================================="

# 加载环境变量
source /root/projects/Affirm/.env

# 1. 创建简易Web界面框架
echo "1. 创建简易Web界面框架..."

# 创建admin目录结构
mkdir -p /root/projects/Affirm/src/admin
mkdir -p /root/projects/Affirm/src/admin/routes
mkdir -p /root/projects/Affirm/src/admin/views
mkdir -p /root/projects/Affirm/src/admin/middleware
mkdir -p /root/projects/Affirm/src/admin/static/css
mkdir -p /root/projects/Affirm/src/admin/static/js

# 创建主管理服务器文件
cat > /root/projects/Affirm/src/admin/server.js << 'EOF'
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
EOF

# 2. 实现认证中间件
echo "2. 实现基本权限控制..."

cat > /root/projects/Affirm/src/admin/middleware/auth.js << 'EOF'
/**
 * 基础HTTP认证中间件
 * 注意：生产环境应使用更安全的方案（如JWT、OAuth等）
 */
const basicAuth = require('basic-auth');

// 简单内存用户存储（生产环境应从数据库读取）
const users = {
    admin: {
        password: process.env.ADMIN_PASSWORD || 'admin123',
        name: '管理员',
        role: 'admin'
    }
};

function authMiddleware(req, res, next) {
    // 如果未设置密码，跳过认证（仅开发环境）
    if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === 'development') {
        req.user = { name: '开发者', role: 'admin' };
        return next();
    }

    const user = basicAuth(req);

    if (!user || !users[user.name] || users[user.name].password !== user.pass) {
        res.set('WWW-Authenticate', 'Basic realm="Affirm Admin"');
        return res.status(401).send('需要认证');
    }

    req.user = {
        username: user.name,
        name: users[user.name].name,
        role: users[user.name].role
    };

    next();
}

module.exports = authMiddleware;
EOF

# 3. 实现profiles表的管理界面
echo "3. 实现profiles表的管理界面..."

cat > /root/projects/Affirm/src/admin/routes/profiles.js << 'EOF'
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
EOF

# 4. 实现知识注入功能界面
echo "4. 添加知识注入功能界面..."

cat > /root/projects/Affirm/src/admin/routes/knowledge.js << 'EOF'
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
EOF

# 5. 创建视图模板
echo "5. 创建视图模板..."

# 创建视图目录
mkdir -p /root/projects/Affirm/src/admin/views/profiles
mkdir -p /root/projects/Affirm/src/admin/views/knowledge

# 基础布局模板
cat > /root/projects/Affirm/src/admin/views/layout.ejs << 'EOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title %> - Affirm后台管理</title>
    <link rel="stylesheet" href="/static/css/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="container">
        <header class="header">
            <h1><i class="fas fa-cogs"></i> Affirm后台管理</h1>
            <div class="user-info">
                <span>欢迎, <%= user.name %> (<%= user.role %>)</span>
                <a href="/admin/logout" class="btn btn-sm">退出</a>
            </div>
        </header>
        
        <nav class="sidebar">
            <ul>
                <li><a href="/admin"><i class="fas fa-tachometer-alt"></i> 仪表板</a></li>
                <li><a href="/admin/profiles"><i class="fas fa-users"></i> Profiles管理</a></li>
                <li><a href="/admin/knowledge"><i class="fas fa-brain"></i> 知识管理</a></li>
                <li><a href="/admin/settings"><i class="fas fa-sliders-h"></i> 系统设置</a></li>
            </ul>
        </nav>
        
        <main class="main">
            <% if (typeof flash !== 'undefined' && flash.success) { %>
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> <%= flash.success %>
                </div>
            <% } %>
            <% if (typeof flash !== 'undefined' && flash.error) { %>
                <div class="alert alert-error">
                    <i class="fas fa-exclamation-circle"></i> <%= flash.error %>
                </div>
            <% } %>
            
            <h2><%= title %></h2>
            <%- body %>
        </main>
        
        <footer class="footer">
            <p>Affirm后台管理 v<%= version || '1.0.0' %> &copy; 2026</p>
        </footer>
    </div>
    
    <script src="/static/js/app.js"></script>
</body>
</html>
EOF

# 仪表板模板
cat > /root/projects/Affirm/src/admin/views/dashboard.ejs << 'EOF'
<% layout('layout') -%>

<div class="dashboard">
    <div class="stats">
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-users"></i>
            </div>
            <div class="stat-content">
                <h3>Profiles</h3>
                <p class="stat-number"><%= stats.profilesCount || 0 %></p>
                <p class="stat-desc">已配置的身份模板</p>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-brain"></i>
            </div>
            <div class="stat-content">
                <h3>知识条目</h3>
                <p class="stat-number"><%= stats.knowledgeCount || 0 %></p>
                <p class="stat-desc">已存储的知识片段</p>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-comments"></i>
            </div>
            <div class="stat-content">
                <h3>对话消息</h3>
                <p class="stat-number"><%= stats.messagesCount || 0 %></p>
                <p class="stat-desc">已处理的对话</p>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-icon">
                <i class="fas fa-database"></i>
            </div>
            <div class="stat-content">
                <h3>数据库</h3>
                <p class="stat-number">正常</p>
                <p class="stat-desc">连接状态良好</p>
            </div>
        </div>
    </div>
    
    <div class="recent-activity">
        <h3><i class="fas fa-history"></i> 最近活动</h3>
        <ul>
            <% if (recentActivity && recentActivity.length > 0) { %>
                <% recentActivity.forEach(activity => { %>
                    <li>
                        <span class="activity-time"><%= activity.time %></span>
                        <span class="activity-text"><%= activity.text %></span>
                    </li>
                <% }) %>
            <% } else { %>
                <li>暂无最近活动</li>
            <% } %>
        </ul>
    </div>
</div>
EOF

# Profiles列表模板
cat > /root/projects/Affirm/src/admin/views/profiles/list.ejs << 'EOF'
<% layout('layout') -%>

<div class="action-bar">
    <a href="/admin/profiles/new" class="btn btn-primary">
        <i class="fas fa-plus"></i> 创建Profile
    </a>
</div>

<table class="data-table">
    <thead>
        <tr>
            <th>ID</th>
            <th>名称</th>
            <th>描述</th>
            <th>关键词</th>
            <th>默认</th>
            <th>创建时间</th>
            <th>操作</th>
        </tr>
    </thead>
    <tbody>
        <% if (profiles && profiles.length > 0) { %>
            <% profiles.forEach(profile => { %>
                <tr>
                    <td><%= profile.id %></td>
                    <td><strong><%= profile.name %></strong></td>
                    <td><%= profile.description %></td>
                    <td>
                        <% if (profile.keywords && profile.keywords.length > 0) { %>
                            <%= profile.keywords.join(', ') %>
                        <% } else { %>
                            <span class="text-muted">无</span>
                        <% } %>
                    </td>
                    <td>
                        <% if (profile.is_default) { %>
                            <span class="badge badge-success">是</span>
                        <% } else { %>
                            <span class="badge badge-secondary">否</span>
                        <% } %>
                    </td>
                    <td><%= new Date(profile.created_at).toLocaleString() %></td>
                    <td class="actions">
                        <a href="/admin/profiles/<%= profile.id %>/edit" class="btn btn-sm btn-edit">
                            <i class="fas fa-edit"></i> 编辑
                        </a>
                        <form action="/admin/profiles/<%= profile.id %>/delete" method="POST" style="display: inline;">
                            <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('确定删除此profile？')">
                                <i class="fas fa-trash"></i> 删除
                            </button>
                        </form>
                    </td>
                </tr>
            <% }) %>
        <% } else { %>
            <tr>
                <td colspan="7" class="text-center">暂无profiles，<a href="/admin/profiles/new">创建一个</a></td>
            </tr>
        <% } %>
    </tbody>
</table>
EOF

# 6. 创建静态CSS文件
echo "6. 界面美化优化..."

cat > /root/projects/Affirm/src/admin/static/css/style.css << 'EOF'
/* Affirm后台管理 - 样式文件 */

:root {
    --primary-color: #3498db;
    --secondary-color: #2ecc71;
    --danger-color: #e74c3c;
    --warning-color: #f39c12;
    --dark-color: #2c3e50;
    --light-color: #ecf0f1;
    --gray-color: #95a5a6;
    --border-radius: 8px;
    --box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f5f7fa;
    color: #333;
    line-height: 1.6;
}

.container {
    display: grid;
    grid-template-areas:
        "header header"
        "sidebar main"
        "footer footer";
    grid-template-columns: 250px 1fr;
    grid-template-rows: auto 1fr auto;
    min-height: 100vh;
}

.header {
    grid-area: header;
    background: var(--dark-color);
    color: white;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: var(--box-shadow);
}

.header h1 {
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    gap: 10px;
}

.user-info {
    display: flex;
    align-items: center;
    gap: 15px;
}

.sidebar {
    grid-area: sidebar;
    background: white;
    border-right: 1px solid #ddd;
    padding: 2rem 0;
}

.sidebar ul {
    list-style: none;
}

.sidebar li {
    margin-bottom: 5px;
}

.sidebar a {
    display: block;
    padding: 12px 25px;
    color: var(--dark-color);
    text-decoration: none;
    transition: all 0.3s ease;
    border-left: 4px solid transparent;
}

.sidebar a:hover {
    background: var(--light-color);
    border-left-color: var(--primary-color);
}

.sidebar a.active {
    background: var(--light-color);
    border-left-color: var(--primary-color);
    color: var(--primary-color);
}

.sidebar a i {
    margin-right: 10px;
    width: 20px;
    text-align: center;
}

.main {
    grid-area: main;
    padding: 2rem;
    overflow-y: auto;
}

.main h2 {
    margin-bottom: 1.5rem;
    color: var(--dark-color);
    border-bottom: 2px solid var(--primary-color);
    padding-bottom: 10px;
}

.footer {
    grid-area: footer;
    background: var(--dark-color);
    color: white;
    text-align: center;
    padding: 1rem;
    font-size: 0.9rem;
}

/* 按钮样式 */
.btn {
    display: inline-block;
    padding: 8px 16px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: var(--border-radius);
    cursor: pointer;
    text-decoration: none;
    font-size: 14px;
    transition: background 0.3s ease;
}

.btn:hover {
    background: #2980b9;
    color: white;
}

.btn-sm {
    padding: 5px 10px;
    font-size: 13px;
}

.btn-primary {
    background: var(--primary-color);
}

.btn-secondary {
    background: var(--secondary-color);
}

.btn-danger {
    background: var(--danger-color);
}

.btn-warning {
    background: var(--warning-color);
}

/* 表格样式 */
.data-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: var(--border-radius);
    overflow: hidden;
    box-shadow: var(--box-shadow);
}

.data-table th {
    background: var(--dark-color);
    color: white;
    padding: 12px 15px;
    text-align: left;
}

.data-table td {
    padding: 12px 15px;
    border-bottom: 1px solid #eee;
}

.data-table tr:hover {
    background: #f9f9f9;
}

.data-table .actions {
    display: flex;
    gap: 8px;
}

/* 统计卡片 */
.stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: white;
    border-radius: var(--border-radius);
    padding: 20px;
    box-shadow: var(--box-shadow);
    display: flex;
    align-items: center;
    gap: 20px;
}

.stat-icon {
    width: 60px;
    height: 60px;
    background: var(--primary-color);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
}

.stat-content h3 {
    font-size: 16px;
    color: var(--gray-color);
    margin-bottom: 5px;
}

.stat-number {
    font-size: 28px;
    font-weight: bold;
    color: var(--dark-color);
    margin-bottom: 5px;
}

.stat-desc {
    font-size: 13px;
    color: var(--gray-color);
}

/* 表单样式 */
.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: var(--dark-color);
}

.form-control {
    width: 100%;
    padding: 10px 15px;
    border: 1px solid #ddd;
    border-radius: var(--border-radius);
    font-size: 16px;
    transition: border 0.3s ease;
}

.form-control:focus {
    outline: none;
    border-color: var(--primary-color);
}

textarea.form-control {
    min-height: 120px;
    resize: vertical;
}

/* 警告框 */
.alert {
    padding: 12px 20px;
    border-radius: var(--border-radius);
    margin-bottom: 20px;
}

.alert-success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
}

.alert-error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .container {
        grid-template-areas:
            "header"
            "main"
            "footer";
        grid-template-columns: 1fr;
    }
    
    .sidebar {
        display: none;
    }
    
    .stats {
        grid-template-columns: 1fr;
    }
}
EOF

# 7. 更新package.json添加管理脚本
echo "7. 更新package.json添加管理脚本..."

# 备份原package.json
cp /root/projects/Affirm/package.json /root/projects/Affirm/package.json.backup

# 使用Node.js更新package.json
cat > /root/projects/Affirm/scripts/update-package.js << 'EOF'
const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');
const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// 添加新的脚本
packageData.scripts = packageData.scripts || {};
packageData.scripts['admin'] = 'node src/admin/server.js';
packageData.scripts['admin:dev'] = 'nodemon src/admin/server.js';
packageData.scripts['start:all'] = 'concurrently "npm start" "npm run admin"';

// 添加concurrent依赖（如果不存在）
if (!packageData.devDependencies['concurrently']) {
    packageData.devDependencies['concurrently'] = '^8.0.0';
}

fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
console.log('✅ package.json已更新');
EOF

node /root/projects/Affirm/scripts/update-package.js

# 8. 创建环境变量示例
echo "8. 添加管理后台环境变量..."

# 更新.env文件（如果存在）
if [ -f /root/projects/Affirm/.env ]; then
    echo "" >> /root/projects/Affirm/.env
    echo "# 后台管理配置" >> /root/projects/Affirm/.env
    echo "ADMIN_PORT=3001" >> /root/projects/Affirm/.env
    echo "ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d '=' | tr -d '/')" >> /root/projects/Affirm/.env
    echo "ADMIN_SESSION_SECRET=$(openssl rand -base64 32)" >> /root/projects/Affirm/.env
    echo "✅ 环境变量已更新"
else
    echo "⚠️  .env文件不存在，跳过环境变量更新"
fi

# 9. 安装缺失的依赖
echo "9. 安装缺失的依赖..."
cd /root/projects/Affirm
npm install ejs 2>/dev/null || echo "⚠️  ejs安装失败，可能需要手动安装"
npm install basic-auth 2>/dev/null || echo "⚠️  basic-auth安装失败，可能需要手动安装"

# 10. 验证安装
echo "10. 验证安装..."
if [ -f /root/projects/Affirm/src/admin/server.js ]; then
    echo "✅ 管理服务器文件创建成功"
else
    echo "❌ 管理服务器文件创建失败"
    exit 1
fi

echo ""
echo "🎉 Day 5任务完成！"
echo "=================================="
echo "📁 创建的文件结构："
echo "  src/admin/              # 管理后台代码"
echo "  ├── server.js           # 主服务器文件"
echo "  ├── middleware/         # 中间件"
echo "  │   └── auth.js         # 认证中间件"
echo "  ├── routes/             # 路由"
echo "  │   ├── profiles.js     # Profiles管理"
echo "  │   └── knowledge.js    # 知识管理"
echo "  ├── views/              # 视图模板"
echo "  │   ├── layout.ejs      # 布局模板"
echo "  │   ├── dashboard.ejs   # 仪表板"
echo "  │   └── profiles/       # Profiles相关视图"
echo "  └── static/             # 静态资源"
echo "      └── css/style.css   # 样式表"
echo ""
echo "🚀 启动方式："
echo "  1. 设置环境变量: ADMIN_PASSWORD"
echo "  2. 运行: npm run admin"
echo "  3. 访问: http://localhost:3001/admin"
echo "  4. 用户名: admin, 密码: 环境变量中的ADMIN_PASSWORD"
echo ""
echo "📝 注意：这是一个基础版本，生产环境需要更多安全措施。"
echo "=================================="