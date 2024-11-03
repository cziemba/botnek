import { ChatInputCommandInteraction, Message } from 'discord.js';
import { BotShim } from '../../types/command';

export default async function sfxHelp(
    client: BotShim,
    interaction: ChatInputCommandInteraction<'cached'> | Message<true>,
) {
    const aliasHelp = {
        name: 'Aliases',
        value: 'Existing sfxs can be found using the `sfx list` command.',
    };
    const modifierHelp = {
        name: 'SFX Modifiers',
        value: [
            'Modify any sfx using available modifiers. Apply up to two per sound effect.',
            'Available Modifiers:',
            '- TURBO: 33% faster (ex: `sfx yay#turbo`)',
            '- TURBO2: 100% faster (ex: `sfx yay#turbo2`)',
            '- SLOW: 33% slower (ex: `sfx yay#slow`)',
            '- SLOW2: 100% slower (ex: `sfx yay#slow2`)',
        ].join('\n'),
    };
    const generalCommands = {
        name: 'SFX Subcommands',
        value: [
            'Play a sound effect: `sfx <alias>`',
            'Play a sound effect: `sfx play <alias>`',
            'Chain sound effects: `sfx chain <alias1>, <alias2>, etc...`',
            'List available sounds: `sfx list`',
            'Add a sound effect: `sfx add <alias> <youtube-url>`',
            'Remove a sound effect: `sfx del <alias>`',
        ].join('\n'),
    };
    await interaction.reply({
        embeds: [
            {
                color: 0x0f0f0f,
                title: '`SFX` Commands Overview',
                timestamp: new Date().toISOString(),
                fields: [generalCommands, aliasHelp, modifierHelp],
            },
        ],
    });
}
