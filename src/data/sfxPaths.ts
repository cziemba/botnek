// Path helpers for sfx storage.
//
// Historically the per-guild lowdb stored an *absolute* filesystem path under each alias
// (the value `YoutubeTrack.saveAudio` returned). That broke the moment the bot moved
// hosts — paths under `/home/pi/.local/share/botnek2/...` from a Raspberry Pi don't
// resolve on a fresh host where the data root is somewhere else. We now store paths
// **relative to the guild dir** (`${dataRoot}/${guildId}/`), so the same db.json works
// across any host that bind-mounts a compatible data root.
//
// resolveSfxPath stays tolerant of the legacy absolute form so a partially-migrated db
// still plays; migrateSfxSounds is the eager rewrite that runs once at boot.

import path from 'path';

export function guildDir(dataRoot: string, guildId: string): string {
    return path.resolve(path.join(dataRoot, guildId));
}

/**
 * Resolve a stored sfx value to an absolute filesystem path. Accepts both the legacy
 * absolute form and the canonical relative-to-guildDir form so a half-migrated db
 * still works.
 */
export function resolveSfxPath(guildDirPath: string, stored: string): string {
    return path.isAbsolute(stored) ? stored : path.resolve(guildDirPath, stored);
}

/**
 * Convert an absolute path produced by the download / ffmpeg pipeline into the form we
 * persist in lowdb. Always relative-to-guildDir. If `absPath` isn't actually under
 * `guildDirPath`, `path.relative` returns a `..`-prefixed string — that would be a bug
 * upstream (saveAudio writing outside the guild dir), so we surface it loudly rather
 * than silently store a fragile path.
 */
export function toStoredSfxPath(guildDirPath: string, absPath: string): string {
    const rel = path.relative(guildDirPath, absPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(
            `Refusing to store sfx path outside guildDir: guildDir=${guildDirPath} path=${absPath}`,
        );
    }
    return rel;
}

export interface MigrationResult {
    sounds: Record<string, string>;
    migrated: number;
    skipped: { alias: string; stored: string }[];
}

/**
 * Best-effort rewrite of stored sfx paths to the canonical relative-to-guildDir form.
 * Absolute paths that contain the guildId as a path segment have everything up to and
 * including that segment stripped. Absolute paths *without* the guildId marker are
 * left alone (and logged as skipped) — we can't reliably guess the right relative form
 * for them, and resolveSfxPath will still pass them through to ffmpeg, which will fail
 * loudly when the file is genuinely missing.
 *
 * Already-relative entries are returned unchanged.
 */
export function migrateSfxSounds(guildId: string, sounds: Record<string, string>): MigrationResult {
    const next: Record<string, string> = {};
    let migrated = 0;
    const skipped: { alias: string; stored: string }[] = [];
    const marker = `/${guildId}/`;

    for (const [alias, stored] of Object.entries(sounds)) {
        if (!path.isAbsolute(stored)) {
            next[alias] = stored;
            continue;
        }
        const idx = stored.indexOf(marker);
        if (idx < 0) {
            next[alias] = stored;
            skipped.push({ alias, stored });
            continue;
        }
        next[alias] = stored.slice(idx + marker.length);
        migrated += 1;
    }

    return { sounds: next, migrated, skipped };
}
