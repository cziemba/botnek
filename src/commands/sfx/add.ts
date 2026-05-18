// `/sfx add <alias> <url> [start] [end]` — download a YouTube clip, optionally trim
// it, and persist the path under the alias in the per-guild lowdb. After this completes,
// the sfx is playable via `/sfx play <alias>` until removed via `/sfx del`.
//
// Long-running: the YouTube fetch + ffmpeg trim can take 10s+ on slow connections.
// Callers should expect the reply to lag.

/* eslint-disable import-x/no-named-as-default-member */
import { CommandInteraction, Message } from 'discord.js';
import fs from 'fs';
import moment from 'moment';
import path from 'path';
import YoutubeTrack from '../../audio/tracks/youtubeTrack';
import { guildDir, toStoredSfxPath } from '../../data/sfxPaths';
import { isValidSfxAlias } from '../../data/types';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { replyMaybeEphemeral } from '../queueControl';
import { RANDOM, sfxExists } from './common';

export interface SfxAddParams {
    alias?: string;
    url?: string;
    startTime?: string;
    endTime?: string;
}

// Three accepted user input shapes:
//   - "1:30"     -> ISO duration with colon, parsed as MM:SS
//   - "90s"      -> "PT90S" ISO 8601 duration string ("XmYs" also works)
//   - "90"       -> bare number, assumed seconds
// moment.duration is permissive but its output is silently zero on parse failure;
// upstream callers should treat asSeconds() === 0 with suspicion.
export const momentParse = (time: string) => {
    if (time.includes(':')) {
        return moment.duration(time);
    } else if (time.includes('s')) {
        return moment.duration('PT' + time.toUpperCase());
    } else {
        return moment.duration('PT' + time.toString() + 'S');
    }
};

// Aliases the user can't bind because they're keywords elsewhere in the parser
// (e.g. RANDOM is intercepted in normalizeAliasInput to roll a random sfx).
export const RESERVED_ALIAS = [RANDOM];

// Cap on resulting clip length. Conservative because sfx are meant to be short stingers;
// raising this risks abuse (full songs) and burns disk per-guild.
export const MAX_SFX_LENGTH_SECONDS = 30;

export interface SfxRangeCheckInput {
    videoLengthSeconds: number;
    startFromSeconds?: number;
    endAtSeconds?: number;
    maxSeconds?: number;
}

export interface SfxRangeCheckResult {
    ok: boolean;
    effectiveStart: number;
    effectiveEnd: number;
    durationSeconds: number;
    reason?: string;
}

// Single source of truth for whether a (start, end, videoLength) tuple yields a legal
// clip. Compute the effective window first (clamping end to videoLength so a runaway
// `--end 99999` doesn't bypass the cap), then a single duration check. The previous
// implementation in this file had a nested-conditional bug that could accept windows
// longer than MAX_SFX_LENGTH_SECONDS in some shapes — this rewrite eliminates the
// short-circuit hazard.
export function validateSfxRange({
    videoLengthSeconds,
    startFromSeconds,
    endAtSeconds,
    maxSeconds = MAX_SFX_LENGTH_SECONDS,
}: SfxRangeCheckInput): SfxRangeCheckResult {
    const effectiveStart = startFromSeconds ?? 0;
    const effectiveEnd = Math.min(endAtSeconds ?? videoLengthSeconds, videoLengthSeconds);
    const durationSeconds = effectiveEnd - effectiveStart;

    if (durationSeconds <= 0) {
        return {
            ok: false,
            effectiveStart,
            effectiveEnd,
            durationSeconds,
            reason: `Effective duration must be positive (got ${durationSeconds}s).`,
        };
    }
    if (durationSeconds > maxSeconds) {
        return {
            ok: false,
            effectiveStart,
            effectiveEnd,
            durationSeconds,
            reason: `Too long: clip would be ${durationSeconds}s, max is ${maxSeconds}s.`,
        };
    }
    return { ok: true, effectiveStart, effectiveEnd, durationSeconds };
}

export async function sfxAdd(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    params: SfxAddParams,
): Promise<void> {
    const db = client.databases.get(interaction.guildId)?.db!;
    const { alias, url, startTime, endTime } = params;

    log.info(JSON.stringify(params));

    if (!alias || !url) {
        await replyMaybeEphemeral(
            interaction,
            'Invalid input, please provide an alias and url',
            true,
        );
        return;
    }

    let startFromSeconds: number | undefined = undefined;
    if (startTime) {
        const startFrom = momentParse(startTime);
        startFromSeconds = startFrom.asSeconds();
        log.info(`startTime=${startTime} startFromSeconds=${startFromSeconds}`);
    }

    let endAtSeconds: number | undefined = undefined;
    if (endTime) {
        const endAt = momentParse(endTime);
        endAtSeconds = endAt.asSeconds();
        log.info(`endTime=${endTime} endAtSeconds=${endAtSeconds}`);
    }

    if (startFromSeconds && endAtSeconds && startFromSeconds > endAtSeconds) {
        await replyMaybeEphemeral(interaction, 'startTime cannot be after endTime.', true);
        return;
    }

    if (RESERVED_ALIAS.includes(alias)) {
        log.warn(`Reserved alias provided ${alias}`);
        await replyMaybeEphemeral(interaction, `\`${alias}\` is a reserved alias.`, true);
        return;
    }

    if (!isValidSfxAlias(alias)) {
        log.warn(`Invalid alias provided ${alias}`);
        await replyMaybeEphemeral(
            interaction,
            `\`${alias}\` is not a valid alias, only lowercase and numbers allowed.`,
            true,
        );
        return;
    }

    const soundsDb = db.chain.get('sfx').get('sounds');

    if (sfxExists(db, alias)) {
        log.warn(`Alias already exists: ${alias}`);
        await replyMaybeEphemeral(interaction, `Sfx ${alias} already exists!`, true);
        return;
    }

    const validYoutube = YoutubeTrack.checkUrl(url);
    if (!validYoutube) {
        log.warn(`URL ${url} is not a valid youtube url`);
        await replyMaybeEphemeral(interaction, `URL ${url} is not supported`, true);
        return;
    }

    const guildDirPath = guildDir(client.config.dataRoot, interaction.guildId);
    const soundsPath = path.resolve(path.join(guildDirPath, 'sounds'));

    if (!fs.existsSync(soundsPath)) {
        log.info(`First time adding sfx, creating dir ${soundsPath}`);
        fs.mkdirSync(soundsPath, { recursive: true });
    }

    // FOOTGUN (tracked in staleness.md): the success branch issues `interaction.reply`
    // inside a chained .then. If the YouTube fetch + ffmpeg trim takes long enough that
    // the interaction token expires (~15min for an un-deferred slash command, longer with
    // deferReply), the reply throws and gets swallowed by the .catch below. A defensible
    // fix is to call interaction.deferReply() up front and editReply() at the end.
    await YoutubeTrack.fromUrl(url)
        .then((track) => {
            const videoLengthSeconds = parseInt(track.videoDetails.lengthSeconds, 10);
            const range = validateSfxRange({
                videoLengthSeconds,
                startFromSeconds,
                endAtSeconds,
            });
            if (!range.ok) {
                throw new Error(`${range.reason} [${url}]`);
            }
            return track;
        })
        .then((track) => track.saveAudio(soundsPath, startFromSeconds, endAtSeconds))
        .then((filePath) => {
            // Persist alias -> path relative to the guild dir. Relative storage keeps the
            // db portable across hosts (Pi -> Docker -> wherever) — saveAudio's deterministic
            // naming means re-adds of the same (title, trim) pair point at the existing file
            // rather than re-downloading.
            soundsDb.set(alias, toStoredSfxPath(guildDirPath, filePath)).value();
            db.write();
        })
        .then(() => replyMaybeEphemeral(interaction, `Added \`${alias}\``))
        .catch((err) =>
            // Truncate to keep the reply under Discord's 2000-char message limit;
            // ffmpeg/ytdl errors regularly include multi-KB stack traces.
            replyMaybeEphemeral(
                interaction,
                `An error occurred [see logs for full details]: \`\`\`\n${err.message.substring(0, 1500)}\n[...TRUNCATED...]\n\`\`\``,
                true,
            ),
        );
}
