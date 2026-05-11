// Process entrypoint. Resolves config + dataRoot from env (with sensible defaults), then hands off
// to the Botnek class. Boot order matters here: LOG_LEVEL must be in the env before the logger
// module is imported, so logger / Botnek imports are deliberately dynamic and below that block.

import { generateDependencyReport } from '@discordjs/voice';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BotnekConfig, BotnekConfigJson } from './types/config';

// Config and data live outside the repo by default so the same checkout can run in dev and prod
// without churn. Operators bind-mount these via $BOTNEK_CONFIG / $BOTNEK_DATA_ROOT in Docker.
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.botnek2', 'config.json');
const DEFAULT_DATA_ROOT = path.join(os.homedir(), '.botnek2', 'data');

const configPath = process.env.BOTNEK_CONFIG ?? DEFAULT_CONFIG_PATH;

if (!fs.existsSync(configPath)) {
    // Use console.error here (not the pino logger) — the logger isn't imported yet, and
    // pre-config errors must surface even when log level is silenced.
    console.error(`botnek2: config not found at ${configPath}`);
    console.error('Set BOTNEK_CONFIG to override the path, or create the file.');
    process.exit(1);
}

const configFromFile = JSON.parse(fs.readFileSync(configPath, 'utf8')) as BotnekConfigJson;
// dataRoot is intentionally NOT in the JSON — it's an env-only knob so the config file can be
// committed/templated without coupling it to the host's mount path.
const configJson: BotnekConfig = {
    ...configFromFile,
    dataRoot: process.env.BOTNEK_DATA_ROOT ?? DEFAULT_DATA_ROOT,
};

// pino reads process.env.LOG_LEVEL once at module-init time and caches it on the singleton.
// Push the config-supplied level into the env BEFORE the dynamic imports below so the logger
// picks it up; otherwise we'd be stuck on the default `trace` regardless of config.
if (configJson.logLevel) {
    process.env.LOG_LEVEL = configJson.logLevel;
}

// Top-level await is ESM-only (this project is type=module / Node >= 22). Dynamic imports here
// are load-bearing for the LOG_LEVEL ordering above — switching them to static imports would
// hoist the logger init back above the env mutation.
const { default: Botnek } = await import('./bot');
const { default: log } = await import('./logging/logging');

// Logs which native voice deps (opus, sodium, ffmpeg) discord.js detected. Useful at boot to
// catch missing system packages before the first /play attempt fails opaquely.
log.info(generateDependencyReport());

const botnek = new Botnek(configJson);

// Bound how long we wait for graceful shutdown (audio handlers stopping, websocket destroy,
// lowdb flush). pm2 sends SIGKILL ~16s after SIGTERM by default; staying under that lets us
// always exit on our own terms with a clear log line.
const SHUTDOWN_TIMEOUT_MS = 10_000;

const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down`);
    const timer = setTimeout(() => {
        log.warn(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, exiting`);
        process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    // unref so the timer itself doesn't keep the event loop alive once shutdown finishes early.
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
