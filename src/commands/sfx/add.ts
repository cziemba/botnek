/* eslint-disable import-x/no-named-as-default-member */
import { CommandInteraction, Message } from 'discord.js';
import fs from 'fs';
import moment from 'moment';
import path from 'path';
import YoutubeTrack from '../../audio/tracks/youtubeTrack';
import { isValidSfxAlias } from '../../data/types';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
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

const MAX_SFX_LENGTH_SECONDS = 30;

export async function sfxAdd(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    params: SfxAddParams,
): Promise<void> {
    const db = client.databases.get(interaction.guildId)?.db!;
    const { alias, url, startTime, endTime } = params;

    log.info(JSON.stringify(params));

    if (!alias || !url) {
        await interaction.reply({
            content: 'Invalid input, please provide an alias and url',
            ephemeral: true,
        });
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
        await interaction.reply({
            content: 'startTime cannot be after endTime.',
            ephemeral: true,
        });
        return;
    }

    if (RESERVED_ALIAS.includes(alias)) {
        log.warn(`Reserved alias provided ${alias}`);
        await interaction.reply({
            content: `\`${alias}\` is a reserved alias.`,
            ephemeral: true,
        });
        return;
    }

    if (!isValidSfxAlias(alias)) {
        log.warn(`Invalid alias provided ${alias}`);
        await interaction.reply({
            content: `\`${alias}\` is not a valid alias, only lowercase and numbers allowed.`,
            ephemeral: true,
        });
        return;
    }

    const soundsDb = db.chain.get('sfx').get('sounds');

    if (sfxExists(db, alias)) {
        log.warn(`Alias already exists: ${alias}`);
        await interaction.reply({
            content: `Sfx ${alias} already exists!`,
            ephemeral: true,
        });
        return;
    }

    const validYoutube = YoutubeTrack.checkUrl(url);
    if (!validYoutube) {
        log.warn(`URL ${url} is not a valid youtube url`);
        await interaction.reply({
            content: `URL ${url} is not supported`,
            ephemeral: true,
        });
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
            if (startFromSeconds) {
                if (videoLengthSeconds - startFromSeconds > MAX_SFX_LENGTH_SECONDS) {
                    if (!endAtSeconds || endAtSeconds - startFromSeconds > MAX_SFX_LENGTH_SECONDS) {
                        throw new Error(
                            `Too long: [${url}] would be > ${MAX_SFX_LENGTH_SECONDS} seconds.`,
                        );
                    }
                    if (videoLengthSeconds < endAtSeconds - startFromSeconds) {
                        throw new Error(
                            `Duration ${endAtSeconds - startFromSeconds} greater than video length ${videoLengthSeconds}`,
                        );
                    }
                }
            } else if (videoLengthSeconds > MAX_SFX_LENGTH_SECONDS) {
                throw new Error(`Too long: [${url}] would be > ${MAX_SFX_LENGTH_SECONDS} seconds.`);
            }
            return track;
        })
        .then((track) => track.saveAudio(soundsPath, startFromSeconds, endAtSeconds))
        .then((filePath) => {
            soundsDb.set(alias, filePath).value();
            db.write();
        })
        .then(() => {
            interaction.reply({
                content: `Added \`${alias}\``,
            });
        })
        .catch((err) => {
            interaction.reply({
                content: `An error occurred [see logs for full details]: \`\`\`\n${err.message.substring(0, 1500)}\n[...TRUNCATED...]\n\`\`\``,
                ephemeral: true,
            });
        });
}
