import type { Torrent } from '$lib/types';
import { scanJunk } from './cleanup';
import { getLocations } from './locations';
import { getTorrentDetails, getTorrents } from './transmission';

/** One list-row junk indicator: real reclaimable bytes for a torrent. */
export interface JunkSweepEntry {
	id: number;
	/** Unselected-file bytes still on disk (entries with 0 are omitted). */
	bytes: number;
	/** How many unselected leftovers exist on disk. */
	count: number;
}

interface CacheEntry {
	/** totalSize:sizeWhenDone:downloadDir — moves when the deselection moves. */
	sig: string;
	/** Enabled-locations snapshot, so enabling a location re-scans. */
	locations: string;
	bytes: number;
	count: number;
}

const cache = new Map<number, CacheEntry>();

export function invalidateJunk(ids: number[]): void {
	for (const id of ids) cache.delete(id);
}

export function clearJunkCache(): void {
	cache.clear();
}

function signature(t: Torrent): string {
	return `${t.totalSize}:${t.sizeWhenDone}:${t.downloadDir}`;
}

// one sweep at a time — concurrent requests share the pass
let inFlight: Promise<JunkSweepEntry[]> | null = null;

/**
 * Scan every torrent with deselected files (totalSize > sizeWhenDone in the
 * cheap list data) and report the ones with real reclaimable bytes on disk.
 * Unchanged torrents are served from the in-memory cache without touching
 * the disk again; disk-side changes made outside this app (e.g. a cleanup
 * delete) must go through invalidateJunk.
 */
export function sweepJunk(
	listTorrents: () => Promise<Torrent[]> = getTorrents,
	detailsOf: (ids: number[]) => Promise<Torrent[]> = getTorrentDetails
): Promise<JunkSweepEntry[]> {
	if (inFlight) return inFlight;
	inFlight = runSweep(listTorrents, detailsOf).finally(() => {
		inFlight = null;
	});
	return inFlight;
}

async function runSweep(
	listTorrents: () => Promise<Torrent[]>,
	detailsOf: (ids: number[]) => Promise<Torrent[]>
): Promise<JunkSweepEntry[]> {
	const [torrents, locations] = await Promise.all([listTorrents(), getLocations()]);
	const locKey = locations.enabled.join('|');

	// Only torrents with deselected files can hold junk; anything that stops
	// matching (files re-selected, torrent removed) leaves the cache.
	const candidates = torrents.filter((t) => t.totalSize > t.sizeWhenDone);
	const candidateIds = new Set(candidates.map((t) => t.id));
	for (const id of cache.keys()) if (!candidateIds.has(id)) cache.delete(id);

	const stale = candidates.filter((t) => {
		const c = cache.get(t.id);
		return !c || c.sig !== signature(t) || c.locations !== locKey;
	});
	if (stale.length > 0) {
		// scanJunk enforces the mapped + enabled-location gates itself
		for (const detail of await detailsOf(stale.map((t) => t.id))) {
			const scan = await scanJunk(detail);
			cache.set(detail.id, {
				sig: signature(detail),
				locations: locKey,
				bytes: scan.totalOnDisk,
				count: scan.junk.filter((j) => j.sizeOnDisk > 0).length
			});
		}
	}

	return [...cache]
		.filter(([, c]) => c.bytes > 0)
		.map(([id, c]) => ({ id, bytes: c.bytes, count: c.count }));
}
