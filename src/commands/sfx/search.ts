import { ChatInputCommandInteraction, Message } from 'discord.js';
import { LowWithLodash } from '../../data/db';
import { GuildData } from '../../data/types';
import { BotShim } from '../../types/command';
import { replyMaybeEphemeral } from '../queueControl';

export interface SfxSearchParams {
    term?: string;
}

const MAX_RESULTS = 10;

export interface SearchMatch {
    alias: string;
    score: number;
}

/**
 * Substring match on alias keys, with a small bias toward earlier-position
 * matches so prefix hits float above mid-string hits. Returns the top
 * `limit` hits sorted best-first.
 */
export function matchSfxAliases(
    aliases: string[],
    term: string,
    limit: number = MAX_RESULTS,
): SearchMatch[] {
    const needle = term.toLowerCase().trim();
    if (!needle) return [];
    const matches: SearchMatch[] = [];
    for (const alias of aliases) {
        const idx = alias.indexOf(needle);
        if (idx < 0) continue;
        // because exact > prefix > infix; shorter aliases tie-break ahead
        const score = (idx === 0 ? 0 : idx) + alias.length / 1000;
        matches.push({ alias, score });
    }
    matches.sort((a, b) => a.score - b.score || a.alias.localeCompare(b.alias));
    return matches.slice(0, limit);
}

function readAliases(db: LowWithLodash<GuildData>): string[] {
    return db.chain.get('sfx').get('sounds').keys().value() as string[];
}

export async function sfxSearch(
    client: BotShim,
    interaction: ChatInputCommandInteraction<'cached'> | Message<true>,
    params: SfxSearchParams,
): Promise<void> {
    const db = client.databases.get(interaction.guildId)?.db;
    const term = params.term?.trim();
    if (!term) {
        await replyMaybeEphemeral(interaction, 'Provide a search term.', true);
        return;
    }
    if (!db) {
        await replyMaybeEphemeral(interaction, 'Sfx database unavailable.', true);
        return;
    }
    const aliases = readAliases(db);
    const matches = matchSfxAliases(aliases, term);
    const content =
        matches.length === 0
            ? `No matches for \`${term}\`.`
            : `Top ${matches.length} match${matches.length === 1 ? '' : 'es'} for \`${term}\`:\n\`\`\`\n${matches.map((m) => m.alias).join('\n')}\n\`\`\``;
    await replyMaybeEphemeral(interaction, content, true);
}
