/**
 * Use {@link isValidSfxAlias} to validate alias.
 */
import { Snowflake } from 'discord-api-types/globals';
import { EmoteConfig } from './types/emote.ts';

export type SfxAlias = string & { __validSfxAlias: true };

export function isValidSfxAlias(alias: string): alias is SfxAlias {
    const re = /^[a-z0-9]{1,20}$/;
    return re.test(alias);
}

export enum SfxModifier {
    'UNKNOWN' = 'UNKNOWN',
    'TURBO' = 'TURBO',
    'TURBO2' = 'TURBO2',
    'SLOW' = 'SLOW',
    'SLOW2' = 'SLOW2',
}

export function isSfxModifier(modifier: string): SfxModifier {
    const upperModifier = modifier.toUpperCase();
    if (upperModifier in SfxModifier) {
        return SfxModifier[upperModifier];
    }
    return SfxModifier.UNKNOWN;
}

// Sfx is registered per alias
export type SfxConfig = {
    sounds: { [ key: SfxAlias ]: string };
};

// Webhooks are per channel
export type WebhookConfig = {
    [ channel: Snowflake ]: {
        hookName: string,
        id: Snowflake,
        token: string,
    }[];
};

export type GuildData = {
    sfx: SfxConfig;
    webhooks: WebhookConfig;
    emoteConfig: EmoteConfig;
};

// Base set of data for a guild, set on init.
export const DEFAULT_GUILD_DATA: GuildData = {
    sfx: {
        sounds: {},
    },
    webhooks: {},
    emoteConfig: {
        emotes: {},
    },
};
