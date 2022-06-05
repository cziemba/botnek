/**
 * Use {@link isValidSfxAlias} to validate alias.
 */

export type SfxAlias = string & { __validSfxAlias: true };

export function isValidSfxAlias(alias: string): alias is SfxAlias {
    const re = /[a-z0-9]{1,20}$/;
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

export type SfxConfig = {
    sounds: { [ key: SfxAlias ]: string };
};

export type GuildData = {
    sfx: SfxConfig;
};

export const DEFAULT_GUILD_DATA = {
    sfx: {
        sounds: {},
    },
};
