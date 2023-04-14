import { CommandInteraction, Message } from 'discord.js';
import { BotShim } from '../../types/command.ts';

export default async function sfxList(client: BotShim, interaction: CommandInteraction<'cached'> | Message<true>) {
    const db = client.databases.get(interaction.guildId)?.db!;

    const soundsDb = db.chain.get('sfx').get('sounds');
    const aliases: string[] = soundsDb.keys().value();

    await interaction.reply({
        content: `${aliases.sort().map((s) => `\`${s}\``).join(', ')}`,
        ephemeral: true,
    });
}
