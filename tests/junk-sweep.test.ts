import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearJunkCache, invalidateJunk, sweepJunk } from '../src/lib/server/junk-sweep';
import { setLocationEnabled } from '../src/lib/server/locations';
import { matchesFilter } from '../src/lib/status';
import type { Torrent } from '../src/lib/types';

// Point the env-dependent config at a temp "container" mount.
const HOST_DIR = '/mock-host-downloads';
let dataRoot = '';

function setEnv() {
	process.env.DATA_ROOT = dataRoot;
	process.env.HOST_DOWNLOAD_DIR = HOST_DIR;
	process.env.HOST_DOWNLOAD_ROOTS = '';
	process.env.LOCATIONS_STATE_FILE = join(dataRoot, 'locations.json');
}

/** Candidate by default: keep.mkv wanted (100), junk.bin deselected (50). */
function makeTorrent(id: number): Torrent {
	return {
		id,
		name: `T${id}`,
		hashString: `h${id}`,
		status: 0,
		error: 0,
		errorString: '',
		percentDone: 1,
		metadataPercentComplete: 1,
		rateDownload: 0,
		rateUpload: 0,
		eta: -1,
		sizeWhenDone: 100,
		leftUntilDone: 0,
		totalSize: 150,
		uploadedEver: 0,
		uploadRatio: 1,
		secondsSeeding: 0,
		secondsDownloading: 0,
		isStalled: false,
		downloadDir: HOST_DIR,
		labels: [],
		seedRatioMode: 0,
		seedRatioLimit: 2,
		dateAdded: 0,
		dateDone: 0,
		activityDate: 0,
		peersConnected: 0,
		peersSendingToUs: 0,
		peersGettingFromUs: 0,
		queuePosition: 0,
		files: [
			{ name: `T${id}/keep.mkv`, length: 100, bytesCompleted: 100 },
			{ name: `T${id}/junk.bin`, length: 50, bytesCompleted: 0 }
		],
		fileStats: [
			{ bytesCompleted: 100, wanted: true, priority: 0 },
			{ bytesCompleted: 0, wanted: false, priority: 0 }
		]
	};
}

/** The list poll carries no per-file data — strip it, like torrent-get does. */
function asList(t: Torrent): Torrent {
	const clone = { ...t };
	delete clone.files;
	delete clone.fileStats;
	return clone;
}

let listState: Torrent[] = [];
let detailState: Torrent[] = [];
let detailFetches = 0;

const listTorrents = () => Promise.resolve(listState.map(asList));
const detailsOf = (ids: number[]) => {
	detailFetches++;
	return Promise.resolve(detailState.filter((d) => ids.includes(d.id)));
};

beforeAll(async () => {
	dataRoot = await mkdtemp(join(tmpdir(), 'txdl-junk-'));
	setEnv();
	await setLocationEnabled(HOST_DIR, true);
	// T1: deselected junk exists on disk; T2: candidate but its junk never
	// landed; T3: junk on disk but the file is still selected (non-candidate).
	await mkdir(join(dataRoot, 'T1'), { recursive: true });
	await writeFile(join(dataRoot, 'T1/keep.mkv'), 'a'.repeat(100));
	await writeFile(join(dataRoot, 'T1/junk.bin'), 'b'.repeat(50));
	await mkdir(join(dataRoot, 'T3'), { recursive: true });
	await writeFile(join(dataRoot, 'T3/junk.bin'), 'c'.repeat(50));
});

beforeEach(() => {
	clearJunkCache();
	detailFetches = 0;
	const t1 = makeTorrent(1);
	const t2 = makeTorrent(2);
	const t3 = makeTorrent(3);
	t3.sizeWhenDone = 150; // everything selected
	t3.fileStats = [
		{ bytesCompleted: 100, wanted: true, priority: 0 },
		{ bytesCompleted: 50, wanted: true, priority: 0 }
	];
	listState = [t1, t2, t3].map(asList);
	detailState = [t1, t2, t3];
});

afterAll(async () => {
	await rm(dataRoot, { recursive: true, force: true });
});

describe('sweepJunk', () => {
	it('reports only candidates with junk actually on disk', async () => {
		const entries = await sweepJunk(listTorrents, detailsOf);
		expect(entries.map((e) => e.id)).toEqual([1]);
		expect(entries[0].bytes).toBeGreaterThan(0);
		expect(entries[0].count).toBe(1);
		expect(detailFetches).toBe(1); // one bulk fetch, non-candidates excluded
	});

	it('serves unchanged torrents from the cache without re-fetching', async () => {
		await sweepJunk(listTorrents, detailsOf);
		expect(detailFetches).toBe(1);
		const again = await sweepJunk(listTorrents, detailsOf);
		expect(detailFetches).toBe(1); // signature unchanged: no detail fetch, no stats
		expect(again.map((e) => e.id)).toEqual([1]);
	});

	it('re-scans when the deselection changes', async () => {
		await sweepJunk(listTorrents, detailsOf);
		listState = listState.map((t) => (t.id === 1 ? { ...t, sizeWhenDone: 90 } : t));
		detailState = detailState.map((t) => (t.id === 1 ? { ...t, sizeWhenDone: 90 } : t));
		const entries = await sweepJunk(listTorrents, detailsOf);
		expect(detailFetches).toBe(2);
		expect(entries.map((e) => e.id)).toEqual([1]);
	});

	it('re-scans when the enabled locations change', async () => {
		await sweepJunk(listTorrents, detailsOf);
		await setLocationEnabled(HOST_DIR, false);
		expect(await sweepJunk(listTorrents, detailsOf)).toEqual([]);
		expect(detailFetches).toBe(2); // locations snapshot mismatch forced a re-scan
		await setLocationEnabled(HOST_DIR, true);
		expect((await sweepJunk(listTorrents, detailsOf)).map((e) => e.id)).toEqual([1]);
	});

	it('invalidateJunk forces a re-scan for that torrent', async () => {
		await sweepJunk(listTorrents, detailsOf);
		invalidateJunk([1]);
		const entries = await sweepJunk(listTorrents, detailsOf);
		expect(detailFetches).toBe(2);
		expect(entries.map((e) => e.id)).toEqual([1]);
	});

	it('drops torrents that stop being candidates (files re-selected)', async () => {
		await sweepJunk(listTorrents, detailsOf);
		listState = listState.filter((t) => t.id !== 1);
		detailState = detailState.filter((t) => t.id !== 1);
		expect(await sweepJunk(listTorrents, detailsOf)).toEqual([]);
		expect(detailFetches).toBe(1); // nothing left to scan
	});
});

describe('matchesFilter junk', () => {
	it('matches exactly the swept ids', () => {
		const t = makeTorrent(9);
		expect(matchesFilter(t, 'junk', [], new Set([9]))).toBe(true);
		expect(matchesFilter(t, 'junk', [], new Set())).toBe(false);
		expect(matchesFilter(t, 'junk', [])).toBe(false); // no sweep data yet
		expect(matchesFilter(t, 'all', [], new Set([9]))).toBe(true);
	});
});
