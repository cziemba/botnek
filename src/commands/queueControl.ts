// Shared reply helper for the audio command family. Every command in this directory
// can be invoked via slash command OR `!`-prefix message; this collapses the two
// reply shapes into one call so handlers don't have to branch on interaction type.

import { ChatInputCommandInteraction, CommandInteraction, Message, MessageFlags } from 'discord.js';

/**
 * Reply optionally ephemeral. Message-route replies silently drop the flag because
 * Discord's API doesn't support ephemeral on plain channel messages — only on
 * interaction responses. Callers can still pass `ephemeral: true` unconditionally;
 * it's just a no-op on the message path.
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
