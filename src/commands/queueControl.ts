import { ChatInputCommandInteraction, CommandInteraction, Message, MessageFlags } from 'discord.js';

/**
 * Reply optionally ephemeral. Message-route replies silently drop the flag;
 * Discord doesn't support ephemeral on plain channel messages.
 */
export async function replyMaybeEphemeral(
    interaction: CommandInteraction<'cached'> | Message<true>,
    content: string,
    ephemeral: boolean = false,
): Promise<void> {
    if (interaction instanceof ChatInputCommandInteraction) {
        await interaction.reply(
            ephemeral ? { content, flags: MessageFlags.Ephemeral } : { content },
        );
        return;
    }
    await (interaction as Message<true>).reply({ content });
}
