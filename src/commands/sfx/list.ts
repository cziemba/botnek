import { CommandInteraction, Message } from 'discord.js';
import { BotShim } from '../../types/command';

export default async function sfxList(
    client: BotShim,
    interaction: CommandInteraction<'cached'> | Message<true>,
) {
    const db = client.databases.get(interaction.guildId)?.db!;

    const sounds = db.chain
        .get('sfx')
        .get('sounds')
        .entries()
        .value()
        .sort((s1, s2) => s1[0].localeCompare(s2[0]));

    const aliases = sounds.map(([alias, _path]) => {
        const formattedAlias = `${alias}`;
        // const formattedDuration = `${ffmpegDurationSeconds(path)}s`;
        return `${formattedAlias}`;
    });

    const listChunkSize = 10;
    const aliasChunked: string[][] = [];
    for (let i = 0; i < aliases.length; i += listChunkSize) {
        aliasChunked.push(aliases.slice(i, i + listChunkSize));
    }

    await interaction.reply({
        content: `\`\`\`\n${aliasChunked.map((a) => a.join(' | ')).join('\n')}\n\`\`\``,
        ephemeral: true,
    });
}
