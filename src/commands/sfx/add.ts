import path from 'path';
import fs from 'fs';
import { CommandInteraction, Message } from 'discord.js';
import { BotShim } from '../../types/command.ts';
import { isValidSfxAlias } from '../../data/types.ts';
import log from '../../logging/logging.ts';
import YoutubeTrack from '../../audio/tracks/youtubeTrack.ts';
import { RANDOM, sfxExists } from './common.ts';

export interface SfxAddParams {
    alias?: string;
    url?: string;
}

export const RESERVED_ALIAS = [RANDOM];

export async function sfxAdd(client: BotShim, interaction: CommandInteraction<'cached'> | Message<true>, params: SfxAddParams): Promise<void> {
    const db = client.databases.get(interaction.guildId)?.db!;
    const { alias, url } = params;

    if (!alias || !url) {
        await interaction.reply({
            content: 'Invalid input, please provide an alias and url',
            ephemeral: true,
        });
        return;
    }

    if (RESERVED_ALIAS.includes(alias)) {
        log.warn(`Reserved alias provided ${alias}`);
        await interaction.reply(
            {
                content: `\`${alias}\` is a reserved alias.`,
                ephemeral: true,
            },
        );
        return;
    }

    if (!isValidSfxAlias(alias)) {
        log.warn(`Invalid alias provided ${alias}`);
        await interaction.reply(
            {
                content: `\`${alias}\` is not a valid alias, only lowercase and numbers allowed.`,
                ephemeral: true,
            },
        );
        return;
    }

    const soundsDb = db.chain.get('sfx').get('sounds');

    if (sfxExists(db, alias)) {
        log.warn(`Alias already exists: ${alias}`);
        await interaction.reply(
            {
                content: `Sfx ${alias} already exists!`,
                ephemeral: true,
            },
        );
        return;
    }

    const validYoutube = YoutubeTrack.checkUrl(url);
    if (!validYoutube) {
        log.warn(`URL ${url} is not a valid youtube url`);
        await interaction.reply(
            {
                content: `URL ${url} is not supported`,
                ephemeral: true,
            },
        );
        return;
    }

    const soundsPath = path.resolve(path.join(client.config.dataRoot, interaction.guildId, 'sounds'));

    if (!fs.existsSync(soundsPath)) {
        log.info(`First time adding sfx, creating dir ${soundsPath}`);
        fs.mkdirSync(soundsPath, { recursive: true });
    }

    await YoutubeTrack.fromUrl(url)
        .then((track) => {
            if (parseInt(track.videoDetails.lengthSeconds, 10) > 30) throw new Error(`${url} clip is too long, must be < 30s.`);
            return track;
        })
        .then((track) => track.saveAudio(soundsPath))
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
                content: `An error occurred: ${err}`,
                ephemeral: true,
            });
        });
}
