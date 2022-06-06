import path from 'path';
import { CommandInteraction, Message } from 'discord.js';
import { BotShim } from '../../types/command.js';
import log from '../../logging/logging.js';
import {
    handleModifiers, parseSfxAlias, sfxAliasToString, sfxExists,
} from './common.js';

export interface SfxChainParams {
    chain?: string
}

export async function sfxChain(client: BotShim, interaction: CommandInteraction<'cached'> | Message<true>, params: SfxChainParams) {
    const audio = client.audioHandlers.get(interaction.guildId)!;
    const db = client.databases.get(interaction.guildId)?.db!;

    if (!params.chain) {
        await interaction.reply({
            content: 'No sfx chain provided.',
            ephemeral: true,
        });
        return;
    }

    const sfxs = params.chain.split(/[ ,]+/).map((s) => parseSfxAlias(s));

    if (sfxs.length > 5) {
        await interaction.reply({
            content: 'Can only chain up to 5 sound effects, you psychopath.',
            ephemeral: true,
        });
        return;
    } if (sfxs.length === 0) {
        await interaction.reply({
            content: 'Must chain at least one sfx',
            ephemeral: true,
        });
        return;
    }

    const badSfxs = sfxs.map((x) => x.parsedAlias).filter((x) => !sfxExists(db, x));
    if (badSfxs.length !== 0) {
        log.warn(`Attempted to chain non-sfx [${badSfxs.join(',')}]`);
        await interaction.reply({
            content: `The following sfx don't exist: \`[${badSfxs.join(', ')}]\``,
            ephemeral: true,
        });
        return;
    }

    const guildDir = path.resolve(path.join(client.config.dataRoot, interaction.guildId));
    const soundsDb = db.chain.get('sfx').get('sounds');
    const enqueuePromises: Promise<void>[] = [];
    for (let i = 0; i < sfxs.length; i += 1) {
        const alias = sfxs[i].parsedAlias;
        const mods = sfxs[i].modifiers;
        const sfxPath = soundsDb.get(alias).value();
        enqueuePromises.push(audio.enqueue({ interaction, track: handleModifiers(sfxPath, alias, mods, guildDir) }));
    }
    await Promise.all(enqueuePromises);
    interaction.reply({
        content: `Queued chain of ${sfxs.map((s) => sfxAliasToString(s.parsedAlias, s.modifiers)).join(' -> ')}`,
    });
}
