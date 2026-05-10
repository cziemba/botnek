import { pino } from 'pino';

const log = pino({
    level: process.env.LOG_LEVEL ?? 'trace',
    redact: {
        paths: [
            'token',
            'anthropicApiKey',
            '*.token',
            '*.anthropicApiKey',
            'config.token',
            'config.anthropicApiKey',
        ],
        censor: '[REDACTED]',
    },
});

export default log;
