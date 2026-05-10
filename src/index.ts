import { generateDependencyReport } from '@discordjs/voice';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BotnekConfig, BotnekConfigJson } from './types/config';

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.botnek2', 'config.json');
const DEFAULT_DATA_ROOT = path.join(os.homedir(), '.botnek2', 'data');

const configPath = process.env.BOTNEK_CONFIG ?? DEFAULT_CONFIG_PATH;

if (!fs.existsSync(configPath)) {
    console.error(`botnek2: config not found at ${configPath}`);
    console.error('Set BOTNEK_CONFIG to override the path, or create the file.');
    process.exit(1);
}

const configFromFile = JSON.parse(fs.readFileSync(configPath, 'utf8')) as BotnekConfigJson;
const configJson: BotnekConfig = {
    ...configFromFile,
    dataRoot: process.env.BOTNEK_DATA_ROOT ?? DEFAULT_DATA_ROOT,
};

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
