import { describe, expect, it } from 'bun:test';
import { parseReviewPrefs } from '../src/lib/review';
import { pickReviewMedia } from '../src/lib/server/review';
import type { FileStat, Torrent, TorrentFile } from '../src/lib/types';

const MAPPINGS = [{ hostRoot: '/data', dataRoot: '/data' }];

// [name, length, wanted, completedFraction]
type Spec = [string, number, boolean, number?];

function makeTorrent(id: number, activityDate: number, downloadDir: string, specs: Spec[]): Torrent {
	const files: TorrentFile[] = [];
	const fileStats: FileStat[] = [];
	for (const [name, length, wanted, frac = 1] of specs) {
		const done = Math.floor(length * frac);
		files.push({ name, length, bytesCompleted: done });
		fileStats.push({ bytesCompleted: done, wanted, priority: 0 });
	}
	return {
		id,
		name: `torrent-${id}`,
		hashString: `hash-${id}`,
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
		activityDate,
		peersConnected: 0,
		peersSendingToUs: 0,
		peersGettingFromUs: 0,
		queuePosition: 0,
		files,
		fileStats
	};
}

describe('parseReviewPrefs', () => {
	it('returns empty prefs for null, empty and malformed input', () => {
		for (const raw of [null, undefined, '', 'not json', '[1,2]', '42', '{"other":true}']) {
			expect(parseReviewPrefs(raw)).toEqual({ kept: [], cleared: [] });
		}
	});

	it('keeps valid keys, drops non-string entries', () => {
		const p = parseReviewPrefs('{"kept":["a:1","b:2",7,null,"c:3"],"cleared":"nope"}');
		expect(p.kept).toEqual(['a:1', 'b:2', 'c:3']);
		expect(p.cleared).toEqual([]);
	});
});

describe('pickReviewMedia', () => {
	it('splits complete media into deck (wanted) and rejected (unwanted)', () => {
		const t = makeTorrent(1, 10, '/data/a', [
			['pack/keep.mkv', 100, true],
			['pack/reject.jpg', 50, false],
			['pack/notes.txt', 10, true], // not media
			['pack/subs.zip', 20, false] // junk, but not media
		]);
		const r = pickReviewMedia([t], MAPPINGS);
		expect(r.deck.map((i) => i.name)).toEqual(['pack/keep.mkv']);
		expect(r.rejected.map((i) => i.name)).toEqual(['pack/reject.jpg']);
		expect(r.deck[0]).toMatchObject({ torrentId: 1, hashString: 'hash-1', index: 0, kind: 'video', length: 100 });
		expect(r.rejected[0]).toMatchObject({ index: 1, kind: 'image' });
	});

	it('drops incomplete media — it cannot be previewed', () => {
		const t = makeTorrent(1, 10, '/data/a', [
			['half.mkv', 100, true, 0.4],
			['done.png', 100, true, 1]
		]);
		const r = pickReviewMedia([t], MAPPINGS);
		expect(r.deck.map((i) => i.name)).toEqual(['done.png']);
		expect(r.rejected).toEqual([]);
	});

	it('skips torrents whose download dir is outside the mapped roots', () => {
		const t = makeTorrent(1, 10, '/elsewhere/a', [
			['keep.mkv', 100, true],
			['reject.jpg', 50, false]
		]);
		const r = pickReviewMedia([t], MAPPINGS);
		expect(r.deck).toEqual([]);
		expect(r.rejected).toEqual([]);
	});

	it('orders by torrent activity (most recent first), keeping file order within a torrent', () => {
		const old = makeTorrent(1, 100, '/data/a', [
			['old1.jpg', 10, true],
			['old2.jpg', 10, true]
		]);
		const recent = makeTorrent(2, 200, '/data/b', [['new1.jpg', 10, true]]);
		const r = pickReviewMedia([old, recent], MAPPINGS);
		expect(r.deck.map((i) => i.name)).toEqual(['new1.jpg', 'old1.jpg', 'old2.jpg']);
	});

	it('treats missing fileStats as wanted and falls back to file progress', () => {
		const t = makeTorrent(1, 10, '/data/a', [['keep.mkv', 100, true]]);
		t.fileStats = [];
		const r = pickReviewMedia([t], MAPPINGS);
		expect(r.deck.map((i) => i.name)).toEqual(['keep.mkv']);
	});
});
