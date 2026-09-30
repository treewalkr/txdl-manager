// PROTOTYPE — throwaway (see the `prototype` skill, UI branch).
// Four visual-world variants of the torrent list, gated by ?variant= on the
// existing "/" route, switchable via the floating bar. The winning world gets
// folded into the real design (impeccable new-work) and the rest lands on a
// throwaway branch; nothing here ships.
//
// This module owns the shared static dataset so every variant renders the
// exact same torrents through the real hrInfo/statusInfo/fmt* helpers — the
// comparison is between worlds, not data.

import type { Torrent } from '$lib/types';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

function row(
	p: Partial<Torrent> & Pick<Torrent, 'id' | 'name' | 'status' | 'sizeWhenDone' | 'percentDone' | 'secondsSeeding' | 'uploadRatio'>
): Torrent {
	return {
		hashString: '',
		error: 0,
		errorString: '',
		metadataPercentComplete: 1,
		rateDownload: 0,
		rateUpload: 0,
		eta: 0,
		leftUntilDone: 0,
		totalSize: p.sizeWhenDone ?? 0,
		uploadedEver: 0,
		secondsDownloading: 0,
		isStalled: false,
		downloadDir: '/Volumes/One Touch/Downloads',
		labels: [],
		seedRatioMode: 0,
		seedRatioLimit: 2,
		dateAdded: 0,
		dateDone: 0,
		activityDate: 0,
		peersConnected: 0,
		peersSendingToUs: 0,
		peersGettingFromUs: 0,
		queuePosition: p.id,
		...p
	};
}

// Statuses: 0 stopped · 3 download-wait · 4 downloading · 6 seeding.
// Tiers: ≤1 GiB owes 12 h · ≤5 GiB owes 24 h · >5 GiB owes 48 h.
export const MOCK_TORRENTS: Torrent[] = [
	row({
		id: 1,
		name: 'Akira.Yamaoka.-.Silent.Hill.OST.1999.FLAC',
		status: 6,
		sizeWhenDone: 812 * MiB,
		percentDone: 1,
		secondsSeeding: 9 * 3600 + 7 * 60, // 9.1/12 h — 2.9 h still owed
		uploadRatio: 1.84,
		rateUpload: 245_760
	}),
	row({
		id: 2,
		name: 'Ghost.In.The.Shell.1995.2160p.UHD.BluRay.x265.HDR-CIENE',
		status: 6,
		sizeWhenDone: 24.6 * GiB,
		percentDone: 1,
		secondsSeeding: 11 * 3600 + 5 * 60, // 11.1/48 h — deep in the hole
		uploadRatio: 0.62,
		rateUpload: 3_252_000
	}),
	row({
		id: 3,
		name: 'Studio.Ghibli.Collection.1984-2014.BluRay.Remux.COMPLETE',
		status: 6,
		sizeWhenDone: 412 * GiB,
		percentDone: 1,
		secondsSeeding: 51 * 3600 + 18 * 60, // graduated — archive-ready
		uploadRatio: 3.12
	}),
	row({
		id: 4,
		name: 'Autechre.-.Tri.Repetae.1995.2020.Remaster.24-96.FLAC',
		status: 6,
		sizeWhenDone: 2.1 * GiB,
		percentDone: 1,
		secondsSeeding: 23 * 3600 + 41 * 60, // 23.7/24 h — 19 min from graduating
		uploadRatio: 1.92,
		rateUpload: 892_000
	}),
	row({
		id: 5,
		name: 'Blade.Runner.2049.2017.1080p.BluRay.x264.DTS-HD.MA-GROUP',
		status: 4,
		sizeWhenDone: 18.3 * GiB,
		percentDone: 0.432,
		secondsSeeding: 0,
		eta: 41 * 60,
		rateDownload: 11_744_000,
		rateUpload: 480_000,
		uploadRatio: 0.07,
		peersConnected: 14,
		peersSendingToUs: 9
	}),
	row({
		id: 6,
		name: 'Ninja.Scroll.1993.1080p.BluRay.Remux-CULT',
		status: 0, // paused with hours still owed
		sizeWhenDone: 6.4 * GiB,
		percentDone: 1,
		secondsSeeding: 3 * 3600 + 6 * 60,
		uploadRatio: 0.41
	}),
	row({
		id: 7,
		name: 'Ryuichi.Sakamoto.-.async.2017.24-96.FLAC',
		status: 6,
		sizeWhenDone: 1.3 * GiB,
		percentDone: 1,
		secondsSeeding: 24 * 3600 + 12 * 60, // graduated — archive-ready
		uploadRatio: 2.35
	}),
	row({
		id: 8,
		name: 'Serial.Experiments.Lain.1998.BluRay.Remux.MULTI-OG',
		status: 3, // queued behind the active download
		sizeWhenDone: 96 * GiB,
		percentDone: 0,
		secondsSeeding: 0,
		uploadRatio: 0
	})
];

/** The row pre-selected in every variant, so each world's selection
 * language is visible without interacting. */
export const MOCK_SELECTED_ID = 2;

export const MOCK_SESSION = {
	version: '4.0.6',
	online: true,
	archiveVolume: 'One Touch',
	archivePath: '/Volumes/One Touch/Archive'
};
