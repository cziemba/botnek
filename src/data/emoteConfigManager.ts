import { LowWithLodash } from './db';
import { GuildData } from './types';
import { Emote, EmoteAlias } from './types/emote';

const EMOTE_CONFIG = 'emoteConfig';
const EMOTES = 'emotes';

/**
 * Manages the EmoteConfig object and abstracts away interactions with the database layer
 */
export default class EmoteConfigManager {
    public db: LowWithLodash<GuildData>;

    public constructor(db: LowWithLodash<GuildData>) {
        this.db = db;
        if (!this.db.chain.get(EMOTE_CONFIG).value()) {
            this.db.chain.set(EMOTE_CONFIG, {}).commit();
            this.db.write();
        }

        if (!this.db.chain.get(EMOTE_CONFIG).get(EMOTES).value()) {
            this.db.chain.get(EMOTE_CONFIG).set(EMOTES, {}).commit();
            this.db.write();
        }
    }

    public put(alias: EmoteAlias, emote: Emote): void {
        if (this.aliasExists(alias)) throw new Error(`Emote ${alias} already exists!`);
        this.emoteConfigDb().get(EMOTES).set(alias, emote).commit();
        this.db.write();
    }

    public remove(alias: EmoteAlias): Emote {
        if (!this.aliasExists(alias)) throw new Error(`Emote ${alias} doesn't exist!`);
        const emoteRemoved = this.emoteConfigDb().get(EMOTES).get(alias).value();
        this.emoteConfigDb().get(EMOTES).omit([alias]).commit();
        this.db.write();
        return emoteRemoved;
    }

    public get(alias: EmoteAlias): Emote {
        return this.emoteConfigDb().get(EMOTES).get(alias).value();
    }

    public aliasExists(alias: EmoteAlias): boolean {
        return this.emoteConfigDb().get(EMOTES).has(alias).value();
    }

    public listEmotes(): [string, Emote][] {
        return this.emoteConfigDb().get(EMOTES).entries().value();
    }

    private emoteConfigDb() {
        return this.db.chain.get(EMOTE_CONFIG);
    }
}
