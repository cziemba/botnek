// Process-wide pino logger. Singleton, materialized on first import — that's why
// src/index.ts sets process.env.LOG_LEVEL BEFORE its dynamic import of this module:
// changing LOG_LEVEL after the singleton is constructed has no effect.
//
// `redact` strips the bot token and Anthropic API key out of any logged object before
// serialization, so a panicked `log.error({ config }, ...)` (or any object that happens to
// carry these keys) can't leak secrets to logs / pm2 stdout / file transport.

import { pino } from 'pino';

const log = pino({
    level: process.env.LOG_LEVEL ?? 'trace',
    redact: {
        // Multiple paths because pino's redact globs are literal-ish — `*.token` covers
        // one-level-deep nesting (e.g. `{ webhook: { token } }`), the bare `token` covers
        // the top-level case, and `config.token` is an explicit pin for the most common
        // structured-log shape we use.
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
