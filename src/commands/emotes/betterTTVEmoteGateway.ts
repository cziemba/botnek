import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import { promisify } from 'util';
import { pipeline } from 'stream';
import EmoteGateway from './emoteGateway.ts';
import { Emote, EmoteSource } from '../../data/types/emote.ts';
import { BotnekConfig } from '../../types/config.ts';
import log from '../../logging/logging.ts';
import { convertToGif, extractFrameDelay } from '../../utils/imagemagick.ts';

const API_BASE = 'https://api.betterttv.net/3';
const CDN_BASE = 'https://cdn.betterttv.net';
const URL_ID_MATCHER = /http.*(betterttv.com|betterttv.net)\/emote(s?)\/(?<id>\w+).*$/;
const streamPipeline = promisify(pipeline);

// Response from /emotes/{id}
interface BetterTTVEmoteData {
    id: string,
    code: string,
    imageType: string,
}

export default class BetterTTVEmoteGateway extends EmoteGateway {
    public constructor(botnekConfig: BotnekConfig) {
        super(botnekConfig);
    }

    /**
     * Fetch emote and convert to a gif of the default size.
     * @param id
     */
    public async fetchEmote(id: string): Promise<Emote> {
        const gifPath = path.join(this.emoteRootPath, `${id}.gif`);
        const betterTTVEmoteData = await BetterTTVEmoteGateway.emoteApi(id);
        const emote = {
            id: betterTTVEmoteData.id,
            defaultAlias: betterTTVEmoteData.code,
            source: EmoteSource.BTTV,
        };
        if (fs.existsSync(gifPath)) {
            return emote;
        }
        const dlPath = path.join(this.emoteRootPath, `${id}-tmp.${betterTTVEmoteData.imageType}`);
        log.debug(`Caching emote https://betterttv.com/emotes/${betterTTVEmoteData.id} -> ${dlPath} -> ${gifPath}`);
        const emoteData = await fetch(`${CDN_BASE}/emote/${id}/3x`);
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

    private static async emoteApi(id: string): Promise<BetterTTVEmoteData> {
        const resp = await fetch(`${API_BASE}/emotes/${id}`);
        if (!resp.ok) throw new Error(resp.statusText);
        return (await resp.json()) as BetterTTVEmoteData;
    }
}
