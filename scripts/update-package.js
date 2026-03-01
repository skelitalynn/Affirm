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
