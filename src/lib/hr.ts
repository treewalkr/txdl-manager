import type { Torrent } from './types';

// Hit & Run (HR) group: a size-based seed-time obligation. A torrent stays in
// the HR group until it has seeded long enough for its size, unless you
// removed it manually. Membership is derived — never stored per torrent — so
// torrents graduate out of HR automatically as secondsSeeding accrues.
const HOUR = 3600;
const GiB = 1024 ** 3; // matches fmtBytes' units, so badge text and bucket agree

export const HR_BUCKETS: readonly { maxBytes: number; seedSeconds: number }[] = [
	{ maxBytes: 1 * GiB, seedSeconds: 12 * HOUR },
	{ maxBytes: 5 * GiB, seedSeconds: 24 * HOUR },
	{ maxBytes: Number.POSITIVE_INFINITY, seedSeconds: 48 * HOUR }
];

export function requiredSeedSeconds(sizeBytes: number): number {
	const size = Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
	for (const b of HR_BUCKETS) {
		if (size <= b.maxBytes) return b.seedSeconds;
	}
	return HR_BUCKETS[HR_BUCKETS.length - 1].seedSeconds;
}

export interface HrInfo {
	/** Seconds the torrent must seed for its size bucket. */
	required: number;
	/** Seconds seeded so far (Transmission's secondsSeeding). */
	seeded: number;
	/** Seconds still owed (0 once met). */
	remaining: number;
	/** Seed requirement satisfied. */
	met: boolean;
	/** Manually removed from the HR group (persists until restored). */
	excluded: boolean;
	/** Currently shows in the HR group. */
	inGroup: boolean;
}

export function hrInfo(
	t: Pick<Torrent, 'sizeWhenDone' | 'secondsSeeding'>,
	excluded: boolean
): HrInfo {
	const required = requiredSeedSeconds(t.sizeWhenDone);
	const seeded = Math.max(0, t.secondsSeeding || 0);
	const met = seeded >= required;
	return {
		required,
		seeded,
		remaining: Math.max(0, required - seeded),
		met,
		excluded,
		inGroup: !met && !excluded
	};
}

export function hrRuleHint(): string {
	return 'Hit & Run rule: seed ≤ 1 GiB for 12 h · ≤ 5 GiB for 24 h · > 5 GiB for 48 h.';
}
