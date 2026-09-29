import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { env } from './config';

/**
 * Manual "removed from HR" overrides — the only persisted piece of HR state.
 * Group membership itself is always derived from the seed-time rule (see
 * src/lib/hr.ts), so ids of torrents deleted from Transmission can linger
 * here harmlessly.
 */
export interface HrState {
	excluded: number[];
}

const EMPTY: HrState = { excluded: [] };

function parse(raw: string): HrState {
	try {
		const data = JSON.parse(raw) as { excluded?: unknown };
		if (Array.isArray(data.excluded)) {
			const ids = data.excluded
				.map(Number)
				.filter((n) => Number.isInteger(n) && n >= 0);
			return { excluded: [...new Set(ids)].sort((a, b) => a - b) };
		}
	} catch {
		// corrupt file — start fresh rather than break the UI
	}
	return { ...EMPTY };
}

export async function getHrState(): Promise<HrState> {
	try {
		return parse(await readFile(env().hrStateFile, 'utf8'));
	} catch {
		return { ...EMPTY }; // first run (no file yet) or unreadable
	}
}

// serialize read-modify-write cycles so concurrent requests can't clobber
let queue: Promise<unknown> = Promise.resolve();

export function setHrExcluded(id: number, on: boolean): Promise<HrState> {
	const run = queue.then(async () => {
		const state = await getHrState();
		const set = new Set(state.excluded);
		if (on) set.add(id);
		else set.delete(id);
		const next: HrState = { excluded: [...set].sort((a, b) => a - b) };
		const file = env().hrStateFile;
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
