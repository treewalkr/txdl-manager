import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getHrState, setHrExcluded } from '../src/lib/server/hr-state';

// Point the env-dependent config at a temp state file (nested, to exercise
// the recursive mkdir on first write). Config reads env lazily, per call.
let dir = '';
let stateFile = '';

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'txdl-hr-'));
	stateFile = join(dir, 'nested', 'hr-state.json');
	process.env.HR_STATE_FILE = stateFile;
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('hr-state', () => {
	it('returns empty state when the file does not exist yet', async () => {
		expect(await getHrState()).toEqual({ excluded: [] });
	});

	it('persists exclusions and inclusions as valid JSON', async () => {
		let state = await setHrExcluded(7, true);
		expect(state.excluded).toEqual([7]);
		expect(await getHrState()).toEqual({ excluded: [7] });

		state = await setHrExcluded(3, true);
		expect(state.excluded).toEqual([3, 7]);

		// excluding an already-excluded id is a no-op
		state = await setHrExcluded(3, true);
		expect(state.excluded).toEqual([3, 7]);

		state = await setHrExcluded(7, false);
		expect(state.excluded).toEqual([3]);

		const raw = JSON.parse(await readFile(stateFile, 'utf8'));
		expect(raw).toEqual({ version: 1, excluded: [3] });
	});

	it('treats a corrupt file as fresh state instead of failing', async () => {
		await writeFile(stateFile, 'not json{', 'utf8');
		expect(await getHrState()).toEqual({ excluded: [] });
		// and writing after corruption recovers a clean file
		const state = await setHrExcluded(11, true);
		expect(state.excluded).toEqual([11]);
		expect(await getHrState()).toEqual({ excluded: [11] });
	});
});
