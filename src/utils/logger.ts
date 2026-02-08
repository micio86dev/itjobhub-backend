import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                ignore: 'pid,hostname',
                translateTime: 'SYS:standard',
            },
        },
    }),
});

export default logger;
