import type { LevelWithSilent } from 'pino';

export interface BotnekConfig {
    token: string;
    dataRoot: string;
    anthropicApiKey?: string;
    logLevel?: LevelWithSilent;
}
