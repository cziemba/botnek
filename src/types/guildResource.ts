import { Snowflake } from 'discord-api-types/globals';

export default class GuildResource<T> {
    private map: Map<Snowflake, T>;

    constructor() {
        this.map = new Map<Snowflake, T>();
    }

    public get(guildId: Snowflake): T {
        if (!this.map.has(guildId)) throw new Error(`No database for guild ${guildId}`);
        return this.map.get(guildId)!;
    }

    public put(guildId: Snowflake, resource: T): void {
        this.map.set(guildId, resource);
    }
}
