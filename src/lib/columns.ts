export type ColumnKey =
	| 'name'
	| 'status'
	| 'progress'
	| 'size'
	| 'rateDown'
	| 'rateUp'
	| 'ratio'
	| 'seeded';

/** Sort criteria a column header can activate; 'activity' is the default
 * arrangement and has no header. */
export type ColumnSortKey = 'name' | 'progress' | 'size' | 'ratio' | 'seed';

export interface ColumnDef {
	key: ColumnKey;
	/** Header text; the rate columns keep their compact ↓/↑ glyphs. */
	label: string;
	/** Friendlier wording for the column picker ("Down speed" vs "↓"). */
	menuLabel: string;
	/** Extra classes for the <th> ('num' right-aligns). */
	headerClass: 'num' | null;
	/** Preferred width in px under table-layout: fixed, padding included. */
	width: number;
	/** false only for Name, which is the table's identity column. */
	hideable: boolean;
	/** Present when clicking the header sorts by this column. */
	sortKey?: ColumnSortKey;
}

export const NAME_WIDTH_MIN = 200;
export const NAME_WIDTH_MAX = 800;
export const DEFAULT_NAME_WIDTH = 340;

/** The trailing pause/remove column is not user-configurable. */
export const ACTIONS_WIDTH = 92;

export const COLUMNS: ColumnDef[] = [
	{
		key: 'name',
		label: 'Name',
		menuLabel: 'Name',
		headerClass: null,
		width: DEFAULT_NAME_WIDTH,
		hideable: false,
		sortKey: 'name'
	},
	{
		key: 'status',
		label: 'Status',
		menuLabel: 'Status',
		headerClass: null,
		width: 100,
		hideable: true
	},
	{
		key: 'progress',
		label: 'Progress',
		menuLabel: 'Progress',
		headerClass: null,
		width: 190,
		hideable: true,
		sortKey: 'progress'
	},
	{
		key: 'size',
		label: 'Size',
		menuLabel: 'Size',
		headerClass: 'num',
		width: 84,
		hideable: true,
		sortKey: 'size'
	},
	{
		key: 'rateDown',
		label: '↓',
		menuLabel: 'Down speed',
		headerClass: 'num',
		width: 92,
		hideable: true
	},
	{
		key: 'rateUp',
		label: '↑',
		menuLabel: 'Up speed',
		headerClass: 'num',
		width: 92,
		hideable: true
	},
	{
		key: 'ratio',
		label: 'Ratio',
		menuLabel: 'Ratio',
		headerClass: 'num',
		width: 72,
		hideable: true,
		sortKey: 'ratio'
	},
	{
		key: 'seeded',
		label: 'Seeded',
		menuLabel: 'Seed time',
		headerClass: 'num',
		width: 84,
		hideable: true,
		sortKey: 'seed'
	}
];

export interface ColumnPrefs {
	hidden: ColumnKey[];
	nameWidth: number;
}

export const DEFAULT_PREFS: ColumnPrefs = { hidden: [], nameWidth: DEFAULT_NAME_WIDTH };

/** localStorage key for the list table's column prefs. */
export const PREFS_STORAGE_KEY = 'txdl.columns.v1';

export function clampNameWidth(w: number): number {
	return Math.round(Math.max(NAME_WIDTH_MIN, Math.min(NAME_WIDTH_MAX, w)));
}

const HIDEABLE_KEYS = new Set(COLUMNS.filter((c) => c.hideable).map((c) => c.key));

/** Parse stored prefs; anything malformed, unknown or non-hideable falls
 *  back to the defaults so a bad stored blob can never break the table. */
export function parsePrefs(raw: string | null): ColumnPrefs {
	const fallback = (): ColumnPrefs => ({ hidden: [], nameWidth: DEFAULT_NAME_WIDTH });
	if (!raw) return fallback();
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return fallback();
	}
	if (typeof v !== 'object' || v === null) return fallback();
	const o = v as Record<string, unknown>;
	const hidden = Array.isArray(o.hidden)
		? o.hidden.filter((k): k is ColumnKey => typeof k === 'string' && HIDEABLE_KEYS.has(k as ColumnKey))
		: [];
	const nameWidth =
		typeof o.nameWidth === 'number' && Number.isFinite(o.nameWidth)
			? clampNameWidth(o.nameWidth)
			: DEFAULT_NAME_WIDTH;
	return { hidden, nameWidth };
}

export function serializePrefs(prefs: ColumnPrefs): string {
	return JSON.stringify({ hidden: prefs.hidden, nameWidth: clampNameWidth(prefs.nameWidth) });
}

/** Everything except the always-first Name column, in render order. */
export function visibleDataColumns(prefs: ColumnPrefs): ColumnDef[] {
	const hidden = new Set(prefs.hidden);
	return COLUMNS.filter((c) => c.hideable && !hidden.has(c.key));
}

/** Horizontal-scroll floor for the table: every visible column at its
 *  preferred width. Hiding columns actually shrinks it. */
export function tableMinWidth(prefs: ColumnPrefs): number {
	let sum = clampNameWidth(prefs.nameWidth) + ACTIONS_WIDTH;
	for (const c of visibleDataColumns(prefs)) sum += c.width;
	return sum;
}
