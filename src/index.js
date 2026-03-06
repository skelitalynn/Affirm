#!/usr/bin/env node
/**
 * Main entrypoint for Affirm bot service.
 */
require('dotenv').config();

const http = require('http');
const TelegramService = require('./services/telegram');
const config = require('./config');
const { healthCheck } = require('./health');

let telegramService = null;
let healthServer = null;
let shuttingDown = false;

async function startHealthServer() {
    const port = Number(config.app.port || 3000);

    healthServer = http.createServer(async (req, res) => {
        if (req.url === '/health') {
            try {
                const result = await healthCheck();
                const statusCode = result.status === 'healthy' ? 200 : 503;
                res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'unhealthy', error: error.message }));
            }
            return;
        }

        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Affirm service is running');
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    });

    await new Promise((resolve, reject) => {
        const onError = (error) => {
            healthServer.removeListener('listening', onListening);
            reject(error);
        };

        const onListening = () => {
            healthServer.removeListener('error', onError);
            resolve();
        };

        healthServer.once('error', onError);
        healthServer.once('listening', onListening);
        healthServer.listen(port);
    });

    console.log(`Health server listening on :${port}`);
}

async function stopServices(exitCode = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    console.log('Shutting down services...');

    if (telegramService) {
        try {
            await Promise.resolve(telegramService.stop());
        } catch (error) {
            console.error('Failed to stop telegram service:', error.message);
        }
    }

    if (healthServer) {
        await new Promise((resolve) => {
            healthServer.close(() => resolve());
        });
        healthServer = null;
    }

    process.exit(exitCode);
}

async function initialize() {
    console.log('Starting Affirm service...');
    console.log(`Environment: ${config.app.nodeEnv || 'development'}`);

    try {
        await startHealthServer();

        telegramService = new TelegramService(config);
        await telegramService.start();

        console.log('Affirm service started');
    } catch (error) {
        console.error('Startup failed:', error.message);
        console.error(error.stack);
        await stopServices(1);
    }
}

process.on('SIGINT', () => stopServices(0));
process.on('SIGTERM', () => stopServices(0));

process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error.message);
    console.error(error.stack);
    await stopServices(1);
});

process.on('unhandledRejection', async (reason) => {
    console.error('Unhandled rejection:', reason);
    await stopServices(1);
});

if (require.main === module) {
    initialize();
}

module.exports = { initialize };
