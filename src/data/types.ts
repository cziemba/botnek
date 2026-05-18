// Per-guild lowdb schema. Any shape change here is a silent breaking change for existing
// guilds — there is no migration framework today, so old `db.json` files just deserialize
// with missing fields. Either default-fill in code or add a schemaVersion field before
// reshaping these types in production.

import { Snowflake } from 'discord-api-types/globals';
import { EmoteConfig } from './types/emote';

/**
 * Branded alias type. The brand is only enforced by the `isValidSfxAlias` type guard below —
 * if you cast or non-null-assert your way around the guard, TypeScript will not catch it and
 * you'll let untrusted user input flow into places that assume the regex has held.
 */
export type SfxAlias = string & { __validSfxAlias: true };

/**
 * Lowercase alphanumeric, 1-20 chars. Tight enough to be safe to interpolate into shell
 * commands (see src/utils/ffmpeg.ts) and into filesystem paths without escaping.
 */
export function isValidSfxAlias(alias: string): alias is SfxAlias {
    const re = /^[a-z0-9]{1,20}$/;
    return re.test(alias);
}

/**
 * Modifier suffixes parsed from `alias#MOD#MOD` syntax in `/sfx play`. Mapped to ffmpeg
 * filter chains in src/utils/ffmpeg.ts. Adding a new modifier = enum entry here + handler in
 * src/commands/sfx/common.ts#handleModifiers.
 */
export enum SfxModifier {
    'UNKNOWN' = 'UNKNOWN',
    'TURBO' = 'TURBO',
    'TURBO2' = 'TURBO2',
    'SLOW' = 'SLOW',
    'SLOW2' = 'SLOW2',
    'BASS' = 'BASS',
    'BASS2' = 'BASS2',
}

/**
 * Returns SfxModifier.UNKNOWN (rather than throwing or returning undefined) for unrecognized
 * input so callers can filter the unknowns out without try/catch noise.
 */
export function isSfxModifier(modifier: string): SfxModifier {
    const upperModifier = modifier.toUpperCase();
    if (upperModifier in SfxModifier) {
        return SfxModifier[upperModifier];
    }
    return SfxModifier.UNKNOWN;
}

/**
 * `sounds[alias]` is the path to the BASE (unmodified) mp3, stored **relative to the
 * guild dir** (`${dataRoot}/${guildId}/`) so the db stays portable across hosts. Resolve
 * with `resolveSfxPath` from `src/data/sfxPaths.ts` — it also tolerates the legacy
 * absolute-path form for partially-migrated databases. Modifier variants live as sibling
 * files in `${guildDir}/ffmpeg/` and are not tracked in the db (pure regen cache, safe
 * to delete).
 */
export type SfxConfig = {
    sounds: { [key: SfxAlias]: string };
};

/**
 * Webhooks created by `/emote enable` for the bot's webhook-impersonation send path. Token is
 * stored plaintext on purpose — that's what lets the bot send through the hook from any
 * process after a restart. Keep `db.json` off shared filesystems for this reason.
 *
 * Array-of-hooks-per-channel is future-proofing; today only `EMOTE_HOOK_NAME` ('emojiHook')
 * is ever stored or looked up.
 */
export type WebhookConfig = {
    [channel: Snowflake]: {
        hookName: string;
        id: Snowflake;
        token: string;
    }[];
};

export type GuildData = {
    sfx: SfxConfig;
    webhooks: WebhookConfig;
    emoteConfig: EmoteConfig;
};

// Seeded into a fresh db.json on first boot. Keep all top-level fields populated with their
// empty containers — code paths assume `db.data.sfx.sounds` etc. exist without nullable checks.
export const DEFAULT_GUILD_DATA: GuildData = {
    sfx: {
        sounds: {},
    },
    webhooks: {},
    emoteConfig: {
        emotes: {},
    },
};
