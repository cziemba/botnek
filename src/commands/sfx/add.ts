/* eslint-disable import-x/no-named-as-default-member */
import { CommandInteraction, Message } from 'discord.js';
import fs from 'fs';
import moment from 'moment';
import path from 'path';
import YoutubeTrack from '../../audio/tracks/youtubeTrack';
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

export const momentParse = (time: string) => {
    if (time.includes(':')) {
        return moment.duration(time);
    } else if (time.includes('s')) {
        return moment.duration('PT' + time.toUpperCase());
    } else {
        // assume seconds
        return moment.duration('PT' + time.toString() + 'S');
    }
};

export const RESERVED_ALIAS = [RANDOM];

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

    const soundsPath = path.resolve(
        path.join(client.config.dataRoot, interaction.guildId, 'sounds'),
    );

    if (!fs.existsSync(soundsPath)) {
        log.info(`First time adding sfx, creating dir ${soundsPath}`);
        fs.mkdirSync(soundsPath, { recursive: true });
    }

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
            soundsDb.set(alias, filePath).value();
            db.write();
        })
        .then(() => replyMaybeEphemeral(interaction, `Added \`${alias}\``))
        .catch((err) =>
            replyMaybeEphemeral(
                interaction,
                `An error occurred [see logs for full details]: \`\`\`\n${err.message.substring(0, 1500)}\n[...TRUNCATED...]\n\`\`\``,
                true,
            ),
        );
}
