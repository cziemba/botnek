// `/sfx play <alias>` — enqueue a single previously-added sfx, optionally with
// modifiers (`alias#TURBO#BASS`). Modifier compilation happens via handleModifiers,
// which may shell out to ffmpeg if the (alias, mod) tuple isn't already cached.

import { CommandInteraction, Message } from 'discord.js';
import { guildDir } from '../../data/sfxPaths';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { replyMaybeEphemeral } from '../queueControl';
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
        await replyMaybeEphemeral(interaction, 'No sfx alias provided!', true);
        return;
    }

    const { parsedAlias, modifiers } = parseSfxAlias(db, alias);

    log.debug(`Parsed sfx play: ${parsedAlias} modifiers=[${modifiers.join(', ')}]`);

    const guildDirPath = guildDir(client.config.dataRoot, interaction.guildId);
    const sfxPath = loadSfxPath(db, parsedAlias, guildDirPath);

    if (!sfxPath) {
        log.info(`Unknown sfx ${parsedAlias}`);
        await replyMaybeEphemeral(interaction, `\`${parsedAlias}\` does not exist!`, true);
        return;
    }

    await replyMaybeEphemeral(
        interaction,
        `Playing \`${sfxAliasToString(parsedAlias, modifiers)}\``,
    );

    await audio.enqueue({
        interaction,
        track: handleModifiers(sfxPath, parsedAlias, modifiers, guildDirPath),
    });
}
