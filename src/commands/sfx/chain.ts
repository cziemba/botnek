// `/sfx chain a,b,c` — enqueue multiple sfx back-to-back as separate AudioRequests.
// Each link goes on the queue independently, so /skip advances one link at a time and
// /stop kills the whole chain. Modifiers per link are supported (`a#TURBO,b#BASS`).

import { CommandInteraction, Message } from 'discord.js';
import { guildDir } from '../../data/sfxPaths';
import { SfxAlias, SfxModifier } from '../../data/types.js';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { replyMaybeEphemeral } from '../queueControl';
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
        await replyMaybeEphemeral(interaction, 'No sfx chain provided.', true);
        return;
    }

    const guildDirPath = guildDir(client.config.dataRoot, interaction.guildId);
    const processedSfx = params.chain
        .split(/[ ,]+/)
        .map((s) => parseSfxAlias(db, s))
        .map(
            (sfx) =>
                ({
                    ...sfx,
                    path: loadSfxPath(db, sfx.parsedAlias, guildDirPath),
                }) as ProcessedSfx,
        );

    // Chain length cap. Five is small but each link is a separate enqueue + potential
    // ffmpeg shell-out for modifiers; 5 is the sweet spot between "useful for jokes"
    // and "don't let users wedge the queue with a 50-link mega-chain".
    if (processedSfx.length > 5) {
        await replyMaybeEphemeral(
            interaction,
            'Can only chain up to 5 sound effects, you psychopath.',
            true,
        );
        return;
    }

    if (processedSfx.length === 0) {
        await replyMaybeEphemeral(interaction, 'Must chain at least one sfx', true);
        return;
    }

    // Reject the entire chain if any link is unknown — partial chains are confusing
    // (user typed 5, hears 3) and we already paid the parse cost so error reporting
    // is cheap. `!sfx.path` (not `!!sfx.path`) is the correct polarity here.
    const badSfxs = processedSfx.filter((sfx) => !sfx.path).map((sfx) => sfx.parsedAlias);
    if (badSfxs.length > 0) {
        log.warn(`Attempted to chain non-sfx [${badSfxs.join(',')}]`);
        await replyMaybeEphemeral(
            interaction,
            `The following sfx don't exist: \`[${badSfxs.join(', ')}]\``,
            true,
        );
        return;
    }

    const enqueuePromises: Promise<void>[] = [];
    processedSfx.forEach((sfx) => {
        const alias = sfx.parsedAlias;
        const mods = sfx.modifiers;
        const sfxPath = sfx.path!;
        enqueuePromises.push(
            audio.enqueue({
                interaction,
                track: handleModifiers(sfxPath, alias, mods, guildDirPath),
            }),
        );
    });
    await Promise.all(enqueuePromises);
    await replyMaybeEphemeral(
        interaction,
        `Queued chain of ${processedSfx.map((s) => sfxAliasToString(s.parsedAlias, s.modifiers)).join(' -> ')}`,
    );
}
