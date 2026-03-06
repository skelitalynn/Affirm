#!/usr/bin/env node
/**
 * Notion integration diagnostics (static + lightweight checks).
 */

const fs = require('fs');
const path = require('path');

function ok(msg) { console.log(`[OK] ${msg}`); }
function warn(msg) { console.log(`[WARN] ${msg}`); }
function fail(msg) { console.log(`[FAIL] ${msg}`); }

function projectPath(...parts) {
    return path.join(__dirname, '..', ...parts);
}

function checkFile(relPath) {
    const fullPath = projectPath(relPath);
    const exists = fs.existsSync(fullPath);
    if (exists) {
        ok(`${relPath}`);
    } else {
        fail(`${relPath}`);
    }
    return exists;
}

function tryRequire(relPath) {
    try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        require(projectPath(relPath));
        ok(`require ${relPath}`);
        return true;
    } catch (error) {
        fail(`require ${relPath}: ${error.message}`);
        return false;
    }
}

async function run() {
    console.log('Notion Integration Diagnostics\n');

    const requiredFiles = [
        'src/services/notion.js',
        'skills/notion/config.js',
        'skills/notion/client.js',
        'skills/notion/archiver.js',
        'skills/notion/retry.js',
        'skills/notion/tracker.js',
        'src/services/telegram.js'
    ];

    let allFiles = true;
    for (const file of requiredFiles) {
        allFiles = checkFile(file) && allFiles;
    }

    console.log('');
    const modules = [
        'src/services/notion',
        'skills/notion/config',
        'skills/notion/client',
        'skills/notion/archiver'
    ];

    for (const modulePath of modules) {
        tryRequire(modulePath);
    }

    console.log('');
    const telegramPath = projectPath('src/services/telegram.js');
    if (fs.existsSync(telegramPath)) {
        const source = fs.readFileSync(telegramPath, 'utf8');
        if (source.includes('NotionService')) {
            ok('telegram service references notion service');
        } else {
            warn('telegram service does not reference notion service');
        }
    }

    if (!allFiles) {
        process.exitCode = 1;
        return;
    }

    ok('diagnostics complete');
}

run().catch((error) => {
    fail(error.stack || error.message);
    process.exit(1);
});
