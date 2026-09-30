import type { Torrent } from './types';
import { hrInfo, hrRuleHint } from './hr';

// Transmission status enum
export const TR_STATUS = {
	STOPPED: 0,
	CHECK_WAIT: 1,
	CHECK: 2,
	DOWNLOAD_WAIT: 3,
	DOWNLOAD: 4,
	SEED_WAIT: 5,
	SEED: 6
} as const;

export type StatusKey = 'paused' | 'queued' | 'checking' | 'downloading' | 'seeding';

export interface StatusInfo {
	key: StatusKey;
	label: string;
}

export function statusInfo(t: Torrent): StatusInfo {
	if (t.error !== 0) return { key: 'paused', label: 'Error' };
	switch (t.status) {
		case TR_STATUS.STOPPED:
			return { key: 'paused', label: 'Paused' };
		case TR_STATUS.CHECK_WAIT:
		case TR_STATUS.CHECK:
			return { key: 'checking', label: 'Checking' };
		case TR_STATUS.DOWNLOAD_WAIT:
			return { key: 'queued', label: 'Queued' };
		case TR_STATUS.DOWNLOAD:
			return { key: 'downloading', label: 'Downloading' };
		case TR_STATUS.SEED_WAIT:
			return { key: 'queued', label: 'Queued' };
		case TR_STATUS.SEED:
			return { key: 'seeding', label: 'Seeding' };
		default:
			return { key: 'paused', label: 'Unknown' };
	}
}

/** Coarse group used by the list filter chips (a torrent can match several). */
export type FilterKey = 'all' | 'hr' | 'downloading' | 'seeding' | 'paused' | 'complete';

export function matchesFilter(
	t: Torrent,
	filter: FilterKey,
	/** Torrent ids manually removed from the HR group. */
	hrExcluded: number[] = []
): boolean {
	switch (filter) {
		case 'all':
			return true;
		case 'hr':
			return hrInfo(t, hrExcluded.includes(t.id)).inGroup;
		case 'downloading':
			return statusInfo(t).key === 'downloading' || statusInfo(t).key === 'queued';
		case 'seeding':
			return statusInfo(t).key === 'seeding';
		case 'paused':
			return statusInfo(t).key === 'paused';
		case 'complete':
			return t.percentDone >= 1;
	}
}

// "Archive-ready": download complete and the HR seed obligation is satisfied —
// seeded long enough for the size tier, or manually excluded — i.e. a candidate
// for clean → move-to-HDD → remove. HR graduation is the readiness signal.
export function isArchiveReady(t: Torrent, hrExcluded: boolean): boolean {
	return t.percentDone >= 1 && !hrInfo(t, hrExcluded).inGroup;
}

export function archiveReadyHint(): string {
	return `Complete and HR seed requirement met (or manually excluded) — ready to clean, move to HDD, and remove. ${hrRuleHint()}`;
}
