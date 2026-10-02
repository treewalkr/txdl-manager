import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLocations, locationEnabled, setLocationEnabled } from '../src/lib/server/locations';

let stateDir = '';
let stateFile = '';

beforeAll(async () => {
	stateDir = await mkdtemp(join(tmpdir(), 'txdl-loc-'));
	stateFile = join(stateDir, 'locations.json');
	process.env.LOCATIONS_STATE_FILE = stateFile;
});

afterAll(async () => {
	delete process.env.LOCATIONS_STATE_FILE;
	await rm(stateDir, { recursive: true, force: true });
});

describe('locations state', () => {
	it('round-trips enable/disable through the state file', async () => {
		await setLocationEnabled('/Users/me/dl', true);
		expect((await getLocations()).enabled).toEqual(['/Users/me/dl']);
		await setLocationEnabled('/Users/me/dl', false);
		expect((await getLocations()).enabled).toEqual([]);
	});

	it('dedupes and sorts entries', async () => {
		await setLocationEnabled('/b', true);
		await setLocationEnabled('/a', true);
		await setLocationEnabled('/a', true);
		expect((await getLocations()).enabled).toEqual(['/a', '/b']);
	});

	it('starts empty when no file exists yet', async () => {
		await rm(stateFile, { force: true });
		expect(await getLocations()).toEqual({ enabled: [] });
	});

	it('treats a corrupt file as empty rather than breaking the UI', async () => {
		await writeFile(stateFile, 'not json', 'utf8');
		expect(await getLocations()).toEqual({ enabled: [] });
	});
});

describe('locationEnabled', () => {
	const state = { enabled: ['/Users/me/dl'] };

	it('accepts the location itself and dirs inside it', () => {
		expect(locationEnabled('/Users/me/dl', state)).toBe(true);
		expect(locationEnabled('/Users/me/dl/sub', state)).toBe(true);
	});

	it('rejects outsiders and prefix siblings', () => {
		expect(locationEnabled('/Users/me/dl-other', state)).toBe(false);
		expect(locationEnabled('/Users/me', state)).toBe(false);
	});
});
