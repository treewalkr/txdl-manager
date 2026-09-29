import { describe, expect, it } from 'bun:test';
import { applySelection } from '../src/lib/selection';

const ORDER = [10, 20, 30, 40, 50];

describe('applySelection', () => {
	it('plain click selects only the clicked id and moves the anchor', () => {
		const r = applySelection(new Set([10, 30]), 40, {}, ORDER, 10);
		expect([...r.selection]).toEqual([40]);
		expect(r.anchor).toBe(40);
	});

	it('meta-click toggles the clicked id and keeps the rest', () => {
		const r = applySelection(new Set([10, 30]), 30, { meta: true }, ORDER, 10);
		expect([...r.selection]).toEqual([10]);

		const r2 = applySelection(new Set([10, 30]), 40, { meta: true }, ORDER, 10);
		expect([...r2.selection]).toEqual([10, 30, 40]);
		expect(r2.anchor).toBe(40);
	});

	it('shift-click selects the range from the anchor, in either direction', () => {
		const r = applySelection(new Set([10]), 40, { shift: true }, ORDER, 20);
		expect([...r.selection]).toEqual([20, 30, 40]);

		const r2 = applySelection(new Set([50]), 20, { shift: true }, ORDER, 40);
		expect([...r2.selection]).toEqual([20, 30, 40]);
		// the anchor survives so repeated shift-clicks keep extending from it
		expect(r2.anchor).toBe(40);
	});

	it('shift-click without a usable anchor selects just the clicked id', () => {
		const r = applySelection(new Set([10]), 40, { shift: true }, ORDER, null);
		expect([...r.selection]).toEqual([40]);
		expect(r.anchor).toBe(40);

		// anchor not visible in the current order (e.g. the filter changed)
		const r2 = applySelection(new Set([10]), 40, { shift: true }, ORDER, 99);
		expect([...r2.selection]).toEqual([40]);
	});

	it('meta+shift adds the range to the existing selection instead of replacing it', () => {
		const r = applySelection(new Set([10]), 40, { shift: true, meta: true }, ORDER, 30);
		expect([...r.selection]).toEqual([10, 30, 40]);
	});

	it('falls back gracefully for ids outside the visible order', () => {
		const r = applySelection(new Set([10]), 99, { shift: true }, ORDER, 30);
		expect([...r.selection]).toEqual([10, 99]);
	});
});
