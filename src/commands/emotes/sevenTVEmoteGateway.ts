import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import mime from 'mime-types';
import { promisify } from 'util';
import { pipeline } from 'stream';
import EmoteGateway from './emoteGateway.js';
import { Emote, EmoteSource } from '../../data/types/emote.js';
import { BotnekConfig } from '../../types/config.js';
import log from '../../logging/logging.js';
import { convertToGif, extractFrameDelay } from '../../utils/imagemagick.js';

const API_BASE = 'https://api.7tv.app/v2';
const URL_ID_MATCHER = /http.*(7tv.app)\/emote(s)?\/(?<id>\w+).*$/;
const streamPipeline = promisify(pipeline);

// Response from /emotes/{id}
interface SevenTVEmoteData {
    id: string,
    name: string,
    mime: string,
    urls: Array<string[]>,
}

export default class SevenTVEmoteGateway extends EmoteGateway {
    public constructor(botnekConfig: BotnekConfig) {
        super(botnekConfig);
    }

    /**
     * Fetch emote and convert to a gif of the default size.
     * @param id
     */
    public async fetchEmote(id: string): Promise<Emote> {
        const gifPath = path.join(this.emoteRootPath, `${id}.gif`);
        const sevenTVEmote = await SevenTVEmoteGateway.emoteApi(id);
        const emote = {
            id: sevenTVEmote.id,
            defaultAlias: sevenTVEmote.name,
            source: EmoteSource.SEVENTV,
        };
        if (fs.existsSync(gifPath)) {
            return emote;
        }
        const dlPath = path.join(this.emoteRootPath, `${id}-tmp.${mime.extension(sevenTVEmote.mime)}`);
        log.debug(`Caching emote https://7tv.app/emotes/${sevenTVEmote.id} -> ${dlPath} -> ${gifPath}`);
        const emoteData = await fetch(sevenTVEmote.urls[3][1] || sevenTVEmote.urls[2][1] || sevenTVEmote[1][1] || sevenTVEmote[0][1]);
        if (!emoteData.ok) throw new Error(`Error fetching ${emoteData.url}: ${emoteData.statusText}`);
        await streamPipeline(emoteData.body!, fs.createWriteStream(dlPath));
        let delay = 0;
        try {
            delay = await extractFrameDelay(dlPath);
        } catch (e) {
            log.warn(`${e}: assuming static image`);
        }
        await convertToGif(dlPath, gifPath, delay);
        return emote;
    }

    // eslint-disable-next-line class-methods-use-this
    public tryParseUrl(url: string): string | undefined {
        const idMatch = url.match(URL_ID_MATCHER);
        return idMatch?.groups?.id;
    }

    private static async emoteApi(id: string): Promise<SevenTVEmoteData> {
        const resp = await fetch(`${API_BASE}/emotes/${id}`);
        if (!resp.ok) throw new Error(resp.statusText);
        return (await resp.json()) as SevenTVEmoteData;
    }
}
