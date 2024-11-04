import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../types/command';
import { sfxAdd } from './sfx/add';
import { sfxChain } from './sfx/chain';
import { sfxDel } from './sfx/del';
import sfxHelp from './sfx/help';
import sfxList from './sfx/list';
import { sfxPlay } from './sfx/play';

const Sfx: Command = {
    data: new SlashCommandBuilder()
        .setName('sfx')
        .setDescription('Interact with sound effects.')
        .addSubcommand((subCommand) =>
            subCommand.setName('list').setDescription('List all existing sfxs.'),
        )
        .addSubcommand((add) =>
            add
                .setName('add')
                .setDescription('Add a sound effect.')
                .addStringOption((name) =>
                    name
                        .setName('alias')
                        .setDescription('The name for the sound effect.')
                        .setRequired(true),
                )
                .addStringOption((url) =>
                    url
                        .setName('url')
                        .setDescription('A url to the sound effect (youtube only for now).')
                        .setRequired(true),
                )
                .addStringOption((startTime) =>
                    startTime
                        .setName('start-time')
                        .setDescription(
                            'Time to start the clip from (e.g. for youtube urls) [XXmYYs format]',
                        )
                        .setRequired(false),
                )
                .addStringOption((endTime) =>
                    endTime
                        .setName('end-time')
                        .setDescription(
                            'Time to end the clip at (e.g. for youtube urls) [XXmYYs format]',
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommand((del) =>
            del
                .setName('del')
                .setDescription('Remove a sound effect.')
                .addStringOption((alias) =>
                    alias
                        .setName('alias')
                        .setDescription('The alias of the sound effect to delete.')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subCommand) =>
            subCommand
                .setName('play')
                .setDescription('Play a sound effect in your current channel.')
                .addStringOption((alias) =>
                    alias
                        .setName('alias')
                        .setDescription('The name for the sound effect.')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subCommand) =>
            subCommand
                .setName('chain')
                .setDescription('Chain multiple sound effects together.')
                .addStringOption((sfxs) =>
                    sfxs
                        .setName('sfxs')
                        .setDescription(
                            'List of sound effects to play (space or comma separated). Example: `one,two` or `one two`',
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((help) =>
            help.setName('help').setDescription('Print help for the sfx commands.'),
        ),
    helpText: 'Try `sfx help` for more info.',
    executeCommand: async (client, interaction) => {
        if (!interaction.isCommand() || !interaction.inCachedGuild()) {
            return;
        }

        const subCommand = interaction.options.getSubcommand(true);
        if (subCommand === 'play') {
            const alias = interaction.options.getString('alias', true);
            await sfxPlay(client, interaction, { alias });
        } else if (subCommand === 'list') {
            await sfxList(client, interaction);
        } else if (subCommand === 'chain') {
            const chain = interaction.options.getString('sfxs', true);
            await sfxChain(client, interaction, { chain });
        } else if (subCommand === 'add') {
            const url = interaction.options.getString('url', true);
            const alias = interaction.options.getString('alias', true);
            const startTime = interaction.options.getString('start-time', false) || undefined;
            const endTime = interaction.options.getString('end-time', false) || undefined;
            await sfxAdd(client, interaction, { alias, url, startTime, endTime });
        } else if (subCommand === 'del') {
            const alias = interaction.options.getString('alias', true);
            await sfxDel(client, interaction, { alias });
        } else if (subCommand === 'help') {
            await sfxHelp(client, interaction);
        }
    },
    executeMessage: async (client, message, args) => {
        switch (args[0]) {
            case 'list':
                await sfxList(client, message);
                return;
            case 'del':
                await sfxDel(client, message, { alias: args[1] });
                return;
            case 'add':
                await sfxAdd(client, message, {
                    alias: args[1],
                    url: args[2],
                    startTime: (args.length > 2 && args[3]) || undefined,
                    endTime: (args.length > 3 && args[4]) || undefined,
                });
                return;
            case 'chain':
                await sfxChain(client, message, { chain: args.slice(1).join(' ') });
                return;
            case 'play':
                await sfxPlay(client, message, { alias: args[1] });
                return;
            case 'help':
                await sfxHelp(client, message);
                return;
            default:
                // Assume its an alias
                await sfxPlay(client, message, { alias: args[0] });
        }
    },
};

export default Sfx;
