import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, mkdir, writeFile, symlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteJunk, pickJunk, scanJunk } from '../src/lib/server/cleanup';
import { setLocationEnabled } from '../src/lib/server/locations';
import type { Torrent } from '../src/lib/types';

// Point the env-dependent config at a temp "container" mount.
const HOST_DIR = '/mock-host-downloads';
let dataRoot = '';

function setEnv() {
	process.env.DATA_ROOT = dataRoot;
	process.env.HOST_DOWNLOAD_DIR = HOST_DIR;
	process.env.LOCATIONS_STATE_FILE = join(dataRoot, 'locations.json');
}

function makeDetail(downloadDir: string = HOST_DIR): Torrent {
	return {
		id: 1,
		name: 'T',
		hashString: 'h',
		status: 0,
		error: 0,
		errorString: '',
		percentDone: 1,
		metadataPercentComplete: 1,
		rateDownload: 0,
		rateUpload: 0,
		eta: -1,
		sizeWhenDone: 0,
		leftUntilDone: 0,
		totalSize: 0,
		uploadedEver: 0,
		uploadRatio: 1,
		secondsSeeding: 0,
		secondsDownloading: 0,
		isStalled: false,
		downloadDir,
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
			{ name: 'T/keep.mkv', length: 100, bytesCompleted: 100 },
			{ name: 'T/junk1.bin', length: 50, bytesCompleted: 0 },
			{ name: 'T/sub/junk2.bin', length: 60, bytesCompleted: 0 },
			{ name: 'T/sub/keep2.bin', length: 70, bytesCompleted: 70 },
			// wanted file, still downloading: exists on disk only as ".part"
			{ name: 'T/in-progress.mkv', length: 80, bytesCompleted: 40 }
		],
		fileStats: [
			{ bytesCompleted: 100, wanted: true, priority: 0 },
			{ bytesCompleted: 0, wanted: false, priority: 0 },
			{ bytesCompleted: 0, wanted: false, priority: 0 },
			{ bytesCompleted: 70, wanted: true, priority: 0 },
			{ bytesCompleted: 40, wanted: true, priority: 0 }
		]
	};
}

async function writeFixtures(root: string, withPartJunk: boolean) {
	await rm(join(root, 'T'), { recursive: true, force: true });
	await mkdir(join(root, 'T/sub'), { recursive: true });
	await writeFile(join(root, 'T/keep.mkv'), 'a'.repeat(100));
	if (withPartJunk) {
		// junk1 was deselected mid-download: only the .part leftover exists
		await writeFile(join(root, 'T/junk1.bin.part'), 'b'.repeat(50));
	} else {
		await writeFile(join(root, 'T/junk1.bin'), 'b'.repeat(50));
	}
	await writeFile(join(root, 'T/sub/junk2.bin'), 'c'.repeat(60));
	await writeFile(join(root, 'T/sub/keep2.bin'), 'd'.repeat(70));
	// wanted file, still downloading (must never be touched)
	await writeFile(join(root, 'T/in-progress.mkv.part'), 'e'.repeat(40));
}

beforeAll(async () => {
	dataRoot = await mkdtemp(join(tmpdir(), 'txdl-cleanup-'));
	setEnv();
	// cleanup only operates on locations enabled in the app
	await setLocationEnabled(HOST_DIR, true);
});

afterAll(async () => {
	await rm(dataRoot, { recursive: true, force: true });
});

describe('pickJunk', () => {
	it('selects exactly the unselected files with their indices', () => {
		const d = makeDetail();
		const junk = pickJunk(d.files!, d.fileStats!);
		expect(junk.map((j) => j.index)).toEqual([1, 2]);
		expect(junk.map((j) => j.file.name)).toEqual(['T/junk1.bin', 'T/sub/junk2.bin']);
	});
});

describe('scanJunk / deleteJunk', () => {
	it('reports only unselected files that exist on disk', async () => {
		await writeFixtures(dataRoot, false);
		const scan = await scanJunk(makeDetail());
		expect(scan.mapped).toBe(true);
		expect(scan.enabled).toBe(true);
		expect(scan.junk.map((j) => j.name)).toEqual(['T/junk1.bin', 'T/sub/junk2.bin']);
		expect(scan.junk[0].sizeOnDisk).toBeGreaterThan(0);
		expect(scan.junk[0].partial).toBe(false);
		expect(scan.junk[1].sizeOnDisk).toBeGreaterThan(0);
		expect(scan.junk[1].partial).toBe(false);
	});

	it('finds unselected files that only exist as .part leftovers', async () => {
		await writeFixtures(dataRoot, true);
		const scan = await scanJunk(makeDetail());
		expect(scan.junk[0].name).toBe('T/junk1.bin'); // RPC reports the final name
		expect(scan.junk[0].sizeOnDisk).toBeGreaterThan(0);
		expect(scan.junk[0].partial).toBe(true);
		expect(scan.totalOnDisk).toBeGreaterThan(0);
	});

	it('deletes junk (including .part leftovers), spares wanted .part files, prunes empty dirs', async () => {
		await writeFixtures(dataRoot, true);
		const result = await deleteJunk(makeDetail());
		expect(result.failed).toEqual([]);
		expect(result.deleted).toBe(2);
		expect(result.freed).toBeGreaterThan(0);

		// wanted files untouched — including the in-progress .part
		await expect(stat(join(dataRoot, 'T/keep.mkv'))).resolves.toBeTruthy();
		await expect(stat(join(dataRoot, 'T/in-progress.mkv.part'))).resolves.toBeTruthy();
		// junk gone — both the final-name and .part variants
		await expect(stat(join(dataRoot, 'T/junk1.bin'))).rejects.toThrow();
		await expect(stat(join(dataRoot, 'T/junk1.bin.part'))).rejects.toThrow();
		// dirs that still hold wanted files survive
		await expect(stat(join(dataRoot, 'T/sub'))).resolves.toBeTruthy();
	});

	it('deletes both the final name and the .part variant when both exist', async () => {
		await writeFixtures(dataRoot, false);
		// also plant the .part variant alongside the final name
		await writeFile(join(dataRoot, 'T/junk1.bin.part'), 'f'.repeat(30));
		const result = await deleteJunk(makeDetail());
		expect(result.failed).toEqual([]);
		expect(result.deleted).toBe(2);
		await expect(stat(join(dataRoot, 'T/junk1.bin'))).rejects.toThrow();
		await expect(stat(join(dataRoot, 'T/junk1.bin.part'))).rejects.toThrow();
	});

	it('refuses symlinked junk pointing outside the root and records the failure', async () => {
		await rm(join(dataRoot, 'T'), { recursive: true, force: true });
		const outside = await mkdtemp(join(tmpdir(), 'txdl-out-'));
		try {
			const secret = join(outside, 'secret');
			await writeFile(secret, 'x'.repeat(10));
			await mkdir(join(dataRoot, 'T'), { recursive: true });
			await symlink(secret, join(dataRoot, 'T/junk1.bin'));

			const result = await deleteJunk(makeDetail());
			expect(result.deleted).toBe(0);
			expect(result.failed.length).toBe(1);
			expect(result.failed[0].error).toContain('outside');
			// the secret file survived
			await expect(stat(secret)).resolves.toBeTruthy();
		} finally {
			await rm(outside, { recursive: true, force: true });
		}
	});

	it('reports unmapped download dirs instead of touching anything', async () => {
		process.env.HOST_DOWNLOAD_DIR = '/somewhere/else';
		try {
			const d = makeDetail();
			d.downloadDir = '/not/mapped';
			const scan = await scanJunk(d);
			expect(scan.mapped).toBe(false);
			expect(scan.enabled).toBe(false);
			expect(scan.junk).toEqual([]);
		} finally {
			setEnv();
		}
	});
});

describe('identity roots (HOST_DOWNLOAD_ROOTS)', () => {
	let base = '';
	let loc = '';

	beforeAll(async () => {
		base = await mkdtemp(join(tmpdir(), 'txdl-base-'));
		loc = join(base, 'downloads');
		process.env.HOST_DOWNLOAD_DIR = '';
		process.env.HOST_DOWNLOAD_ROOTS = base;
		process.env.LOCATIONS_STATE_FILE = join(base, 'locations.json');
	});

	afterAll(async () => {
		delete process.env.HOST_DOWNLOAD_ROOTS;
		setEnv();
		await rm(base, { recursive: true, force: true });
	});

	it('reports mounted-but-not-enabled locations instead of touching anything', async () => {
		await writeFixtures(loc, false);
		const scan = await scanJunk(makeDetail(loc));
		expect(scan.mapped).toBe(true);
		expect(scan.enabled).toBe(false);
		expect(scan.junk).toEqual([]);
		await expect(stat(join(loc, 'T/junk1.bin'))).resolves.toBeTruthy();
	});

	it('deletes junk under an enabled location, prunes only inside it', async () => {
		await setLocationEnabled(loc, true);
		await writeFixtures(loc, true);
		// an unwanted file in its own dir — the dir empties and must be pruned
		await mkdir(join(loc, 'solo'), { recursive: true });
		await writeFile(join(loc, 'solo/junk3.bin'), 'f'.repeat(30));
		// an empty dir above the location must never be touched
		await mkdir(join(base, 'sibling'), { recursive: true });

		const d = makeDetail(loc);
		d.files = [...d.files!, { name: 'solo/junk3.bin', length: 30, bytesCompleted: 0 }];
		d.fileStats = [...d.fileStats!, { bytesCompleted: 0, wanted: false, priority: 0 }];

		const result = await deleteJunk(d);
		expect(result.failed).toEqual([]);
		expect(result.deleted).toBe(3);
		await expect(stat(join(loc, 'T/keep.mkv'))).resolves.toBeTruthy();
		await expect(stat(join(loc, 'T/junk1.bin'))).rejects.toThrow();
		await expect(stat(join(loc, 'solo'))).rejects.toThrow(); // emptied → pruned
		await expect(stat(loc)).resolves.toBeTruthy(); // location root survives
		await expect(stat(join(base, 'sibling'))).resolves.toBeTruthy(); // above the location: untouched
	});

	it('never prunes the torrent download dir itself, even when it empties', async () => {
		await rm(loc, { recursive: true, force: true });
		await mkdir(loc, { recursive: true });
		await writeFile(join(loc, 'junk.bin'), 'x'.repeat(10));
		const d = makeDetail(loc);
		d.files = [{ name: 'junk.bin', length: 10, bytesCompleted: 0 }];
		d.fileStats = [{ bytesCompleted: 0, wanted: false, priority: 0 }];

		const result = await deleteJunk(d);
		expect(result.failed).toEqual([]);
		expect(result.deleted).toBe(1);
		await expect(stat(join(loc, 'junk.bin'))).rejects.toThrow();
		await expect(stat(loc)).resolves.toBeTruthy(); // emptied but kept
	});
});
