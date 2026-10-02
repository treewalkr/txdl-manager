import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, posix } from 'node:path';
import { env } from './config';
import { isInsideRoot } from './paths';

/**
 * Download locations the user enabled in the UI for junk cleanup — the
 * operational boundary inside the mounted roots (HOST_DOWNLOAD_ROOTS). The
 * roots decide what the container can *see*; this list decides what the app
 * may *touch*. Entries are absolute host paths; ids of removed torrents'
 * locations can linger here harmlessly.
 */
export interface LocationsState {
	enabled: string[];
}

const EMPTY: LocationsState = { enabled: [] };

function normalizePath(p: string): string {
	return posix.normalize(p.trim());
}

function parse(raw: string): LocationsState {
	try {
		const data = JSON.parse(raw) as { enabled?: unknown };
		if (Array.isArray(data.enabled)) {
			const dirs = data.enabled
				.map((v) => (typeof v === 'string' ? normalizePath(v) : ''))
				.filter((s) => s.startsWith('/'));
			return { enabled: [...new Set(dirs)].sort() };
		}
	} catch {
		// corrupt file — start fresh rather than break the UI
	}
	return { ...EMPTY };
}

export async function getLocations(): Promise<LocationsState> {
	try {
		return parse(await readFile(env().locationsStateFile, 'utf8'));
	} catch {
		return { ...EMPTY }; // first run (no file yet) or unreadable
	}
}

/** A download dir is operable when it sits inside (or equals) an enabled location. */
export function locationEnabled(downloadDir: string, state: LocationsState): boolean {
	return state.enabled.some((loc) => isInsideRoot(loc, downloadDir));
}

// serialize read-modify-write cycles so concurrent requests can't clobber
let queue: Promise<unknown> = Promise.resolve();

export function setLocationEnabled(path: string, on: boolean): Promise<LocationsState> {
	const run = queue.then(async () => {
		const state = await getLocations();
		const set = new Set(state.enabled);
		if (on) set.add(normalizePath(path));
		else set.delete(normalizePath(path));
		const next: LocationsState = { enabled: [...set].sort() };
		const file = env().locationsStateFile;
		await mkdir(dirname(file), { recursive: true });
		// write-then-rename so a crash mid-write can't corrupt the file
		const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
		await writeFile(tmp, `${JSON.stringify({ version: 1, ...next }, null, '\t')}\n`);
		await rename(tmp, file);
		return next;
	});
	queue = run.catch(() => {});
	return run;
}
