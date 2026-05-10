import type { LevelWithSilent } from 'pino';

// Shape of the user-authored config.json file.
export interface BotnekConfigJson {
    token: string;
    anthropicApiKey?: string;
    logLevel?: LevelWithSilent;
}

// Resolved runtime config: BotnekConfigJson + dataRoot (resolved from env var or default).
export interface BotnekConfig extends BotnekConfigJson {
    dataRoot: string;
}
