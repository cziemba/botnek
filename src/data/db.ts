// Per-guild lowdb wrapper. One file (`${dataRoot}/${guildId}/db.json`) per guild, one
// `GuildDatabase` instance per file, one instance held in `Botnek.databases`. Single-process
// only — there is no multi-writer story; if the bot is ever scaled past one process, this file
// is the bottleneck.
//
// `GuildData` is the source of truth for each guild — back it up. The peer caches under
// `${guildId}/sounds/` and `${guildId}/ffmpeg/` reference paths from this file, so deleting db
// entries without also cleaning the on-disk audio (and vice versa) leaves dangling pointers.

import * as fs from 'fs';
import lodash from 'lodash';
import { LowSync } from 'lowdb';
import { JSONFileSync } from 'lowdb/node';
import log from '../logging/logging';
import { DEFAULT_GUILD_DATA, GuildData } from './types';

/**
 * Mixes a lodash `chain` accessor onto LowSync so callers get a fluent API over `db.data`:
 *   db.chain.get('sfx').get('sounds').set(alias, path).commit()
 *   db.write()
 * `commit()` is required to materialize a chain that mutates; pure read chains end with
 * `.value()` and need no commit.
 */
export class LowWithLodash<T> extends LowSync<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data');
}

export default class GuildDatabase {
    public db: LowWithLodash<GuildData>;

    constructor(filePath: string) {
        const adapter = new JSONFileSync<GuildData>(filePath);
        // Constructor seed only takes effect if the read below returns null (file missing or
        // empty); existing files are left untouched.
        this.db = new LowWithLodash(adapter, DEFAULT_GUILD_DATA);

        if (!fs.existsSync(filePath)) {
            log.info(`Database ${filePath} does not exist. Writing it.`);
        }

        // Read-or-create dance: if the file is missing, `read()` leaves data null and the
        // fallback assignment pulls in DEFAULT_GUILD_DATA. The immediate write() materializes
        // the file so subsequent reads have a real source of truth (and so the post-condition
        // existsSync check is meaningful).
        this.db.read();
        this.db.data = this.db.data || DEFAULT_GUILD_DATA;
        this.db.write();

        // Hard-fail if write didn't actually produce a file. This catches permission issues
        // on the dataRoot path early at boot rather than letting subsequent commands fail
        // confusingly mid-request.
        if (!fs.existsSync(filePath)) {
            throw new Error(`Something went wrong when writing ${filePath}`);
        }
    }
}
