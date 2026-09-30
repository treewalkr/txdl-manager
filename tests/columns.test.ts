import { describe, expect, it } from 'bun:test';
import {
	ACTIONS_WIDTH,
	COLUMNS,
	DEFAULT_NAME_WIDTH,
	DEFAULT_PREFS,
	NAME_WIDTH_MAX,
	NAME_WIDTH_MIN,
	parsePrefs,
	serializePrefs,
	tableMinWidth,
	visibleDataColumns,
	type ColumnKey
} from '../src/lib/columns';

const widthOf = (key: ColumnKey) => COLUMNS.find((c) => c.key === key)!.width;
const sumDataWidths = () => COLUMNS.filter((c) => c.hideable).reduce((s, c) => s + c.width, 0);

describe('parsePrefs', () => {
	it('returns defaults for null, empty and malformed input', () => {
		for (const raw of [null, '', 'not json', '[1,2]', '42', '{"hidden":"size"}']) {
			expect(parsePrefs(raw)).toEqual(DEFAULT_PREFS);
		}
	});

	it('keeps valid prefs, drops unknown keys and never hides Name', () => {
		const p = parsePrefs('{"hidden":["size","ratio","bogus","name"],"nameWidth":500}');
		expect(p.hidden).toEqual(['size', 'ratio']);
		expect(p.nameWidth).toBe(500);
	});

	it('clamps the stored name width into the allowed range', () => {
		expect(parsePrefs('{"hidden":[],"nameWidth":10}').nameWidth).toBe(NAME_WIDTH_MIN);
		expect(parsePrefs('{"hidden":[],"nameWidth":99999}').nameWidth).toBe(NAME_WIDTH_MAX);
		expect(parsePrefs('{"hidden":[],"nameWidth":"wide"}').nameWidth).toBe(DEFAULT_NAME_WIDTH);
	});

	it('round-trips through serializePrefs', () => {
		const p = parsePrefs('{"hidden":["seeded","rateUp"],"nameWidth":478}');
		expect(parsePrefs(serializePrefs(p))).toEqual(p);
	});

	it('returns a fresh hidden array so callers cannot mutate the defaults', () => {
		const p = parsePrefs(null);
		p.hidden.push('size');
		expect(DEFAULT_PREFS.hidden).toEqual([]);
	});
});

describe('visibleDataColumns', () => {
	it('keeps render order and filters hidden columns', () => {
		const keys = visibleDataColumns({ hidden: ['progress', 'ratio'], nameWidth: 400 }).map((c) => c.key);
		expect(keys).toEqual(['status', 'size', 'rateDown', 'rateUp', 'seeded']);
	});

	it('never includes the always-shown Name column', () => {
		const keys = visibleDataColumns({ hidden: [], nameWidth: 400 }).map((c) => c.key);
		expect(keys).not.toContain('name');
	});
});

describe('tableMinWidth', () => {
	it('sums name width, visible data widths and the actions column', () => {
		expect(tableMinWidth({ hidden: [], nameWidth: 400 })).toBe(400 + ACTIONS_WIDTH + sumDataWidths());
	});

	it('shrinks when columns are hidden', () => {
		const all = tableMinWidth({ hidden: [], nameWidth: 400 });
		expect(tableMinWidth({ hidden: ['status', 'progress'], nameWidth: 400 })).toBe(
			all - widthOf('status') - widthOf('progress')
		);
	});

	it('clamps an out-of-range name width before summing', () => {
		expect(tableMinWidth({ hidden: [], nameWidth: 5 })).toBe(
			NAME_WIDTH_MIN + ACTIONS_WIDTH + sumDataWidths()
		);
	});
});
