import { Message, WebhookClient } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { Emote } from '../../data/types/emote';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { EMOTE_HOOK_NAME } from '../emote';
import EmoteGateway from './emoteGateway';

/**
 * 1. Interpret the message content as an emote (passed filter already)
 * 2. Fetch webhook from db (or reply w/ how-to)
 * 3. Fetch emote obj from db
 * 4. Delete user message
 * 5. Post to webhook emoji gif/jpeg (as original user?)
 */
export default async function handleSingleEmote(
    client: BotShim,
    message: Message<true>,
    emote: Emote,
): Promise<void> {
    if (!message.inGuild() || !!message.webhookId) return;
    const db = client.databases.get(message.guildId)?.db!;
    const { channelId } = message;

    const webhookConfig = db.chain
        .get('webhooks')
        .get(channelId)
        .find((w) => w.hookName === EMOTE_HOOK_NAME)
        .value();

    if (!webhookConfig) {
        log.warn('emote found but no hook registered');
        return;
    }

    const webhookClient = new WebhookClient({
        id: webhookConfig.id,
        token: webhookConfig.token,
    });

    const avatar = message.author.avatarURL() || message.author.defaultAvatarURL;
    const name = message.member?.displayName;
    const parsed = message.content.trim();
    const emoteFile = path.resolve(
        path.join(client.config.dataRoot, EmoteGateway.EMOTE_DIR, `${emote.id}.gif`),
    );

    await Promise.all([
        message.delete(),
        webhookClient.send({
            avatarURL: avatar,
            username: `${name}`,
            files: [
                {
                    name: `${parsed}.gif`,
                    attachment: fs.createReadStream(emoteFile),
                    description: parsed,
                },
            ],
        }),
    ]);
}
