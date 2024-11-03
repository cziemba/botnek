import { CommandInteraction, Message } from 'discord.js';
import fs from 'fs';
import { isValidSfxAlias } from '../../data/types.ts';
import log from '../../logging/logging.ts';
import { BotShim } from '../../types/command.ts';
import { sfxExists } from './common.ts';

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
        await interaction.reply({
            content: 'No alias provided',
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

    if (!sfxExists(db, alias)) {
        log.warn(`Sfx does not exist: ${alias}`);
        await interaction.reply({
            content: `Sfx \`${alias}\` does not exist!`,
            ephemeral: true,
        });
        return;
    }

    const sfxPath = soundsDb.get(alias).value();

    soundsDb.unset(alias).value();
    db.write();

    if (!fs.existsSync(sfxPath)) {
        log.warn(`Sfx file does not exist. ${sfxPath} removed from database`);
        await interaction.reply({
            content: 'Sfx file did not exist, removed.',
        });
        return;
    }

    try {
        fs.rmSync(sfxPath);
        await interaction.reply({
            content: `Deleted \`${alias}\``,
        });
    } catch (err) {
        log.error(`There was a problem removing ${sfxPath}: ${err}`);
        await interaction.reply({
            content: `An error occurred while deleting ${sfxPath}: \`${err}\``,
            ephemeral: true,
        });
    }
}
