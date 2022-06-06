import { GuildData, SfxModifier, isSfxModifier } from '../../data/types.js';
import { LowWithLodash } from '../../data/db.js';
import log from '../../logging/logging.js';
import LocalTrack from '../../audio/tracks/localTrack.js';
import ffmpegAdjustRate from '../../utils/ffmpeg.js';

export function sfxAliasToString(sfxAlias: string, sfxModifiers: SfxModifier[]): string {
    const modifiersString = sfxModifiers.length === 0 ? ''
        : `[${sfxModifiers.join(',')}]`;
    return `\`${sfxAlias}${modifiersString}\``;
}

export function sfxExists(db: LowWithLodash<GuildData>, alias: string): boolean {
    const soundsDb = db.chain.get('sfx').get('sounds');
    return soundsDb.has(alias).value();
}

export function parseSfxAlias(alias: string): { parsedAlias: string, modifiers: SfxModifier[] } {
    const aliasParts = alias.split('#');
    log.debug(`Recieved aliasParts=[${aliasParts.join(',')}]`);
    if (aliasParts.length < 1) {
        throw new Error(`Could not parse sfx alias: ${alias}!`);
    }

    if (aliasParts.length === 1) {
        return { parsedAlias: aliasParts[0], modifiers: [] };
    }

    const mods = aliasParts.slice(1)
        .map((m) => isSfxModifier(m))
        .filter((m) => m !== SfxModifier.UNKNOWN)
        .slice(0, 2);
    return { parsedAlias: aliasParts[0], modifiers: mods };
}

export function handleModifiers(sfxFile: string, sfxAlias: string, modifiers: SfxModifier[], guildDir: string): LocalTrack {
    if (modifiers.length === 0) {
        return new LocalTrack(sfxFile, sfxAlias);
    }
    let finalPath = sfxFile;
    for (let i = 0; i < modifiers.length; i += 1) {
        switch (String(modifiers[i])) {
            case SfxModifier.TURBO: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 4 / 3);
                break;
            }
            case SfxModifier.TURBO2: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 2);
                break;
            }
            case SfxModifier.SLOW: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 3 / 4);
                break;
            }
            case SfxModifier.SLOW2: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 1 / 2);
                break;
            }
            default: {
                break;
            }
        }
    }
    return new LocalTrack(finalPath, `${sfxAlias} [${modifiers.join(',')}]`);
}
