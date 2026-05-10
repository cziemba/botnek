import { generateDependencyReport } from '@discordjs/voice';
import configJsonRaw from './config.json' with { type: 'json' };
import { BotnekConfig } from './types/config';

const configJson = configJsonRaw as BotnekConfig;

// Set env var BEFORE importing the logger so the singleton picks it up at construction.
if (configJson.logLevel) {
    process.env.LOG_LEVEL = configJson.logLevel;
}

const { default: Botnek } = await import('./bot');
const { default: log } = await import('./logging/logging');

log.info(generateDependencyReport());

const botnek = new Botnek(configJson);

// 10-second timeout guards against a stuck connection blocking exit.
const SHUTDOWN_TIMEOUT_MS = 10_000;

const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down`);
    const timer = setTimeout(() => {
        log.warn(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, exiting`);
        process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    try {
        await botnek.shutdown();
    } catch (e) {
        log.error({ err: e }, 'Error during shutdown');
    }
    process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await botnek.login(configJson.token);
