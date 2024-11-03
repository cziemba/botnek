import { CommandInteraction, Message } from 'discord.js';
import path from 'path';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { handleModifiers, loadSfxPath, parseSfxAlias, sfxAliasToString } from './common';

export interface SfxPlayParams {
    alias?: string;
}

export async function sfxPlay(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    params: SfxPlayParams,
): Promise<void> {
    const audio = client.audioHandlers.get(interaction.guildId)!;
    const db = client.databases.get(interaction.guildId)?.db!;
    const { alias } = params;

    if (!alias) {
        await interaction.reply({
            content: 'No sfx alias provided!',
            ephemeral: true,
        });
        return;
    }

    const { parsedAlias, modifiers } = parseSfxAlias(db, alias);

    log.debug(`Parsed sfx play: ${parsedAlias} modifiers=[${modifiers.join(', ')}]`);

    const sfxPath = loadSfxPath(db, parsedAlias);

    if (!sfxPath) {
        log.info(`Unknown sfx ${parsedAlias}`);
        await interaction.reply({
            content: `\`${parsedAlias}\` does not exist!`,
            ephemeral: true,
        });
        return;
    }

    const guildDir = path.resolve(path.join(client.config.dataRoot, interaction.guildId));

    await interaction.reply({
        content: `Playing \`${sfxAliasToString(parsedAlias, modifiers)}\``,
    });

    await audio.enqueue({
        interaction,
        track: handleModifiers(sfxPath, parsedAlias, modifiers, guildDir),
    });
}
