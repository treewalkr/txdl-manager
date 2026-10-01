import { describe, expect, it } from 'bun:test';
import {
	DEFAULT_GROUPING,
	groupTorrents,
	parseGroupingPrefs,
	serializeGroupingPrefs
} from '../src/lib/grouping';
import type { Torrent } from '../src/lib/types';

const torrent = (id: number, downloadDir: string): Torrent =>
	({ id, downloadDir }) as unknown as Torrent;

describe('parseGroupingPrefs', () => {
	it('returns defaults for null, empty and malformed input', () => {
		for (const raw of [null, '', 'not json', '[1,2]', '42', '{"groupBy":"stars"}']) {
			expect(parseGroupingPrefs(raw)).toEqual(DEFAULT_GROUPING);
		}
	});

	it('keeps valid prefs, drops non-string collapsed keys and unknown modes', () => {
		const p = parseGroupingPrefs(
			'{"groupBy":"location","collapsed":["/a","/b",7,"/c",null]}'
		);
		expect(p.groupBy).toBe('location');
		expect(p.collapsed).toEqual(['/a', '/b', '/c']);
		expect(parseGroupingPrefs('{"groupBy":"location"}').groupBy).toBe('location');
		expect(parseGroupingPrefs('{"collapsed":["/a"]}').groupBy).toBe('none');
	});

	it('round-trips through serializeGroupingPrefs', () => {
		const p = parseGroupingPrefs('{"groupBy":"location","collapsed":["/a","/b"]}');
		expect(parseGroupingPrefs(serializeGroupingPrefs(p))).toEqual(p);
	});

	it('returns fresh arrays so callers cannot mutate the defaults', () => {
		const p = parseGroupingPrefs(null);
		p.collapsed.push('/a');
		expect(DEFAULT_GROUPING.collapsed).toEqual([]);
	});
});

describe('groupTorrents', () => {
	it('groups by download dir in first-appearance order', () => {
		const groups = groupTorrents([
			torrent(1, '/hdd'),
			torrent(2, '/ssd'),
			torrent(3, '/hdd'),
			torrent(4, '/ssd'),
			torrent(5, '/hdd')
		]);
		expect(groups.map((g) => g.key)).toEqual(['/hdd', '/ssd']);
		expect(groups[0].rows.map((t) => t.id)).toEqual([1, 3, 5]);
		expect(groups[1].rows.map((t) => t.id)).toEqual([2, 4]);
	});

	it('yields one group per torrent when every dir differs', () => {
		const groups = groupTorrents([torrent(1, '/a'), torrent(2, '/b')]);
		expect(groups.map((g) => g.rows.length)).toEqual([1, 1]);
	});

	it('returns an empty list for no rows', () => {
		expect(groupTorrents([])).toEqual([]);
	});
});
