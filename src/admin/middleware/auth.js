/**
 * 基础HTTP认证中间件
 * - 移除了开发模式认证绕过（2.1）
 * - 使用 crypto.timingSafeEqual 替换明文 === 比对（2.2）
 * - ADMIN_PASSWORD 未设置时拒绝所有访问（fail-closed）
 */
const basicAuth = require('basic-auth');
const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    console.warn('⚠️  ADMIN_PASSWORD 未设置，管理后台将拒绝所有访问请求');
}

/**
 * 防时序攻击的字符串比对
 * 当两个字符串长度不同时，仍执行一次 timingSafeEqual 以保持恒定时间
 */
function timingSafeCompare(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA); // 保持恒定时间，防止长度泄露
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

function authMiddleware(req, res, next) {
    // ADMIN_PASSWORD 未配置时 fail-closed，不允许任何访问
    if (!ADMIN_PASSWORD) {
        res.set('WWW-Authenticate', 'Basic realm="Affirm Admin"');
        return res.status(401).send('管理后台未配置认证密码，请设置 ADMIN_PASSWORD 环境变量');
    }

    const credentials = basicAuth(req);

    if (!credentials || credentials.name !== 'admin' || !timingSafeCompare(credentials.pass, ADMIN_PASSWORD)) {
        res.set('WWW-Authenticate', 'Basic realm="Affirm Admin"');
        return res.status(401).send('需要认证');
    }

    req.user = {
        username: 'admin',
        name: '管理员',
        role: 'admin'
    };

    next();
}

module.exports = authMiddleware;
