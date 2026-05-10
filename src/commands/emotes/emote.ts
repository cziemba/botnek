import { Message, WebhookClient } from 'discord.js';
import fs from 'fs';
import path from 'path';
import EmoteConfigManager from '../../data/emoteConfigManager';
import { Emote, EmoteAlias, isEmoteAlias } from '../../data/types/emote';
import log from '../../logging/logging';
import { BotShim } from '../../types/command';
import { EMOTE_HOOK_NAME } from '../emote';
import EmoteGateway from './emoteGateway';

export interface ResolvedEmote {
    alias: EmoteAlias;
    emote: Emote;
}

function emoteFilePath(client: BotShim, emote: Emote): string {
    return path.resolve(
        path.join(client.config.dataRoot, EmoteGateway.EMOTE_DIR, `${emote.id}.gif`),
    );
}

export async function handleEmotes(
    client: BotShim,
    message: Message<true>,
    resolved: ResolvedEmote[],
): Promise<void> {
    if (!message.inGuild() || !!message.webhookId || resolved.length === 0) return;
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
    const name = message.member?.displayName ?? message.author.username;

    // Multiple webhook sends preserve per-emote sizing; ImageMagick stitching would force a single
    // bounding box and lose the "each emote at full resolution" property users expect.
    const sends = resolved.map(({ alias, emote }) =>
        webhookClient.send({
            avatarURL: avatar,
            username: name,
            files: [
                {
                    name: `${alias}.gif`,
                    attachment: fs.createReadStream(emoteFilePath(client, emote)),
                    description: alias,
                },
            ],
        }),
    );

    await Promise.all([message.delete(), ...sends]);
}

export default async function handleSingleEmote(
    client: BotShim,
    message: Message<true>,
    emote: Emote,
): Promise<void> {
    const alias = message.content.trim();
    if (!isEmoteAlias(alias)) return;
    await handleEmotes(client, message, [{ alias, emote }]);
}

export function findEmoteAliases(content: string, manager: EmoteConfigManager): EmoteAlias[] {
    const tokens = content.split(/\s+/).filter(Boolean);
    const aliases: EmoteAlias[] = [];
    for (const tok of tokens) {
        if (!isEmoteAlias(tok)) continue;
        if (!manager.aliasExists(tok)) continue;
        aliases.push(tok);
    }
    return aliases;
}

export function resolveEmoteAliases(
    aliases: EmoteAlias[],
    manager: EmoteConfigManager,
): ResolvedEmote[] {
    return aliases.map((alias) => ({ alias, emote: manager.get(alias) }));
}
