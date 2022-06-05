import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { BotShim, Command } from '../types/command.js';
import log from '../logging/logging.js';
import LocalTrack from '../audio/tracks/localTrack.js';
import { LowWithLodash } from '../data/db.js';
import {
    GuildData, SfxModifier, isSfxModifier, isValidSfxAlias,
} from '../data/types.js';
import YoutubeTrack from '../audio/tracks/youtubeTrack.js';
import ffmpegAdjustRate from '../utils/ffmpeg.js';

const sfxAliasToString = (sfxAlias: string, sfxModifiers: SfxModifier[]) => {
    const modifiersString = sfxModifiers.length === 0 ? ''
        : `[${sfxModifiers.join(',')}]`;
    return `\`${sfxAlias}${modifiersString}\``;
};

const sfxExists = (db: LowWithLodash<GuildData>, alias: string): boolean => {
    const soundsDb = db.chain.get('sfx').get('sounds');
    return soundsDb.has(alias).value();
};

const parseSfxAlias = (alias: string): { parsedAlias: string, modifiers: SfxModifier[] } => {
    const aliasParts = alias.split('#');
    log.debug(`Recieved aliasParts=[${aliasParts.join(',')}]`);
    if (aliasParts.length < 1) {
        throw new Error(`Could not parse sfx alias: ${alias}!`);
    }

    if (aliasParts.length === 1) {
        return { parsedAlias: aliasParts[0], modifiers: [] };
    }

    const mods = aliasParts.slice(1)
        .map((m) => isSfxModifier(m))
        .filter((m) => m !== SfxModifier.UNKNOWN)
        .slice(0, 2);
    return { parsedAlias: aliasParts[0], modifiers: mods };
};

const handleModifiers = (sfxFile: string, sfxAlias: string, modifiers: SfxModifier[], guildDir: string): LocalTrack => {
    if (modifiers.length === 0) {
        return new LocalTrack(sfxFile, sfxAlias);
    }
    let finalPath = sfxFile;
    for (let i = 0; i < modifiers.length; i += 1) {
        switch (String(modifiers[i])) {
            case SfxModifier.TURBO: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 4 / 3);
                break;
            }
            case SfxModifier.TURBO2: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 2);
                break;
            }
            case SfxModifier.SLOW: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 3 / 4);
                break;
            }
            case SfxModifier.SLOW2: {
                finalPath = ffmpegAdjustRate(finalPath, guildDir, 1 / 2);
                break;
            }
            default: {
                break;
            }
        }
    }
    return new LocalTrack(finalPath, `${sfxAlias} [${modifiers.join(',')}]`);
};

const sfxPlay = async (client: BotShim, interaction: CommandInteraction<'cached'>): Promise<void> => {
    const audio = client.audioHandlers.get(interaction.guildId)!;
    const db = client.databases.get(interaction.guildId)?.db!;
    const alias = interaction.options.getString('alias')!;

    const { parsedAlias, modifiers } = parseSfxAlias(alias);

    log.debug(`Parsed sfx play: ${parsedAlias} modifiers=[${modifiers.join(', ')}]`);

    if (!sfxExists(db, parsedAlias)) {
        log.info(`Unknown sfx ${parsedAlias}`);
        await interaction.reply({
            content: `\`${parsedAlias}\` does not exist!`,
            ephemeral: true,
        });
        return;
    }

    const sfxPath = db.chain.get('sfx').get('sounds').get(parsedAlias).value();
    const guildDir = path.resolve(path.join(client.config.dataRoot, interaction.guildId));

    await interaction.reply({
        content: `Playing \`${sfxAliasToString(parsedAlias, modifiers)}\``,
    });

    await audio.enqueue({ interaction, track: handleModifiers(sfxPath, parsedAlias, modifiers, guildDir) });
};

const sfxList = async (client: BotShim, interaction: CommandInteraction<'cached'>) => {
    const db = client.databases.get(interaction.guildId)?.db!;

    const soundsDb = db.chain.get('sfx').get('sounds');
    const aliases: string[] = soundsDb.keys().value();

    await interaction.reply({
        content: `${aliases.sort().map((s) => `\`${s}\``).join(', ')}`,
        ephemeral: true,
    });
};

const sfxChain = async (client: BotShim, interaction: CommandInteraction<'cached'>) => {
    const audio = client.audioHandlers.get(interaction.guildId)!;
    const db = client.databases.get(interaction.guildId)?.db!;
    const sfxs = interaction.options.getString('sfxs')!.split(/[ ,]+/).map((s) => parseSfxAlias(s));

    if (sfxs.length > 5) {
        await interaction.reply({
            content: 'Can only chain up to 5 sound effects, you psychopath.',
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
        content: `Queued chain of \`${sfxs.map((s) => `${sfxAliasToString(s.parsedAlias, s.modifiers)}`).join('->')}\``,
    });
};

const sfxDel = async (client: BotShim, interaction: CommandInteraction<'cached'>) => {
    const db = client.databases.get(interaction.guildId)?.db!;
    const alias = interaction.options.getString('alias')!;

    if (!isValidSfxAlias(alias)) {
        log.warn(`Invalid alias provided ${alias}`);
    }

    const soundsDb = db.chain.get('sfx').get('sounds');

    if (!sfxExists(db, alias)) {
        log.warn(`Sfx does not exist: ${alias}`);
        await interaction.reply(
            {
                content: `Sfx \`${alias}\` does not exist!`,
                ephemeral: true,
            },
        );
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
};

const sfxAdd = async (client: BotShim, interaction: CommandInteraction<'cached'>) => {
    const db = client.databases.get(interaction.guildId)?.db!;
    const alias = interaction.options.getString('alias')!;
    const url = interaction.options.getString('url')!;

    if (!isValidSfxAlias(alias)) {
        log.warn(`Invalid alias provided ${alias}`);
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
};

const sfxHelp = async (client: BotShim, interaction: CommandInteraction<'cached'>) => {
    const aliasHelp = {
        name: 'Aliases',
        value: 'Existing sfxs can be found using the `/sfx list` command.',
    };
    const modifierHelp = {
        name: 'SFX Modifiers',
        value: [
            'Modify any sfx using available modifiers. Apply up to two per sound effect.',
            'Available Modifiers:',
            '- TURBO: speed it up (ex: `/sfx play yay#turbo`)',
            '- TURBO2: speed it up more (ex: `/sfx play yay#turbo2`)',
            '- SLOW: slow it down (ex: `/sfx play yay#slow`)',
            '- SLOW2: slow it down more (ex: `/sfx play yay#slow2`)',
        ].join('\n'),
    };
    const generalCommands = {
        name: 'SFX Subcommands',
        value: [
            'Play a sound effect: `/sfx play <alias>`',
            'Chain sound effects: `/sfx chain <alias1>, <alias2>, etc...`',
            'List available sounds: `/sfx list`',
            'Add a sound effect: `/sfx add <alias> <youtube-url>`',
        ].join('\n'),
    };
    await interaction.reply({
        embeds: [{
            color: '#0F0F0F',
            title: '`/SFX` Commands Overview',
            timestamp: Date.now(),
            fields: [generalCommands, aliasHelp, modifierHelp],
        }],
    });
};

const Sfx: Command = {
    data: new SlashCommandBuilder()
        .setName('sfx')
        .setDescription('Interact with sound effects.')
        .addSubcommand((subCommand) => subCommand.setName('list')
            .setDescription('List all existing sfxs.'))
        .addSubcommand((add) => add.setName('add')
            .setDescription('Add a sound effect.')
            .addStringOption((name) => name.setName('alias')
                .setDescription('The name for the sound effect.')
                .setRequired(true))
            .addStringOption((url) => url.setName('url')
                .setDescription('A url to the sound effect (youtube only for now).')
                .setRequired(true)))
        .addSubcommand((del) => del.setName('del')
            .setDescription('Remove a sound effect.')
            .addStringOption((alias) => alias.setName('alias')
                .setDescription('The alias of the sound effect to delete.')
                .setRequired(true)))
        .addSubcommand((subCommand) => subCommand.setName('play')
            .setDescription('Play a sound effect in your current channel.')
            .addStringOption((alias) => alias.setName('alias')
                .setDescription('The name for the sound effect.')
                .setRequired(true)))
        .addSubcommand((subCommand) => subCommand.setName('chain')
            .setDescription('Chain multiple sound effects together.')
            .addStringOption((sfxs) => sfxs.setName('sfxs')
                .setDescription('List of sound effects to play (space or comma separated). Example: `one,two` or `one two`')
                .setRequired(true)))
        .addSubcommand((help) => help.setName('help')
            .setDescription('Print help for the sfx commands.')),
    execute: async (client, interaction) => {
        if (!interaction.isCommand() || !interaction.inCachedGuild()) {
            return;
        }

        const subCommand = interaction.options.getSubcommand(true);
        if (subCommand === 'play') {
            await sfxPlay(client, interaction);
        } else if (subCommand === 'list') {
            await sfxList(client, interaction);
        } else if (subCommand === 'chain') {
            await sfxChain(client, interaction);
        } else if (subCommand === 'add') {
            await sfxAdd(client, interaction);
        } else if (subCommand === 'del') {
            await sfxDel(client, interaction);
        } else if (subCommand === 'help') {
            await sfxHelp(client, interaction);
        }
    },
};

export default Sfx;

export { parseSfxAlias };
