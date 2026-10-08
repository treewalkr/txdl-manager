// Shared (client-side) review-decision state. Transmission owns the
// authoritative remove state (wanted:false); these prefs only track what the
// review flow itself decided locally.

import type { ReviewItem } from './types';

export const REVIEW_PREFS_KEY = 'txdl.review.v1';

export interface ReviewPrefs {
	/** Files swiped/kept — excluded from the deck until "start over". */
	kept: string[];
	/** Files deleted by Clear — masked out of the rejected list because
	 *  Transmission keeps listing them after the disk delete. */
	cleared: string[];
}

/** Stable identity of one reviewable file across sessions and reloads. */
export function reviewKey(item: ReviewItem): string {
	return `${item.hashString}:${item.index}`;
}

/** Parse stored prefs, tolerating anything corrupt (grouping-prefs pattern). */
export function parseReviewPrefs(raw: string | null | undefined): ReviewPrefs {
	try {
		const p = JSON.parse(raw ?? '{}') as { kept?: unknown; cleared?: unknown };
		const clean = (v: unknown): string[] =>
			Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
		return { kept: clean(p.kept), cleared: clean(p.cleared) };
	} catch {
		return { kept: [], cleared: [] };
	}
}

export function readReviewPrefs(): ReviewPrefs {
	return parseReviewPrefs(localStorage.getItem(REVIEW_PREFS_KEY));
}

export function writeReviewPrefs(prefs: ReviewPrefs): void {
	try {
		localStorage.setItem(REVIEW_PREFS_KEY, JSON.stringify(prefs));
	} catch {
		/* private mode etc. — deciding fresh next time is fine */
	}
}
