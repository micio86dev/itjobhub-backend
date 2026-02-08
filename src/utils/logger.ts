import pino from 'pino';

// Production-ready JSON logging (no pino-pretty - it's not bundled by Bun)
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

export default logger;
