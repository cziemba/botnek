import { Snowflake } from 'discord-api-types/globals';
import { EmoteConfig } from './types/emote';

/**
 * SfxAlias w/ auxiliary type union to ensure strings are not accepted in place.
 */
export type SfxAlias = string & { __validSfxAlias: true };

/**
 * Sfx Alias type check and casting; alphanumeric only.
 * @param alias alias to check.
 */
export function isValidSfxAlias(alias: string): alias is SfxAlias {
    const re = /^[a-z0-9]{1,20}$/;
    return re.test(alias);
}

/**
 * Supported sfx mods
 */
export enum SfxModifier {
    'UNKNOWN' = 'UNKNOWN',
    'TURBO' = 'TURBO',
    'TURBO2' = 'TURBO2',
    'SLOW' = 'SLOW',
    'SLOW2' = 'SLOW2',
}

/**
 * Type check and conversion for potential sfx modifiers.
 * @param modifier modifier to check/cast.
 */
export function isSfxModifier(modifier: string): SfxModifier {
    const upperModifier = modifier.toUpperCase();
    if (upperModifier in SfxModifier) {
        return SfxModifier[upperModifier];
    }
    return SfxModifier.UNKNOWN;
}

/**
 * Sound effects: key/value pairs of alias to sound file
 */
export type SfxConfig = {
    sounds: { [key: SfxAlias]: string };
};

/**
 * Webhooks: registered webhooks are identified by channel id
 */
export type WebhookConfig = {
    [channel: Snowflake]: {
        hookName: string;
        id: Snowflake;
        token: string;
    }[];
};

/**
 * Model for the per guild database
 */
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
