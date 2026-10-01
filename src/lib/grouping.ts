import type { Torrent } from './types';

/** Grouping modes for the torrent table; 'none' is the flat list. */
export type GroupBy = 'none' | 'location';

export interface TorrentGroup {
	/** The group's identity — the download dir for 'location'. */
	key: string;
	rows: Torrent[];
}

/** Group already-sorted rows by download dir in first-appearance order, so
 *  the sections follow whatever sort is currently active. */
export function groupTorrents(rows: Torrent[]): TorrentGroup[] {
	const byDir = new Map<string, Torrent[]>();
	for (const t of rows) {
		const list = byDir.get(t.downloadDir);
		if (list) list.push(t);
		else byDir.set(t.downloadDir, [t]);
	}
	return [...byDir].map(([key, groupRows]) => ({ key, rows: groupRows }));
}

export interface GroupingPrefs {
	groupBy: GroupBy;
	/** Download dirs the user collapsed; kept even while grouping is off. */
	collapsed: string[];
}

export const DEFAULT_GROUPING: GroupingPrefs = { groupBy: 'none', collapsed: [] };

/** localStorage key for the list table's grouping prefs. */
export const GROUPING_STORAGE_KEY = 'txdl.grouping.v1';

const GROUP_MODES = new Set<string>(['none', 'location']);

/** Parse stored grouping prefs; anything malformed falls back to the
 *  defaults so a bad stored blob can never break the table. */
export function parseGroupingPrefs(raw: string | null): GroupingPrefs {
	const fallback = (): GroupingPrefs => ({ groupBy: 'none', collapsed: [] });
	if (!raw) return fallback();
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return fallback();
	}
	if (typeof v !== 'object' || v === null) return fallback();
	const o = v as Record<string, unknown>;
	const groupBy =
		typeof o.groupBy === 'string' && GROUP_MODES.has(o.groupBy) ? (o.groupBy as GroupBy) : 'none';
	const collapsed = Array.isArray(o.collapsed)
		? o.collapsed.filter((k): k is string => typeof k === 'string')
		: [];
	return { groupBy, collapsed };
}

export function serializeGroupingPrefs(prefs: GroupingPrefs): string {
	return JSON.stringify({ groupBy: prefs.groupBy, collapsed: [...prefs.collapsed] });
}
