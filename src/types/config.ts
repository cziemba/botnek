// Two-layer config: BotnekConfigJson is what the user authors on disk; BotnekConfig is the
// resolved runtime shape after env-var overlay. Splitting them keeps `dataRoot` out of the
// JSON (it's an env-only knob — see src/index.ts) so the same config file can be reused
// across hosts with different mount paths.

import type { LevelWithSilent } from 'pino';

export interface BotnekConfigJson {
    token: string;
    anthropicApiKey?: string;
    logLevel?: LevelWithSilent;
}

export interface BotnekConfig extends BotnekConfigJson {
    dataRoot: string;
}
