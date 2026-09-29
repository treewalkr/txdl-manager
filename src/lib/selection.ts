export interface SelectionModifiers {
	/** Cmd (macOS) or Ctrl (Windows/Linux) held. */
	meta?: boolean;
	shift?: boolean;
}

export interface SelectionUpdate {
	selection: Set<number>;
	anchor: number;
}

/**
 * Finder/Explorer-style list selection:
 * - plain click — select only the clicked id
 * - Cmd/Ctrl+click — toggle the clicked id, keep the rest
 * - Shift+click — replace the selection with the range from the anchor to the
 *   clicked id, in the current visible order (Cmd/Ctrl+Shift adds the range)
 *
 * The anchor is the id the last plain/meta click landed on; repeated shift
 * clicks keep extending from it, exactly like an OS file list.
 */
export function applySelection(
	current: Iterable<number>,
	clicked: number,
	mods: SelectionModifiers,
	orderedIds: readonly number[],
	anchor: number | null
): SelectionUpdate {
	const next = new Set(current);
	if (mods.shift) {
		const hasAnchor = anchor !== null && orderedIds.includes(anchor);
		const from = hasAnchor ? (anchor as number) : clicked;
		const i = orderedIds.indexOf(from);
		const j = orderedIds.indexOf(clicked);
		if (i === -1 || j === -1) {
			next.add(clicked);
			return { selection: next, anchor: clicked };
		}
		const [lo, hi] = i <= j ? [i, j] : [j, i];
		if (!mods.meta) next.clear();
		for (let k = lo; k <= hi; k++) next.add(orderedIds[k]);
		// with no usable anchor (first click, or it left the current filter),
		// the clicked id becomes the anchor so the next shift-click extends
		return { selection: next, anchor: hasAnchor ? (anchor as number) : clicked };
	}
	if (mods.meta) {
		if (next.has(clicked)) next.delete(clicked);
		else next.add(clicked);
		return { selection: next, anchor: clicked };
	}
	next.clear();
	next.add(clicked);
	return { selection: next, anchor: clicked };
}
