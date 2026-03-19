#!/usr/bin/env node
const { healthCheck } = require('../src/health');

async function runCheckStatus() {
    const result = await healthCheck();
    const okStatuses = new Set(['healthy', 'healthy_with_warnings']);
    const isHealthy = okStatuses.has(result.status);

    console.log('📊 应用状态:', result.status);
    if (result.summary) {
        console.log(`   unhealthy=${result.summary.unhealthy}, warnings=${result.summary.warnings}`);
    }

    if (Array.isArray(result.checks)) {
        result.checks.forEach((check) => {
            console.log(`   - ${check.name}: ${check.status}`);
        });
    }

    return isHealthy;
}

if (require.main === module) {
    runCheckStatus()
        .then((success) => process.exit(success ? 0 : 1))
        .catch((error) => {
            console.error('❌ 状态检查失败:', error.message);
            process.exit(1);
        });
}

module.exports = { runCheckStatus };
