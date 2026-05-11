// The "inline emote replacement" path: when a user's plain message contains tokens that match
// stored emote aliases, we delete their original message and re-post via a per-channel webhook
// impersonating them. The webhook route exists because Discord doesn't allow bots to truly send
// "as" another user, and webhooks are the only API surface that accepts arbitrary `username` and
// `avatarURL` overrides per-message. The cost: webhook messages can't be edited by the original
// author and don't appear in their message history search — accepted tradeoff for unbounded-size
// "emotes" that aren't subject to Discord's 256KiB server-emoji cap.
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
    // Skip webhook-authored messages explicitly: the webhook re-post below would otherwise
    // re-trigger the alias detector on our own send and produce an infinite emote loop.
    if (!message.inGuild() || !!message.webhookId || resolved.length === 0) return;
    const db = client.databases.get(message.guildId)?.db!;
    const { channelId } = message;

    const webhookConfig = db.chain
        .get('webhooks')
        .get(channelId)
        .find((w) => w.hookName === EMOTE_HOOK_NAME)
        .value();

    if (!webhookConfig) {
        // Emote fired but `/emote enable` was never run in this channel. Silently no-op (don't
        // delete the message, don't reply) — the user typed plain text that happened to match an
        // alias, and yelling at them about a config gap they didn't create is worse UX than
        // letting their message stand.
        log.warn('emote found but no hook registered');
        return;
    }

    // We rebuild the WebhookClient from {id, token} on every send rather than caching the client.
    // Discord's WebhookClient is just a thin wrapper around the REST endpoint; there's no
    // connection pooling to preserve, and caching would mean tracking webhook deletions (admins
    // delete bot webhooks all the time) which isn't worth the complexity.
    const webhookClient = new WebhookClient({
        id: webhookConfig.id,
        token: webhookConfig.token,
    });

    // Fall back to Discord's default avatar URL if the user has none set; webhooks reject empty
    // string `avatarURL` with a 400.
    const avatar = message.author.avatarURL() || message.author.defaultAvatarURL;
    // Prefer guild displayName (server-specific nickname) over global username so the impersonation
    // matches what other members see in the member list.
    const name = message.member?.displayName ?? message.author.username;

    // One webhook send per emote (rather than batching all attachments into one message): this
    // preserves each emote at its native resolution. Stitching via ImageMagick would force a
    // shared bounding box and the smaller emotes would balloon to match the largest. The N sends
    // run in parallel so latency is bounded by the slowest one, not their sum. Discord renders
    // them in send order, which Promise.all does NOT guarantee — in practice the ordering noise
    // is invisible for ≤3 emotes; if that ever bites, switch to sequential awaits.
    // The `name: <alias>.gif` filename matters: Discord's inline-render heuristic only kicks in
    // for image attachments whose filename has an image extension.
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

    // Delete original + send replacements concurrently. If the delete fails (e.g. the user already
    // deleted it, or the bot lacks Manage Messages) Promise.all rejects but the webhook sends
    // still go through — that's a slightly weird state (original + emotes both visible) but
    // strictly better than swallowing the error and losing the emote rendering.
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

// Whitespace-tokenize and keep tokens that BOTH satisfy the alias charset
// (`/^[_\-a-zA-Z0-9]{1,20}$/`) AND exist in the guild's emote config. Order is preserved so the
// re-posted webhook messages appear in the same order the user typed them. Non-matching tokens
// (regular words) are dropped silently — there is no "partial replacement" mode that re-posts the
// surrounding text; users either type only emotes (gets the impersonation treatment) or normal
// text (untouched).
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
