// Per-guild keyed map. Looks like a thin Map<Snowflake, T> wrapper, but the throw-on-miss
// `get()` is the load-bearing piece: callers can rely on a value being present without
// nullable-check noise, because `Botnek.initGuildResources` is invoked for every guild on
// `clientReady` before any handler runs. Anything that needs per-guild isolation
// (AudioHandler, GuildDatabase, ClaudeConversation) lives in one of these.

import { Snowflake } from 'discord-api-types/globals';

export default class GuildResource<T> {
    private map: Map<Snowflake, T>;

    constructor() {
        this.map = new Map<Snowflake, T>();
    }

    // Throws on miss rather than returning undefined: a missed lookup means
    // initGuildResources never ran for this guild, which is a setup bug worth crashing on
    // rather than papering over with `?.`.
    public get(guildId: Snowflake): T {
        if (!this.map.has(guildId)) throw new Error(`No database for guild ${guildId}`);
        return this.map.get(guildId)!;
    }

    public put(guildId: Snowflake, resource: T): void {
        this.map.set(guildId, resource);
    }

    public has(guildId: Snowflake): boolean {
        return this.map.has(guildId);
    }

    public values(): IterableIterator<T> {
        return this.map.values();
    }
}
