// Jest global teardown: close shared resources (e.g. DB pool)
module.exports = async () => {
    try {
        // Lazy-require to avoid initializing DB when tests don't need it
        const { db } = require('../src/db/connection');
        if (db && typeof db.close === 'function') {
            await db.close();
        }
    } catch (e) {
        // Ignore teardown errors to avoid masking test failures
    }
};

