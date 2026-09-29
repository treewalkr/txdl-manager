import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteJunk, pickJunk, scanJunk } from '../src/lib/server/cleanup';
import type { Torrent } from '../src/lib/types';

// Point the env-dependent config at a temp "container" mount.
const HOST_DIR = '/mock-host-downloads';
let dataRoot = '';

function setEnv() {
	process.env.DATA_ROOT = dataRoot;
	process.env.HOST_DOWNLOAD_DIR = HOST_DIR;
}

function makeDetail(): Torrent {
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
			{ name: 'T/keep.mkv', length: 100, bytesCompleted: 100 },
			{ name: 'T/junk1.bin', length: 50, bytesCompleted: 0 },
			{ name: 'T/sub/junk2.bin', length: 60, bytesCompleted: 0 },
			{ name: 'T/sub/keep2.bin', length: 70, bytesCompleted: 70 }
		],
		fileStats: [
			{ bytesCompleted: 100, wanted: true, priority: 0 },
			{ bytesCompleted: 0, wanted: false, priority: 0 },
			{ bytesCompleted: 0, wanted: false, priority: 0 },
			{ bytesCompleted: 70, wanted: true, priority: 0 }
		]
	};
}

beforeAll(async () => {
	dataRoot = await mkdtemp(join(tmpdir(), 'txdl-cleanup-'));
	setEnv();
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
		await mkdir(join(dataRoot, 'T/sub'), { recursive: true });
		await writeFile(join(dataRoot, 'T/keep.mkv'), 'a'.repeat(100));
		await writeFile(join(dataRoot, 'T/junk1.bin'), 'b'.repeat(50));

		const scan = await scanJunk(makeDetail());
		expect(scan.mapped).toBe(true);
		expect(scan.junk.map((j) => j.name)).toEqual(['T/junk1.bin', 'T/sub/junk2.bin']);
		expect(scan.junk[0].sizeOnDisk).toBeGreaterThan(0);
		expect(scan.junk[1].sizeOnDisk).toBe(0); // not on disk
	});

	it('deletes junk, spares wanted files, prunes empty dirs, reports freed bytes', async () => {
		await rm(join(dataRoot, 'T'), { recursive: true, force: true });
		await mkdir(join(dataRoot, 'T/sub'), { recursive: true });
		await writeFile(join(dataRoot, 'T/keep.mkv'), 'a'.repeat(100));
		await writeFile(join(dataRoot, 'T/junk1.bin'), 'b'.repeat(50));
		await writeFile(join(dataRoot, 'T/sub/junk2.bin'), 'c'.repeat(60));
		await writeFile(join(dataRoot, 'T/sub/keep2.bin'), 'd'.repeat(70));

		const result = await deleteJunk(makeDetail());
		expect(result.failed).toEqual([]);
		expect(result.deleted).toBe(2);
		expect(result.freed).toBeGreaterThan(0);

		// wanted files untouched
		await expect(stat(join(dataRoot, 'T/keep.mkv'))).resolves.toBeTruthy();
		await expect(stat(join(dataRoot, 'T/sub/keep2.bin'))).resolves.toBeTruthy();
		// junk gone
		await expect(stat(join(dataRoot, 'T/junk1.bin'))).rejects.toThrow();
		await expect(stat(join(dataRoot, 'T/sub/junk2.bin'))).rejects.toThrow();
		// dirs that still hold wanted files survive
		await expect(stat(join(dataRoot, 'T/sub'))).resolves.toBeTruthy();
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
			expect(scan.junk).toEqual([]);
		} finally {
			setEnv();
		}
	});
});
