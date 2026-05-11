// BetterTTVEmoteGateway adapts BTTV's REST API (api.betterttv.net/3) to EmoteGateway. BTTV serves
// emotes at three sizes (1x, 2x, 3x) via `cdn.betterttv.net/emote/<id>/<n>x`; we always pull 3x and
// let `convertToGif` downscale, because BTTV doesn't return dimension metadata so picking smaller
// sizes blind would risk uploading sub-Discord-emoji-resolution gifs.
//
// BTTV's `imageType` field is the source format ("gif" | "webp" | "png"). The cached file is always
// re-encoded to GIF because BTTV's "animated WEBP" responses are routinely delivered with a `gif`
// extension hint but a webp container — Discord's webhook attachment renderer rejects the resulting
// mismatched magic bytes, and the cleanest fix is to push everything through ImageMagick coalesce.
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { Emote, EmoteSource } from '../../data/types/emote';
import log from '../../logging/logging';
import { BotnekConfig } from '../../types/config';
import { convertToGif, extractFrameDelay } from '../../utils/imagemagick';
import EmoteGateway from './emoteGateway';

const API_BASE = 'https://api.betterttv.net/3';
const CDN_BASE = 'https://cdn.betterttv.net';
// `/emote/<id>` and `/emotes/<id>` are both produced by BTTV's UI depending on whether the link
// came from the editor or a share button. Tolerate both.
const URL_ID_MATCHER = /http.*(betterttv.com|betterttv.net)\/emote(s?)\/(?<id>\w+).*$/;
const streamPipeline = promisify(pipeline);

interface BetterTTVEmoteData {
    id: string;
    code: string;
    imageType: string;
}

export default class BetterTTVEmoteGateway extends EmoteGateway {
    public constructor(botnekConfig: BotnekConfig) {
        super(botnekConfig);
    }

    public async fetchEmote(id: string): Promise<Emote> {
        const gifPath = path.join(this.emoteRootPath, `${id}.gif`);
        const betterTTVEmoteData = await BetterTTVEmoteGateway.emoteApi(id);
        const emote = {
            id: betterTTVEmoteData.id,
            // Snapshot the BTTV `code` at fetch time as the default alias; renames upstream don't
            // propagate (matches the 7TV gateway's behavior for consistent UX).
            defaultAlias: betterTTVEmoteData.code,
            source: EmoteSource.BTTV,
        };
        // Cache hit short-circuits before the CDN fetch — but note the global cache has no GC, so
        // emotes removed from every guild's db still occupy disk indefinitely.
        if (fs.existsSync(gifPath)) {
            return emote;
        }
        // The temp file uses the API-reported `imageType` extension so ImageMagick reads the right
        // decoder; relying on container sniffing alone has been unreliable for BTTV's webp-as-gif
        // responses.
        const dlPath = path.join(this.emoteRootPath, `${id}-tmp.${betterTTVEmoteData.imageType}`);
        log.debug(
            `Caching emote https://betterttv.com/emotes/${betterTTVEmoteData.id} -> ${dlPath} -> ${gifPath}`,
        );
        // Always pull `3x` (highest available); BTTV doesn't expose a width field and downscaling
        // to Discord emoji size happens in `convertToGif`. Pulling smaller would risk an undersized
        // result on emotes whose 1x is below 112px tall.
        const emoteData = await fetch(`${CDN_BASE}/emote/${id}/3x`);
        if (!emoteData.ok)
            throw new Error(`Error fetching ${emoteData.url}: ${emoteData.statusText}`);
        await streamPipeline(emoteData.body!, fs.createWriteStream(dlPath));
        // Static images don't have a `Delay:` field in `identify` output and `extractFrameDelay`
        // throws — treat as a 0-delay (single-frame) gif rather than failing the import.
        let delay = 0;
        try {
            delay = await extractFrameDelay(dlPath);
        } catch (e) {
            log.warn(`${e}: assuming static image`);
        }
        await convertToGif(dlPath, gifPath, delay);
        return emote;
    }

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
