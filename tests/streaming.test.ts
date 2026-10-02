import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	StreamError,
	buildFfmpegArgs,
	decideMode,
	parseRange,
	pickPlayable,
	resolveStreamFile,
	type MediaProbe
} from '../src/lib/server/streaming';
import { PathEscapeError, UnmappedPathError } from '../src/lib/server/paths';
import type { Torrent } from '../src/lib/types';

/* ---------- parseRange ---------- */

describe('parseRange', () => {
	it('serves the full file without a header or with garbage', () => {
		expect(parseRange(null, 100)).toEqual({ kind: 'full' });
		expect(parseRange(undefined, 100)).toEqual({ kind: 'full' });
		expect(parseRange('', 100)).toEqual({ kind: 'full' });
		expect(parseRange('chunks=0-1', 100)).toEqual({ kind: 'full' });
		expect(parseRange('bytes=5-1', 100)).toEqual({ kind: 'full' }); // end before start
		expect(parseRange('bytes=0-10,20-30', 100)).toEqual({ kind: 'full' }); // multi-range ignored
		expect(parseRange('bytes=-', 100)).toEqual({ kind: 'full' });
	});

	it('parses explicit, open-ended and suffix ranges', () => {
		expect(parseRange('bytes=0-99', 100)).toEqual({ kind: 'partial', start: 0, end: 99 });
		expect(parseRange('bytes=10-', 100)).toEqual({ kind: 'partial', start: 10, end: 99 });
		expect(parseRange('bytes=-50', 100)).toEqual({ kind: 'partial', start: 50, end: 99 });
		// suffix longer than the file covers it; end is clamped to EOF
		expect(parseRange('bytes=-500', 100)).toEqual({ kind: 'partial', start: 0, end: 99 });
		expect(parseRange('bytes=90-9999', 100)).toEqual({ kind: 'partial', start: 90, end: 99 });
		expect(parseRange('bytes=0-0', 100)).toEqual({ kind: 'partial', start: 0, end: 0 });
	});

	it('flags unsatisfiable ranges', () => {
		expect(parseRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('bytes=500-600', 100)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
	});
});

/* ---------- decideMode ---------- */

const probe = (videoCodec: string | null, audioCodec: string | null, pixFmt = 'yuv420p'): MediaProbe => ({
	durationSec: 600,
	videoCodec,
	audioCodec,
	hasAudio: audioCodec !== null,
	pixFmt
});

describe('decideMode', () => {
	it('plays native containers directly', () => {
		expect(decideMode('a.mp4', probe('h264', 'aac'), true)).toBe('direct');
		expect(decideMode('a.webm', probe('vp9', 'opus'), false)).toBe('direct');
		expect(decideMode('a.mp4', null, false)).toBe('direct'); // trust the container, best effort
	});

	it('remuxes when only the container is foreign', () => {
		expect(decideMode('a.mkv', probe('h264', 'aac'), true)).toBe('remux');
		expect(decideMode('an.avi', probe('h264', 'aac'), true)).toBe('remux');
		expect(decideMode('a.mkv', probe('h264', null), true)).toBe('remux'); // no audio is fine
	});

	it('transcodes when a codec is foreign, or when codecs cannot be verified', () => {
		expect(decideMode('a.mkv', probe('hevc', 'ac3'), true)).toBe('transcode');
		expect(decideMode('a.mkv', probe('h264', 'ac3'), true)).toBe('transcode'); // audio needs converting
		expect(decideMode('a.mp4', probe('hevc', 'aac'), true)).toBe('transcode');
		expect(decideMode('a.mkv', null, true)).toBe('transcode');
	});

	it('transcodes 10-bit / non-4:2:0 h264 even though the codec name is browser-safe', () => {
		expect(decideMode('a.mkv', probe('h264', 'aac', 'yuv420p10le'), true)).toBe('transcode');
		expect(decideMode('a.mkv', probe('h264', 'aac', 'yuv422p'), true)).toBe('transcode');
	});

	it('gives up on foreign containers without ffmpeg', () => {
		expect(decideMode('a.mkv', probe('h264', 'aac'), false)).toBe('unsupported');
		expect(decideMode('a.wmv', probe('wmv3', 'wmav2'), false)).toBe('unsupported');
	});
});

/* ---------- buildFfmpegArgs ---------- */

describe('buildFfmpegArgs', () => {
	it('copies browser-safe streams, converts the rest', () => {
		const bothSafe = buildFfmpegArgs('/x/a.mkv', 0, probe('h264', 'aac'));
		expect(bothSafe.join(' ')).toContain('-c:v copy');
		expect(bothSafe.join(' ')).toContain('-c:a copy');

		const neitherSafe = buildFfmpegArgs('/x/a.wmv', 0, probe('wmv3', 'wmav2'));
		expect(neitherSafe.join(' ')).toContain('-c:v libx264 -preset veryfast');
		expect(neitherSafe.join(' ')).toContain('-c:a aac -b:a 192k');

		// video safe + audio foreign: copy video, convert audio only
		const mixed = buildFfmpegArgs('/x/a.mkv', 0, probe('h264', 'dts'));
		expect(mixed.join(' ')).toContain('-c:v copy');
		expect(mixed.join(' ')).toContain('-c:a aac');
	});

	it('drops audio when the file has none', () => {
		expect(buildFfmpegArgs('/x/a.mkv', 0, probe('h264', null))).toContain('-an');
	});

	it('never stream-copies 10-bit video even though the codec is h264', () => {
		const args = buildFfmpegArgs('/x/a.mkv', 0, probe('h264', 'aac', 'yuv420p10le'));
		expect(args.join(' ')).toContain('-c:v libx264');
		expect(args.join(' ')).toContain('-pix_fmt yuv420p');
	});

	it('converts audio when the probe found nothing (cannot assume silence)', () => {
		const args = buildFfmpegArgs('/x/a.mkv', 0, null);
		expect(args.join(' ')).toContain('-c:a aac');
		expect(args).not.toContain('-an');
	});

	it('seeks on the input, throttles the read rate, streams fMP4 to stdout', () => {
		const args = buildFfmpegArgs('/x/a.mkv', 91.5, probe('h264', 'aac'));
		expect(args.join(' ')).toContain('-ss 91.500');
		expect(args.join(' ')).toContain('-readrate 1.5');
		expect(args.join(' ')).toContain('-movflags frag_keyframe+empty_moov+default_base_moof');
		expect(args[args.length - 1]).toBe('pipe:1');
		// seek options must come before the input
		expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('/x/a.mkv'));
		// no seek offset → no -ss flag
		expect(buildFfmpegArgs('/x/a.mkv', 0, probe('h264', 'aac')).includes('-ss')).toBe(false);
	});
});

/* ---------- pickPlayable ---------- */

describe('pickPlayable', () => {
	it('lists videos and images in torrent order with completeness flags', () => {
		const entries = pickPlayable(makeDetail());
		expect(entries).toEqual([
			{ index: 0, name: 'T/movie.mkv', kind: 'video', complete: true, length: 100 },
			{ index: 1, name: 'T/half.mkv', kind: 'video', complete: false, length: 80 },
			{ index: 3, name: 'T/poster.jpg', kind: 'image', complete: true, length: 10 },
			{ index: 4, name: 'T/loading.png', kind: 'image', complete: false, length: 50 }
		]);
	});

	it('falls back to the file record when stats are missing', () => {
		const d = makeDetail();
		d.fileStats = undefined;
		const entries = pickPlayable(d);
		expect(entries.map((e) => e.complete)).toEqual([true, false, true, false]);
	});

	it('returns nothing for torrents without playable files', () => {
		const d = makeDetail();
		d.files = [{ name: 'T/a.txt', length: 1, bytesCompleted: 1 }];
		expect(pickPlayable(d)).toEqual([]);
	});
});

/* ---------- resolveStreamFile (env-dependent, temp tree like cleanup tests) ---------- */

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
			{ name: 'T/movie.mkv', length: 100, bytesCompleted: 100 },
			{ name: 'T/half.mkv', length: 80, bytesCompleted: 40 },
			{ name: 'T/note.txt', length: 3, bytesCompleted: 3 },
			{ name: 'T/poster.jpg', length: 10, bytesCompleted: 10 },
			{ name: 'T/loading.png', length: 50, bytesCompleted: 10 }
		],
		fileStats: [
			{ bytesCompleted: 100, wanted: true, priority: 0 },
			{ bytesCompleted: 40, wanted: true, priority: 0 },
			{ bytesCompleted: 3, wanted: true, priority: 0 },
			{ bytesCompleted: 10, wanted: true, priority: 0 },
			{ bytesCompleted: 10, wanted: true, priority: 0 }
		]
	};
}

async function writeFixtures() {
	await rm(join(dataRoot, 'T'), { recursive: true, force: true });
	await mkdir(join(dataRoot, 'T'), { recursive: true });
	await writeFile(join(dataRoot, 'T/movie.mkv'), 'm'.repeat(100));
	await writeFile(join(dataRoot, 'T/half.mkv.part'), 'h'.repeat(40));
	await writeFile(join(dataRoot, 'T/note.txt'), 'abc');
	await writeFile(join(dataRoot, 'T/poster.jpg'), 'j'.repeat(10));
	await writeFile(join(dataRoot, 'T/loading.png.part'), 'p'.repeat(10));
}

async function expectStreamError(p: Promise<unknown>, status: number, fragment: string) {
	try {
		await p;
		expect.unreachable();
	} catch (e) {
		expect(e).toBeInstanceOf(StreamError);
		const err = e as StreamError;
		expect(err.status).toBe(status);
		expect(err.message).toContain(fragment);
	}
}

describe('resolveStreamFile', () => {
	beforeAll(async () => {
		dataRoot = await mkdtemp(join(tmpdir(), 'txdl-stream-'));
		setEnv();
		await writeFixtures();
	});

	afterAll(async () => {
		await rm(dataRoot, { recursive: true, force: true });
	});

	it('resolves a complete video file inside the mount', async () => {
		const { file, path } = await resolveStreamFile(makeDetail(), 0);
		expect(file.name).toBe('T/movie.mkv');
		expect(path.endsWith('T/movie.mkv')).toBe(true);
	});

	it('resolves complete images too', async () => {
		const { file, path } = await resolveStreamFile(makeDetail(), 3);
		expect(file.name).toBe('T/poster.jpg');
		expect(path.endsWith('T/poster.jpg')).toBe(true);
	});

	it('refuses non-media files, incomplete files, and bad indices', async () => {
		await expectStreamError(resolveStreamFile(makeDetail(), 2), 400, 'not a playable media file');
		await expectStreamError(resolveStreamFile(makeDetail(), 1), 409, '50% downloaded');
		await expectStreamError(resolveStreamFile(makeDetail(), 4), 409, '20% downloaded');
		await expectStreamError(resolveStreamFile(makeDetail(), 9), 404, 'no file #9');
	});

	it('refuses torrents without a file list yet', async () => {
		const d = makeDetail();
		d.files = [];
		d.fileStats = [];
		await expectStreamError(resolveStreamFile(d, 0), 404, 'no file list');
	});

	it('reports files that vanished from disk', async () => {
		const d = makeDetail();
		d.files = [{ name: 'T/ghost.mkv', length: 10, bytesCompleted: 10 }];
		d.fileStats = [{ bytesCompleted: 10, wanted: true, priority: 0 }];
		await expectStreamError(resolveStreamFile(d, 0), 410, 'not on disk');
	});

	it('refuses unmapped download dirs', async () => {
		const d = makeDetail();
		d.downloadDir = '/somewhere/else';
		await expect(resolveStreamFile(d, 0)).rejects.toBeInstanceOf(UnmappedPathError);
	});

	it('refuses symlinked video files pointing outside the mount', async () => {
		const outside = await mkdtemp(join(tmpdir(), 'txdl-stream-out-'));
		try {
			const secret = join(outside, 'secret.mkv');
			await writeFile(secret, 'x'.repeat(10));
			await rm(join(dataRoot, 'T/movie.mkv'));
			await symlink(secret, join(dataRoot, 'T/movie.mkv'));
			await expect(resolveStreamFile(makeDetail(), 0)).rejects.toBeInstanceOf(PathEscapeError);
		} finally {
			await rm(outside, { recursive: true, force: true });
		}
	});
});
