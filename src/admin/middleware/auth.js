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
