import { CommandInteraction, Message } from 'discord.js';
import path from 'path';
import { SfxAlias, SfxModifier } from '../../data/types.js';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { handleModifiers, loadSfxPath, parseSfxAlias, sfxAliasToString } from './common';

export interface SfxChainParams {
    chain?: string;
}

interface ProcessedSfx {
    parsedAlias: SfxAlias;
    modifiers: SfxModifier[];
    path?: string;
}

export async function sfxChain(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
    params: SfxChainParams,
) {
    const audio = client.audioHandlers.get(interaction.guildId)!;
    const db = client.databases.get(interaction.guildId)?.db!;

    if (!params.chain) {
        await interaction.reply({
            content: 'No sfx chain provided.',
            ephemeral: true,
        });
        return;
    }

    const processedSfx = params.chain
        .split(/[ ,]+/)
        .map((s) => parseSfxAlias(db, s))
        .map(
            (sfx) =>
                ({
                    ...sfx,
                    path: loadSfxPath(db, sfx.parsedAlias),
                }) as ProcessedSfx,
        );

    if (processedSfx.length > 5) {
        await interaction.reply({
            content: 'Can only chain up to 5 sound effects, you psychopath.',
            ephemeral: true,
        });
        return;
    }

    if (processedSfx.length === 0) {
        await interaction.reply({
            content: 'Must chain at least one sfx',
            ephemeral: true,
        });
        return;
    }

    const badSfxs = processedSfx.filter((sfx) => !!sfx.path).map((sfx) => sfx.parsedAlias);
    if (badSfxs.length > 0) {
        log.warn(`Attempted to chain non-sfx [${badSfxs.join(',')}]`);
        await interaction.reply({
            content: `The following sfx don't exist: \`[${badSfxs.join(', ')}]\``,
            ephemeral: true,
        });
        return;
    }

    const guildDir = path.resolve(path.join(client.config.dataRoot, interaction.guildId));
    const enqueuePromises: Promise<void>[] = [];
    processedSfx.forEach((sfx) => {
        const alias = sfx.parsedAlias;
        const mods = sfx.modifiers;
        const sfxPath = sfx.path!;
        enqueuePromises.push(
            audio.enqueue({ interaction, track: handleModifiers(sfxPath, alias, mods, guildDir) }),
        );
    });
    await Promise.all(enqueuePromises);
    await interaction.reply({
        content: `Queued chain of ${processedSfx.map((s) => sfxAliasToString(s.parsedAlias, s.modifiers)).join(' -> ')}`,
    });
}
