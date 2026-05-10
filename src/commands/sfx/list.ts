import { CommandInteraction, Message } from 'discord.js';
import { BotShim } from '../../types/command';
import { replyMaybeEphemeral } from '../queueControl';

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

    const aliases = sounds.map(([alias, _path]) => `${alias}`);

    const listChunkSize = 10;
    const aliasChunked: string[][] = [];
    for (let i = 0; i < aliases.length; i += listChunkSize) {
        aliasChunked.push(aliases.slice(i, i + listChunkSize));
    }

    await replyMaybeEphemeral(
        interaction,
        `\`\`\`\n${aliasChunked.map((a) => a.join(' | ')).join('\n')}\n\`\`\``,
        true,
    );
}
