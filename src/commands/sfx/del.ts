// `/sfx del <alias>` — remove an alias from the guild's sfx db AND delete the
// underlying file. Per-guild only — the same source file can be referenced from
// other guilds and deleting it here would break those.
//
// FOOTGUN: there's no shared-refcount on sfx files. Two guilds adding the same
// YouTube URL produce identical sluggified filenames in their respective guild
// directories (good — isolation), but if anything ever changes saveAudio to share
// downloads across guilds, this delete becomes unsafe.
//
// FOOTGUN: not currently role-gated. Any guild member can /sfx del any alias —
// see roadmap "role-gate destructive commands".

import { CommandInteraction, Message } from 'discord.js';
import fs from 'fs';
import { guildDir, resolveSfxPath } from '../../data/sfxPaths';
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

    const guildDirPath = guildDir(client.config.dataRoot, interaction.guildId);
    const sfxPath = resolveSfxPath(guildDirPath, soundsDb.get(alias).value());

    // Remove the db entry first, file second. If the rmSync below fails (permissions,
    // file already gone) the alias is still gone from the user's perspective — no
    // dangling "sfx with no playable file" entry. The other order would leave an
    // orphaned db entry pointing at a deleted file.
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
