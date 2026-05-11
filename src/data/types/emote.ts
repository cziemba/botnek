// Emote schema fragment of the per-guild db. EmoteAlias is brand-typed for the same reason
// SfxAlias is — the regex (slightly looser here: case-insensitive + `_` and `-` allowed) is
// the only thing standing between user input and filesystem-cache keys / shell args.

export type EmoteAlias = string & { __validEmoteAlias: true };

export enum EmoteSource {
    'SEVENTV' = 'SEVENTV',
    'BTTV' = 'BTTV',
}

// `id` keys into the gateway's API and also into the shared `${dataRoot}/emotes/<id>.gif`
// cache. `defaultAlias` is the source's canonical name — kept around so /emote list can
// link back to the upstream listing even after a guild renames the alias.
export type Emote = {
    id: string;
    defaultAlias: string;
    source: EmoteSource;
};

// Indexed by per-guild alias (which may differ from the source's defaultAlias).
export type EmoteConfig = {
    emotes: { [alias: EmoteAlias]: Emote };
};

export function isEmoteAlias(alias: string): alias is EmoteAlias {
    const re = /^[_\-a-zA-Z0-9]{1,20}$/;
    return re.test(alias);
}
