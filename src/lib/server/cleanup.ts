import { rmdir, stat, unlink } from 'node:fs/promises';
import { posix } from 'node:path';
import type { CleanupDeleteResult, CleanupScanResult, FileStat, Torrent, TorrentFile } from '$lib/types';
import type { PathMapping } from './config';
import { env } from './config';
import { getLocations, locationEnabled } from './locations';
import { mapHostPath, mappingFor, realpathSafe, resolveContained, UnmappedPathError } from './paths';

const PART_SUFFIX = '.part';

export interface JunkCandidate {
	index: number;
	file: TorrentFile;
}

/** Files deselected in Transmission (wanted=false) — the "junk" this tool exists to clean. */
export function pickJunk(files: TorrentFile[], stats: FileStat[]): JunkCandidate[] {
	const out: JunkCandidate[] = [];
	for (let i = 0; i < files.length; i++) {
		if (stats[i] && stats[i].wanted === false) out.push({ index: i, file: files[i] });
	}
	return out;
}

/**
 * Actual on-disk names a torrent file may occupy: the final name, and — while
 * the file is incomplete, with Transmission's default rename-partial-files —
 * the name plus ".part". An unselected file's leftover is usually the .part
 * variant (deselected mid-download), so both must be checked.
 */
export function diskVariants(fileName: string): string[] {
	return fileName.endsWith(PART_SUFFIX) ? [fileName] : [fileName, fileName + PART_SUFFIX];
}

/** Actual bytes occupied on disk (sparse/preallocated aware), 0 when absent. */
async function diskUsage(path: string): Promise<number> {
	try {
		const st = await stat(path);
		return (st.blocks ?? 0) * 512 || st.size;
	} catch {
		return 0;
	}
}

/** Map one file path and report the mount root it landed under. */
function mapFile(hostPath: string, mappings: PathMapping[]): { mapped: string; root: string } {
	const mapping = mappingFor(hostPath, mappings);
	if (!mapping) {
		throw new UnmappedPathError(`"${hostPath}" is outside the mapped download roots.`);
	}
	return { mapped: mapHostPath(hostPath, mappings), root: mapping.dataRoot };
}

export async function scanJunk(detail: Torrent): Promise<CleanupScanResult> {
	const cfg = env();
	const result: CleanupScanResult = {
		downloadDir: detail.downloadDir,
		mapped: true,
		enabled: true,
		junk: [],
		totalOnDisk: 0
	};
	if (!mappingFor(detail.downloadDir, cfg.mappings)) {
		result.mapped = false;
		result.enabled = false;
		return result;
	}
	if (!locationEnabled(detail.downloadDir, await getLocations())) {
		result.enabled = false;
		return result;
	}

	for (const { index, file } of pickJunk(detail.files ?? [], detail.fileStats ?? [])) {
		let sizeOnDisk = 0;
		let partial = false;
		for (const variant of diskVariants(file.name)) {
			try {
				const { mapped } = mapFile(posix.join(detail.downloadDir, variant), cfg.mappings);
				const bytes = await diskUsage(mapped);
				sizeOnDisk += bytes;
				if (bytes > 0 && variant !== file.name) partial = true;
			} catch {
				// individual unmapped file — reported with 0, delete will surface the error
			}
		}
		result.junk.push({ index, name: file.name, length: file.length, sizeOnDisk, partial });
	}
	result.totalOnDisk = result.junk.reduce((s, j) => s + j.sizeOnDisk, 0);
	return result;
}

/** Remove empty directories up to (but not including) the torrent's own download dir. */
async function pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
	while (dir.startsWith(stopAt.endsWith('/') ? stopAt : stopAt + '/') && dir !== stopAt) {
		try {
			await rmdir(dir); // fails with ENOTEMPTY when the dir still has content
		} catch {
			return;
		}
		dir = posix.dirname(dir);
	}
}

/**
 * Delete every unselected file of this torrent that exists on disk — checking
 * both the final name and its ".part" variant. The torrent detail must be
 * fetched fresh by the caller right before calling (we never trust stale UI
 * state for a destructive operation).
 */
export async function deleteJunk(detail: Torrent): Promise<CleanupDeleteResult> {
	const cfg = env();
	const scan = await scanJunk(detail);
	const result: CleanupDeleteResult = { ...scan, deleted: 0, freed: 0, failed: [] };
	if (!scan.mapped || !scan.enabled) return result;

	// Pruning never climbs above the torrent's own download dir, even though
	// the mounted root it sits under may be much broader.
	const locationRootReal = await realpathSafe(mapHostPath(detail.downloadDir, cfg.mappings));

	for (const entry of scan.junk) {
		try {
			let removedAny = false;
			for (const variant of diskVariants(entry.name)) {
				const hostPath = posix.join(detail.downloadDir, variant);
				const { mapped, root } = mapFile(hostPath, cfg.mappings);
				const resolved = await resolveContained(root, mapped);
				if (!resolved) continue; // this variant is not on disk
				const bytes = await diskUsage(resolved);
				await unlink(resolved);
				result.freed += bytes;
				removedAny = true;
				if (locationRootReal) await pruneEmptyDirs(posix.dirname(resolved), locationRootReal);
			}
			if (removedAny) result.deleted++;
		} catch (e) {
			result.failed.push({ name: entry.name, error: e instanceof Error ? e.message : String(e) });
		}
	}
	return result;
}
