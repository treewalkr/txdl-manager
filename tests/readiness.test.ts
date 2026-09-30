import { describe, expect, it } from 'bun:test';
import { isArchiveReady } from '../src/lib/status';
import type { Torrent } from '../src/lib/types';

const GiB = 1024 ** 3;
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

describe('isArchiveReady (HR graduation is the readiness signal)', () => {
	it('is not ready while still owing HR hours, whatever the ratio', () => {
		const t = makeTorrent({
			sizeWhenDone: 6 * GiB, // > 5 GiB → 48 h tier
			secondsSeeding: 20 * HOUR,
			uploadRatio: 5 // the retired ratio rule must not grant readiness
		});
		expect(isArchiveReady(t, false)).toBe(false);
	});

	it('is ready at the exact tier threshold', () => {
		const t = makeTorrent({ sizeWhenDone: 1 * GiB, secondsSeeding: 12 * HOUR });
		expect(isArchiveReady(t, false)).toBe(true);
	});

	it('is ready when manually excluded even while under-seeded', () => {
		const t = makeTorrent({ sizeWhenDone: 6 * GiB, secondsSeeding: 0 });
		expect(isArchiveReady(t, true)).toBe(true);
	});

	it('is not ready while incomplete, however long it has seeded', () => {
		const t = makeTorrent({
			percentDone: 0.5,
			sizeWhenDone: 1 * GiB,
			secondsSeeding: 48 * HOUR,
			uploadRatio: 9
		});
		expect(isArchiveReady(t, false)).toBe(false);
		expect(isArchiveReady(t, true)).toBe(false);
	});
});
