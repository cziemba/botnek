import * as fs from 'fs';
import lodash from 'lodash';
import {
    JSONFileSync, LowSync,
} from 'lowdb';
import log from '../logging/logging.js';
import { DEFAULT_GUILD_DATA, GuildData } from './types.js';

export class LowWithLodash<T> extends LowSync<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data');
}

export default class GuildDatabase {
    public db: LowWithLodash<GuildData>;

    constructor(filePath: string) {
        const adapter = new JSONFileSync<GuildData>(filePath);
        this.db = new LowWithLodash(adapter);

        if (!fs.existsSync(filePath)) {
            log.info(`Database ${filePath} does not exist. Writing it.`);
        }

        this.db.read();
        this.db.data = this.db.data || DEFAULT_GUILD_DATA;
        this.db.write();

        if (!fs.existsSync(filePath)) {
            throw new Error(`Something went wrong when writing ${filePath}`);
        }
    }
}
