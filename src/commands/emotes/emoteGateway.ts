import path from 'path';
import fs from 'fs';
import { Emote } from '../../data/types/emote.js';
import { BotnekConfig } from '../../types/config.js';

/**
 * Parent class for interacting with various emote platforms (namely BTTV and 7TV).
 * Emote cached are _all_ gif format.
 */
export default abstract class EmoteGateway {
    public static readonly EMOTE_DIR = 'emotes';

    protected readonly emoteRootPath: string;

    /**
     * Fetch the emote and save to disk (if not present), returning the emote path.
     * @param id the Emote to save.
     */
    public abstract fetchEmote(id: string): Promise<Emote>;

    /**
     * Parse the url according to extract the emote id and return it or undefined
     * @param url
     */
    public abstract tryParseUrl(url: string): string | undefined;

    protected constructor(botnekConfig: BotnekConfig) {
        this.emoteRootPath = path.resolve(path.join(botnekConfig.dataRoot, EmoteGateway.EMOTE_DIR));
        if (!fs.existsSync(this.emoteRootPath)) fs.mkdirSync(this.emoteRootPath, { recursive: true });
    }
}
