import { rmdir, stat, unlink } from 'node:fs/promises';
import { posix } from 'node:path';
import type { CleanupDeleteResult, CleanupScanResult, FileStat, Torrent, TorrentFile } from '$lib/types';
import { env } from './config';
import { mapHostPath, resolveContained } from './paths';

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

/** Actual bytes occupied on disk (sparse/preallocated aware), 0 when absent. */
async function diskUsage(path: string): Promise<number> {
	try {
		const st = await stat(path);
		return (st.blocks ?? 0) * 512 || st.size;
	} catch {
		return 0;
	}
}

export async function scanJunk(detail: Torrent): Promise<CleanupScanResult> {
	const cfg = env();
	const result: CleanupScanResult = {
		downloadDir: detail.downloadDir,
		mapped: true,
		junk: [],
		totalOnDisk: 0
	};
	try {
		mapHostPath(detail.downloadDir, cfg.hostDownloadDir, cfg.dataRoot);
	} catch {
		result.mapped = false;
		return result;
	}

	for (const { index, file } of pickJunk(detail.files ?? [], detail.fileStats ?? [])) {
		const hostPath = posix.join(detail.downloadDir, file.name);
		let sizeOnDisk = 0;
		try {
			sizeOnDisk = await diskUsage(mapHostPath(hostPath, cfg.hostDownloadDir, cfg.dataRoot));
		} catch {
			// individual unmapped file — reported with 0, delete will surface the error
		}
		result.junk.push({ index, name: file.name, length: file.length, sizeOnDisk });
	}
	result.totalOnDisk = result.junk.reduce((s, j) => s + j.sizeOnDisk, 0);
	return result;
}

/** Remove empty directories up to (but not including) the mount root. */
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
 * Delete every unselected file of this torrent that exists on disk. The torrent
 * detail must be fetched fresh by the caller right before calling (we never
 * trust stale UI state for a destructive operation).
 */
export async function deleteJunk(detail: Torrent): Promise<CleanupDeleteResult> {
	const cfg = env();
	const scan = await scanJunk(detail);
	const result: CleanupDeleteResult = { ...scan, deleted: 0, freed: 0, failed: [] };
	if (!scan.mapped) return result;

	const rootReal = await resolveContained(cfg.dataRoot, cfg.dataRoot).catch(() => null);

	for (const entry of scan.junk) {
		const hostPath = posix.join(detail.downloadDir, entry.name);
		try {
			const mapped = mapHostPath(hostPath, cfg.hostDownloadDir, cfg.dataRoot);
			const resolved = await resolveContained(cfg.dataRoot, mapped);
			if (!resolved) continue; // already gone
			const bytes = await diskUsage(resolved);
			await unlink(resolved);
			result.deleted++;
			result.freed += bytes;
			if (rootReal) await pruneEmptyDirs(posix.dirname(resolved), rootReal);
		} catch (e) {
			result.failed.push({ name: entry.name, error: e instanceof Error ? e.message : String(e) });
		}
	}
	return result;
}
