import { describe, expect, it } from 'bun:test';
import { hrInfo, requiredSeedSeconds } from '../src/lib/hr';
import { matchesFilter } from '../src/lib/status';
import type { Torrent } from '../src/lib/types';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const HOUR = 3600;

function makeTorrent(overrides: Partial<Torrent> = {}): Torrent {
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
		downloadDir: '/x',
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
		...overrides
	};
}

describe('requiredSeedSeconds', () => {
	it('buckets by size with inclusive upper bounds', () => {
		expect(requiredSeedSeconds(0)).toBe(12 * HOUR);
		expect(requiredSeedSeconds(620 * MiB)).toBe(12 * HOUR);
		expect(requiredSeedSeconds(1 * GiB)).toBe(12 * HOUR);
		expect(requiredSeedSeconds(1 * GiB + 1)).toBe(24 * HOUR);
		expect(requiredSeedSeconds(2.4 * GiB)).toBe(24 * HOUR);
		expect(requiredSeedSeconds(5 * GiB)).toBe(24 * HOUR);
		expect(requiredSeedSeconds(5 * GiB + 1)).toBe(48 * HOUR);
		expect(requiredSeedSeconds(500 * GiB)).toBe(48 * HOUR);
	});

	it('falls back to the smallest bucket for junk sizes', () => {
		expect(requiredSeedSeconds(-1)).toBe(12 * HOUR);
		expect(requiredSeedSeconds(Number.NaN)).toBe(12 * HOUR);
		expect(requiredSeedSeconds(Number.POSITIVE_INFINITY)).toBe(12 * HOUR);
	});
});

describe('hrInfo', () => {
	it('puts an owing torrent in the group with correct remaining time', () => {
		const info = hrInfo({ sizeWhenDone: 2 * GiB, secondsSeeding: HOUR }, false);
		expect(info.required).toBe(24 * HOUR);
		expect(info.seeded).toBe(HOUR);
		expect(info.remaining).toBe(23 * HOUR);
		expect(info.met).toBe(false);
		expect(info.inGroup).toBe(true);
		expect(info.excluded).toBe(false);
	});

	it('graduates a torrent once the requirement is met exactly', () => {
		const info = hrInfo({ sizeWhenDone: 1 * GiB, secondsSeeding: 12 * HOUR }, false);
		expect(info.met).toBe(true);
		expect(info.remaining).toBe(0);
		expect(info.inGroup).toBe(false);
	});

	it('keeps a manually removed torrent out even while it owes', () => {
		const info = hrInfo({ sizeWhenDone: 620 * MiB, secondsSeeding: 0 }, true);
		expect(info.met).toBe(false);
		expect(info.excluded).toBe(true);
		expect(info.inGroup).toBe(false);
	});

	it('reports met for an excluded torrent that has seeded enough', () => {
		const info = hrInfo({ sizeWhenDone: 620 * MiB, secondsSeeding: 13 * HOUR }, true);
		expect(info.met).toBe(true);
		expect(info.inGroup).toBe(false);
	});

	it('clamps negative seed time to zero', () => {
		const info = hrInfo({ sizeWhenDone: 1 * GiB, secondsSeeding: -100 }, false);
		expect(info.seeded).toBe(0);
		expect(info.remaining).toBe(12 * HOUR);
		expect(info.inGroup).toBe(true);
	});

	it('treats an unresolved magnet (size 0) as owing the smallest bucket', () => {
		const info = hrInfo({ sizeWhenDone: 0, secondsSeeding: 0 }, false);
		expect(info.required).toBe(12 * HOUR);
		expect(info.inGroup).toBe(true);
	});
});

describe("matchesFilter 'hr'", () => {
	it('matches owing torrents, including ones still downloading', () => {
		const t = makeTorrent({
			id: 9,
			status: 4,
			percentDone: 0.62,
			sizeWhenDone: 620 * MiB,
			secondsSeeding: 0
		});
		expect(matchesFilter(t, 'hr')).toBe(true);
	});

	it('does not match a torrent removed from the group', () => {
		const t = makeTorrent({ id: 9, sizeWhenDone: 620 * MiB, secondsSeeding: 0 });
		expect(matchesFilter(t, 'hr', [9])).toBe(false);
		expect(matchesFilter(t, 'hr', [8])).toBe(true);
	});

	it('does not match a torrent whose requirement is met', () => {
		const t = makeTorrent({ id: 9, sizeWhenDone: 620 * MiB, secondsSeeding: 12 * HOUR });
		expect(matchesFilter(t, 'hr')).toBe(false);
		expect(matchesFilter(t, 'hr', [9])).toBe(false);
	});

	it('leaves the other filters working', () => {
		const t = makeTorrent({ id: 9, sizeWhenDone: 620 * MiB, secondsSeeding: 0 });
		expect(matchesFilter(t, 'all')).toBe(true);
		expect(matchesFilter(t, 'complete')).toBe(true);
		expect(matchesFilter(t, 'paused')).toBe(true);
	});
});
