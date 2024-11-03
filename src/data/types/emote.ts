export type EmoteAlias = string & { __validEmoteAlias: true };

export enum EmoteSource {
    'SEVENTV' = 'SEVENTV',
    'BTTV' = 'BTTV',
}

export type Emote = {
    id: string;
    defaultAlias: string;
    source: EmoteSource;
};

// Emote are per alias
export type EmoteConfig = {
    emotes: { [alias: EmoteAlias]: Emote };
};

export function isEmoteAlias(alias: string): alias is EmoteAlias {
    const re = /^[_\-a-zA-Z0-9]{1,20}$/;
    return re.test(alias);
}
