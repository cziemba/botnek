import { CommandInteraction, Message } from 'discord.js';
import fs from 'fs';
import { isValidSfxAlias } from '../../data/types';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { replyMaybeEphemeral } from '../queueControl';
import { sfxExists } from './common';

export interface SfxDelParams {
    alias?: string;
}

export async function sfxDel(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    params: SfxDelParams,
): Promise<void> {
    const db = client.databases.get(interaction.guildId)?.db!;
    const { alias } = params;

    if (!alias) {
        await replyMaybeEphemeral(interaction, 'No alias provided', true);
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

    if (!sfxExists(db, alias)) {
        log.warn(`Sfx does not exist: ${alias}`);
        await replyMaybeEphemeral(interaction, `Sfx \`${alias}\` does not exist!`, true);
        return;
    }

    const sfxPath = soundsDb.get(alias).value();

    soundsDb.unset(alias).value();
    db.write();

    if (!fs.existsSync(sfxPath)) {
        log.warn(`Sfx file does not exist. ${sfxPath} removed from database`);
        await replyMaybeEphemeral(interaction, 'Sfx file did not exist, removed.');
        return;
    }

    try {
        fs.rmSync(sfxPath);
        await replyMaybeEphemeral(interaction, `Deleted \`${alias}\``);
    } catch (err) {
        log.error(`There was a problem removing ${sfxPath}: ${err}`);
        await replyMaybeEphemeral(
            interaction,
            `An error occurred while deleting ${sfxPath}: \`${err}\``,
            true,
        );
    }
}
