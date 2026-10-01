<script lang="ts">
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { fmtBytes, fmtDuration, fmtEta, fmtHours, fmtPercent, fmtRatio, fmtSpeed } from '$lib/format';
	import { hrInfo, hrRuleHint } from '$lib/hr';
	import { isVideoFile } from '$lib/media';
	import { applySelection } from '$lib/selection';
	import {
		ACTIONS_WIDTH,
		COLUMNS,
		DEFAULT_NAME_WIDTH,
		DEFAULT_PREFS,
		NAME_WIDTH_MAX,
		NAME_WIDTH_MIN,
		PREFS_STORAGE_KEY,
		clampNameWidth,
		parsePrefs,
		serializePrefs,
		tableMinWidth,
		visibleDataColumns,
		type ColumnDef,
		type ColumnKey,
		type ColumnPrefs
	} from '$lib/columns';
	import {
		DEFAULT_GROUPING,
		GROUPING_STORAGE_KEY,
		groupTorrents,
		parseGroupingPrefs,
		serializeGroupingPrefs,
		type GroupingPrefs,
		type TorrentGroup
	} from '$lib/grouping';
	import {
		archiveReadyHint,
		isArchiveReady,
		matchesFilter,
		statusInfo,
		type FilterKey
	} from '$lib/status';
	import { store } from '$lib/stores/torrents.svelte';
	import type { Torrent } from '$lib/types';

	// Row-level "watch this": the 2s list poll has no file data, so lazily fetch
	// the detail once and play its largest fully-downloaded video file.
	async function quickPlay(t: Torrent) {
		try {
			const res = await fetch(`/api/torrents/${t.id}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const { torrent } = (await res.json()) as { torrent: Torrent };
			const files = torrent.files ?? [];
			const stats = torrent.fileStats ?? [];
			let best = -1;
			for (let i = 0; i < files.length; i++) {
				if (!isVideoFile(files[i].name)) continue;
				const done = stats[i]?.bytesCompleted ?? files[i].bytesCompleted;
				if (done < files[i].length) continue;
				if (best < 0 || files[i].length > files[best].length) best = i;
			}
			if (best < 0) {
				store.setFlash(`No completed video file in "${t.name}"`);
				return;
			}
			await goto(`/torrent/${t.id}/play?file=${best}`);
		} catch {
			store.setFlash('Could not load the file list for playback.');
		}
	}

	let filter = $state<FilterKey>('all');
	let query = $state('');
	let sortKey = $state('activity');
	let sortDir = $state(-1);

	// column show/hide + Name width; the table is client-rendered only, so
	// reading localStorage at init cannot fight SSR hydration
	let prefs = $state<ColumnPrefs>(
		browser ? parsePrefs(localStorage.getItem(PREFS_STORAGE_KEY)) : DEFAULT_PREFS
	);

	$effect(() => {
		if (browser) localStorage.setItem(PREFS_STORAGE_KEY, serializePrefs(prefs));
	});

	// grouping is a view mode like columns: same client-only localStorage deal
	const initialGrouping = browser
		? parseGroupingPrefs(localStorage.getItem(GROUPING_STORAGE_KEY))
		: DEFAULT_GROUPING;
	let grouping = $state<GroupingPrefs>(initialGrouping);
	// collapse state lives in the set; `grouping` keeps only the mode
	const collapsedDirs = new SvelteSet<string>(initialGrouping.collapsed);

	$effect(() => {
		if (browser)
			localStorage.setItem(
				GROUPING_STORAGE_KEY,
				serializeGroupingPrefs({ groupBy: grouping.groupBy, collapsed: [...collapsedDirs] })
			);
	});

	const dataCols = $derived(visibleDataColumns(prefs));

	/** Name is the always-first identity column; its def drives its header. */
	const NAME_COL = COLUMNS[0];

	function sortBy(col: ColumnDef) {
		if (!col.sortKey) return;
		if (sortKey === col.sortKey) sortDir = -sortDir;
		else {
			sortKey = col.sortKey;
			sortDir = col.sortKey === 'name' ? 1 : -1;
		}
	}

	function ariaSortOf(col: ColumnDef): 'ascending' | 'descending' | 'none' {
		if (!col.sortKey || sortKey !== col.sortKey) return 'none';
		return sortDir === 1 ? 'ascending' : 'descending';
	}

	let addOpen = $state(false);
	let addUrl = $state('');
	let addBusy = $state(false);

	let removeTarget = $state<Torrent | null>(null);
	let removeDeleteData = $state(false);
	let removeBusy = $state(false);

	// multi-select (Finder-style) + right-click context menu
	const selection = new SvelteSet<number>();
	let anchorId: number | null = $state(null);
	let ctx = $state<{ ids: number[]; single: Torrent | null; x: number; y: number } | null>(null);

	// bulk move / remove dialogs (targets captured when opened)
	let bulkMoveOpen = $state(false);
	let bulkMoveLocation = $state('');
	let bulkMoveData = $state(true);
	let bulkMoveBusy = $state(false);
	let bulkMoveIds = $state<number[]>([]);
	let bulkRemoveOpen = $state(false);
	let bulkRemoveDeleteData = $state(false);
	let bulkRemoveBusy = $state(false);
	let bulkRemoveIds = $state<number[]>([]);
	let bulkRemoveTotal = $state(0);

	const FILTERS: { key: FilterKey; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'hr', label: 'HR' },
		{ key: 'downloading', label: 'Downloading' },
		{ key: 'seeding', label: 'Seeding' },
		{ key: 'paused', label: 'Paused' },
		{ key: 'complete', label: 'Complete' }
	];

	const hrOf = (t: Torrent) => hrInfo(t, store.hrExcluded.includes(t.id));
	const readyOf = (t: Torrent) => isArchiveReady(t, store.hrExcluded.includes(t.id));

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		let list = store.torrents.filter((t) => matchesFilter(t, filter, store.hrExcluded));
		if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
		const key = sortKey;
		const dir = sortDir;
		return [...list].sort((a, b) => {
			let r = 0;
			switch (key) {
				case 'name':
					r = a.name.localeCompare(b.name);
					break;
				case 'progress':
					r = a.percentDone - b.percentDone;
					break;
				case 'size':
					r = a.sizeWhenDone - b.sizeWhenDone;
					break;
				case 'ratio':
					r = a.uploadRatio - b.uploadRatio;
					break;
				case 'seed':
					r = a.secondsSeeding - b.secondsSeeding;
					break;
				default:
					r = a.activityDate - b.activityDate;
			}
			return r * dir;
		});
	});

	const counts = $derived({
		all: store.torrents.length,
		hr: store.torrents.filter((t) => matchesFilter(t, 'hr', store.hrExcluded)).length,
		downloading: store.torrents.filter((t) => matchesFilter(t, 'downloading')).length,
		seeding: store.torrents.filter((t) => matchesFilter(t, 'seeding')).length,
		paused: store.torrents.filter((t) => matchesFilter(t, 'paused')).length,
		complete: store.torrents.filter((t) => matchesFilter(t, 'complete')).length
	});

	/** Per-location row counts under the filter but without the search
	 *  query, so a narrowed group header can read `matches/total`. */
	const dirTotals = $derived.by(() => {
		const m = new Map<string, number>();
		for (const t of store.torrents) {
			if (!matchesFilter(t, filter, store.hrExcluded)) continue;
			m.set(t.downloadDir, (m.get(t.downloadDir) ?? 0) + 1);
		}
		return m;
	});

	const groups = $derived(grouping.groupBy === 'location' ? groupTorrents(filtered) : null);

	type RenderItem = { kind: 'group'; group: TorrentGroup } | { kind: 'row'; torrent: Torrent };

	/** The flat order actually on screen: section headers with their expanded
	 *  rows, collapsed sections skipped. Selection, arrows and ⌘A operate on
	 *  exactly what is visible — Finder list-view semantics. */
	const renderItems = $derived.by(() => {
		if (!groups) return filtered.map((torrent): RenderItem => ({ kind: 'row', torrent }));
		const items: RenderItem[] = [];
		for (const g of groups) {
			items.push({ kind: 'group', group: g });
			if (!collapsedDirs.has(g.key))
				for (const torrent of g.rows) items.push({ kind: 'row', torrent });
		}
		return items;
	});

	const filteredIds = $derived(renderItems.flatMap((i) => (i.kind === 'row' ? [i.torrent.id] : [])));
	const selectedTotal = $derived(
		store.torrents.reduce((s, t) => s + (selection.has(t.id) ? t.sizeWhenDone : 0), 0)
	);
	const selHr = $derived(hrCounts([...selection]));
	const ctxIds = $derived(ctx?.ids ?? []);
	const ctxSingle = $derived(ctx?.single ?? null);
	const ctxHr = $derived(hrCounts(ctxIds));

	function hrCounts(ids: number[]) {
		let inGroup = 0;
		let excluded = 0;
		for (const id of ids) {
			const t = store.byId(id);
			if (!t) continue;
			const info = hrInfo(t, store.hrExcluded.includes(t.id));
			if (info.inGroup) inGroup++;
			if (info.excluded) excluded++;
		}
		return { inGroup, excluded };
	}

	function toggle(t: Torrent) {
		const key = statusInfo(t).key;
		void store.act(t.id, { action: key === 'paused' ? 'start' : 'stop' });
	}

	async function confirmAdd() {
		if (!addUrl.trim()) return;
		addBusy = true;
		const ok = await store.add(addUrl.trim());
		addBusy = false;
		if (ok) {
			addOpen = false;
			addUrl = '';
		}
	}

	async function confirmRemove() {
		if (!removeTarget) return;
		removeBusy = true;
		const ok = await store.act(removeTarget.id, {
			action: 'remove',
			deleteData: removeDeleteData
		});
		removeBusy = false;
		if (ok) removeTarget = null;
	}

	// ---------- selection + context menu ----------

	// drop ids whose torrents disappeared (removed here or elsewhere)
	$effect(() => {
		const live = new Set(store.torrents.map((t) => t.id));
		for (const id of [...selection]) {
			if (!live.has(id)) selection.delete(id);
		}
	});

	function clearSelection() {
		selection.clear();
		anchorId = null;
	}

	function setAllSelection(ids: number[]) {
		selection.clear();
		for (const id of ids) selection.add(id);
	}

	function rowIdFrom(e: Event): number | null {
		const el = e.target instanceof Element ? e.target.closest('tr[data-torrent-id]') : null;
		const id = el ? Number(el.getAttribute('data-torrent-id')) : Number.NaN;
		return Number.isInteger(id) ? id : null;
	}

	function onWindowClick(e: MouseEvent) {
		ctx = null;
		const el = e.target instanceof Element ? e.target : null;
		if (el?.closest('.ctx-menu, .columns-menu, .cols-btn, .col-resize, .modal, .modal-backdrop, .toast'))
			return;
		if (colsOpen) closeCols();
		// don't fight text selection or interactive controls
		if (window.getSelection()?.toString()) return;
		if (el?.closest('a, button, input, select, textarea, label')) return;
		const id = rowIdFrom(e);
		if (id === null) {
			clearSelection();
			return;
		}
		const upd = applySelection(
			selection,
			id,
			{ meta: e.metaKey || e.ctrlKey, shift: e.shiftKey },
			filteredIds,
			anchorId
		);
		setAllSelection([...upd.selection]);
		anchorId = upd.anchor;
	}

	// ---------- context menu (mouse + keyboard) ----------

	let ctxMenuEl: HTMLElement | undefined = $state();
	let ctxOpener: HTMLElement | null = null;

	function nameLinkOf(id: number): HTMLAnchorElement | null {
		return document.querySelector(`tr[data-torrent-id="${id}"] a.t-name`);
	}

	// the menu takes focus when it opens, whichever way it was opened
	$effect(() => {
		if (ctx && ctxMenuEl) {
			void tick().then(() => ctxMenuEl?.querySelector<HTMLElement>('button.ctx-item')?.focus());
		}
	});

	/** Finder semantics: the menu acts on the whole selection when the
	 * right-clicked row is part of it, otherwise on just that row */
	function openCtx(id: number, x: number, y: number, opener: HTMLElement | null) {
		if (!selection.has(id)) {
			setAllSelection([id]);
			anchorId = id;
		}
		const ids = [...selection];
		ctxOpener = opener;
		ctx = {
			ids,
			single: ids.length === 1 ? (store.byId(ids[0]) ?? null) : null,
			x: Math.max(8, Math.min(x, window.innerWidth - 250)),
			y: Math.max(8, Math.min(y, window.innerHeight - 380))
		};
	}

	function closeCtx() {
		// hand focus back only when a keyboard user was inside the menu
		if (ctxOpener && ctxMenuEl?.contains(document.activeElement)) ctxOpener.focus();
		ctxOpener = null;
		ctx = null;
	}

	/** Finder habit: double-click opens the row's details */
	function onWindowDblclick(e: MouseEvent) {
		const el = e.target instanceof Element ? e.target : null;
		if (el?.closest('a, button, input, select, textarea, label')) return;
		const id = rowIdFrom(e);
		if (id !== null) void openDetail(id);
	}

	function onWindowContext(e: MouseEvent) {
		const id = rowIdFrom(e);
		if (id === null) {
			ctx = null; // right-click elsewhere: dismiss, keep the native menu
			return;
		}
		e.preventDefault();
		openCtx(id, e.clientX, e.clientY, nameLinkOf(id));
	}

	/** Finder-style arrows: move focus along the filtered rows and select */
	function moveRowFocus(fromId: number, delta: 1 | -1, shift: boolean) {
		const next = filteredIds[filteredIds.indexOf(fromId) + delta];
		if (next === undefined) return;
		nameLinkOf(next)?.focus();
		const upd = applySelection(selection, next, { meta: false, shift }, filteredIds, anchorId);
		setAllSelection([...upd.selection]);
		anchorId = upd.anchor;
	}

	function selectAs(id: number, mods: { meta: boolean; shift: boolean }) {
		const upd = applySelection(selection, id, mods, filteredIds, anchorId);
		setAllSelection([...upd.selection]);
		anchorId = upd.anchor;
	}

	// ---------- name column resize ----------

	let resizing = $state(false);
	let resizeStartX = 0;
	let resizeStartWidth = DEFAULT_NAME_WIDTH;

	function onResizePointerDown(e: PointerEvent & { currentTarget: HTMLElement }) {
		// touch drags are allowed too; only reject non-primary mouse buttons
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		// capture keeps the moves coming when the pointer outruns the thin
		// handle; synthetic/unavailable pointers just drag without it
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			/* pointer id not capturable — the listener below still tracks */
		}
		resizeStartX = e.clientX;
		resizeStartWidth = prefs.nameWidth;
		resizing = true;
		document.body.classList.add('col-resizing');
	}

	function onResizePointerMove(e: PointerEvent) {
		if (!resizing) return;
		prefs.nameWidth = clampNameWidth(resizeStartWidth + e.clientX - resizeStartX);
	}

	function onResizePointerEnd(e: PointerEvent & { currentTarget: HTMLElement }) {
		if (!resizing) return;
		resizing = false;
		document.body.classList.remove('col-resizing');
		if (e.currentTarget.hasPointerCapture(e.pointerId))
			e.currentTarget.releasePointerCapture(e.pointerId);
	}

	/** keyboard fallback for the drag handle: ±16px, Shift = ±64px */
	function onResizeKeydown(e: KeyboardEvent) {
		const step = e.shiftKey ? 64 : 16;
		if (e.key === 'ArrowLeft') prefs.nameWidth = clampNameWidth(prefs.nameWidth - step);
		else if (e.key === 'ArrowRight') prefs.nameWidth = clampNameWidth(prefs.nameWidth + step);
		else if (e.key === 'Home') prefs.nameWidth = NAME_WIDTH_MIN;
		else if (e.key === 'End') prefs.nameWidth = NAME_WIDTH_MAX;
		else return;
		e.preventDefault();
	}

	// ---------- columns menu ----------

	let colsOpen = $state(false);
	let colsBtnEl: HTMLElement | undefined = $state();
	let colsMenuEl: HTMLElement | undefined = $state();
	let colsPos = $state({ x: 0, y: 0 });

	// the menu takes focus when it opens, whichever way it was opened
	$effect(() => {
		if (colsOpen && colsMenuEl) {
			void tick().then(() =>
				colsMenuEl?.querySelector<HTMLElement>('button.cols-item:not([disabled])')?.focus()
			);
		}
	});

	function toggleColsMenu() {
		if (colsOpen) {
			closeCols();
			return;
		}
		const r = colsBtnEl?.getBoundingClientRect();
		colsPos = {
			x: Math.max(8, Math.min(r?.left ?? 8, window.innerWidth - 250)),
			y: Math.max(8, Math.min((r?.bottom ?? 0) + 6, window.innerHeight - 400))
		};
		colsOpen = true;
	}

	function closeCols() {
		// hand focus back only when a keyboard user was inside the menu
		if (colsBtnEl && colsMenuEl?.contains(document.activeElement)) colsBtnEl.focus();
		colsOpen = false;
	}

	function toggleColumn(key: ColumnKey) {
		prefs.hidden = prefs.hidden.includes(key)
			? prefs.hidden.filter((k) => k !== key)
			: [...prefs.hidden, key];
	}

	function showAllColumns() {
		prefs.hidden = [];
	}

	function toggleGroup(key: string) {
		if (collapsedDirs.has(key)) collapsedDirs.delete(key);
		else collapsedDirs.add(key);
	}

	function closePopups() {
		closeCtx();
		if (colsOpen) closeCols();
	}

	/** Arrow/Home/End roving inside an open popup menu */
	function roveMenuItems(menu: HTMLElement | undefined, selector: string, e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End')
			return;
		const items = menu ? [...menu.querySelectorAll<HTMLElement>(selector)] : [];
		if (items.length === 0) return;
		e.preventDefault();
		const active = items.indexOf(document.activeElement as HTMLElement);
		let next: number;
		if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = items.length - 1;
		else if (active === -1) next = e.key === 'ArrowDown' ? 0 : items.length - 1;
		else next = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
		items[next].focus();
	}

	function onWindowKeydown(e: KeyboardEvent) {
		// roving focus inside the open menu
		if (ctx) {
			if (e.key === 'Escape') {
				e.preventDefault();
				closeCtx();
				return;
			}
			if (e.key === 'Tab') {
				closeCtx(); // the menu is a detour, not a tab trap
				return;
			}
			roveMenuItems(ctxMenuEl, 'button.ctx-item', e);
			return;
		}
		if (colsOpen) {
			if (e.key === 'Escape') {
				e.preventDefault();
				closeCols();
				return;
			}
			if (e.key === 'Tab') {
				closeCols(); // the menu is a detour, not a tab trap
				return;
			}
			roveMenuItems(colsMenuEl, 'button.cols-item:not([disabled])', e);
			return;
		}
		// keyboard selection lives on the torrent-name links (one tab stop per row)
		if (e.target instanceof Element && e.target.matches('a.t-name')) {
			const id = rowIdFrom(e);
			if (id !== null) {
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					e.preventDefault();
					moveRowFocus(id, e.key === 'ArrowDown' ? 1 : -1, e.shiftKey);
					return;
				}
				if (e.key === ' ') {
					e.preventDefault(); // without this the page scrolls
					selectAs(id, { meta: true, shift: e.shiftKey });
					return;
				}
				if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
					e.preventDefault();
					const link = e.target as HTMLElement;
					const r = link.getBoundingClientRect();
					openCtx(id, r.left, r.bottom + 4, link);
					return;
				}
			}
		}
		if (e.key === 'Escape') {
			clearSelection();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
			// let ⌘A behave normally while typing in the search box
			if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]'))
				return;
			e.preventDefault();
			setAllSelection(filteredIds);
			anchorId = filteredIds[0] ?? null;
		}
	}

	function bulk(ids: number[], action: 'start' | 'stop' | 'verify') {
		ctx = null;
		void store.actMany(ids, { action });
	}

	function bulkHr(ids: number[], op: 'exclude' | 'include') {
		ctx = null;
		void store.setHr(ids, op);
	}

	async function openDetail(id: number) {
		ctx = null;
		await goto(`/torrent/${id}`);
	}

	async function copyMagnet(t: Torrent) {
		ctx = null;
		const magnet = `magnet:?xt=urn:btih:${t.hashString}&dn=${encodeURIComponent(t.name)}`;
		try {
			await navigator.clipboard.writeText(magnet);
			store.setFlash('Magnet link copied');
		} catch {
			store.setFlash('Could not copy the magnet link', 'error');
		}
	}

	function sumSize(ids: number[]) {
		return ids.reduce((s, id) => s + (store.byId(id)?.sizeWhenDone ?? 0), 0);
	}

	function openBulkMove(ids: number[]) {
		ctx = null;
		bulkMoveIds = ids;
		bulkMoveLocation = store.config?.moveDestination ?? '';
		bulkMoveData = true;
		bulkMoveOpen = true;
	}

	async function confirmBulkMove() {
		if (!bulkMoveLocation.trim()) return;
		bulkMoveBusy = true;
		const ok = await store.actMany(bulkMoveIds, {
			action: 'move',
			location: bulkMoveLocation.trim(),
			move: bulkMoveData
		});
		bulkMoveBusy = false;
		if (ok) bulkMoveOpen = false;
	}

	function openBulkRemove(ids: number[]) {
		ctx = null;
		bulkRemoveIds = ids;
		bulkRemoveTotal = sumSize(ids);
		bulkRemoveDeleteData = false;
		bulkRemoveOpen = true;
	}

	async function confirmBulkRemove() {
		bulkRemoveBusy = true;
		const ok = await store.actMany(bulkRemoveIds, {
			action: 'remove',
			deleteData: bulkRemoveDeleteData
		});
		bulkRemoveBusy = false;
		if (ok) {
			bulkRemoveOpen = false;
			clearSelection();
		}
	}
</script>

<svelte:window
	onclick={onWindowClick}
	ondblclick={onWindowDblclick}
	oncontextmenu={onWindowContext}
	onkeydown={onWindowKeydown}
	onscroll={closePopups}
	onresize={closePopups}
/>

<section class="page">
	<div class="toolbar">
		<div class="chips">
			{#each FILTERS as f (f.key)}
				<button
					class="chip {filter === f.key ? 'active' : ''}"
					aria-pressed={filter === f.key}
					onclick={() => {
						// Finder folder-change semantics: switching views drops
						// the selection instead of keeping rows you can't see
						if (filter !== f.key) {
							filter = f.key;
							clearSelection();
						}
					}}
				>
					{f.label} <span class="chip-count">{counts[f.key]}</span>
				</button>
			{/each}
		</div>
		<div class="toolbar-right">
			<input
				class="search"
				type="search"
				placeholder="Search torrents…"
				aria-label="Search torrents"
				bind:value={query}
			/>
			<button
				class="icon-btn cols-btn"
				class:on={grouping.groupBy !== 'none'}
				title="Choose columns"
				aria-label="Choose columns"
				aria-haspopup="menu"
				aria-expanded={colsOpen}
				bind:this={colsBtnEl}
				onclick={toggleColsMenu}
			>
				▦
			</button>
			<button class="btn primary" onclick={() => (addOpen = true)}>+ Add</button>
		</div>
	</div>

	{#if !store.connected && store.error}
		<div class="empty-state">
			<h3>Cannot reach Transmission</h3>
			<p>{store.error}</p>
			<p class="hint">
				Check that Transmission is running with RPC enabled, and — when running this app in Docker —
				that <code>rpc-bind-address</code> allows connections from <code>host.docker.internal</code>.
				See the README for the one-time Transmission settings.
			</p>
			<div class="empty-actions">
				<button class="btn sm" onclick={() => void store.refresh()}>Retry now</button>
			</div>
			<p class="hint">The list also retries on its own every 2 seconds.</p>
		</div>
	{:else if filtered.length === 0}
		<div class="empty-state">
			<h3>{store.torrents.length === 0 ? 'No torrents' : 'Nothing matches'}</h3>
			<p>
				{store.torrents.length === 0
					? 'Add a magnet link or .torrent URL to get started.'
					: 'Try a different filter or search.'}
			</p>
			{#if store.torrents.length > 0}
				<div class="empty-actions">
					{#if query.trim()}
						<button class="btn sm" onclick={() => (query = '')}>Clear search</button>
					{/if}
					{#if filter !== 'all'}
						<button class="btn sm" onclick={() => (filter = 'all')}>Show all</button>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="table-wrap tall">
			<table
				class="torrent-table"
				role="grid"
				aria-label="Torrents"
				style="min-width: {tableMinWidth(prefs)}px"
			>
				<colgroup>
					<col style="width: {prefs.nameWidth}px" />
					{#each dataCols as col (col.key)}
						<col style="width: {col.width}px" />
					{/each}
					<col style="width: {ACTIONS_WIDTH}px" />
				</colgroup>
				<thead>
					<tr>
						<th class="col-name" scope="col" aria-sort={ariaSortOf(NAME_COL)}>
							<button class="th-sort" onclick={() => sortBy(NAME_COL)} title="Sort by name">
								<span class="th-label">Name</span>
								<span class="th-arrow" class:on={sortKey === 'name'} aria-hidden="true">
									{sortDir === 1 ? '↑' : '↓'}
								</span>
							</button>
							<!-- a focusable, adjustable separator is the ARIA-correct resize
							     widget; the checker just doesn't model it -->
							<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
							<span
								class="col-resize"
								class:active={resizing}
								role="separator"
								aria-orientation="vertical"
								aria-label="Resize Name column"
								aria-valuemin={NAME_WIDTH_MIN}
								aria-valuemax={NAME_WIDTH_MAX}
								aria-valuenow={prefs.nameWidth}
								title="Drag to resize · double-click to reset"
								tabindex="0"
								onpointerdown={onResizePointerDown}
								onpointermove={onResizePointerMove}
								onpointerup={onResizePointerEnd}
								onpointercancel={onResizePointerEnd}
								onkeydown={onResizeKeydown}
								ondblclick={() => (prefs.nameWidth = DEFAULT_NAME_WIDTH)}
							></span>
						</th>
						{#each dataCols as col (col.key)}
							<th
								scope="col"
								class={col.headerClass ?? undefined}
								aria-label={col.menuLabel}
								aria-sort={ariaSortOf(col)}
							>
								{#if col.sortKey}
									<button
										class="th-sort"
										onclick={() => sortBy(col)}
										title="Sort by {col.menuLabel}"
									>
										<span class="th-label">{col.label}</span>
										<span class="th-arrow" class:on={sortKey === col.sortKey} aria-hidden="true">
											{sortDir === 1 ? '↑' : '↓'}
										</span>
									</button>
								{:else}
									{col.label}
								{/if}
							</th>
						{/each}
						<th class="col-actions" scope="col"></th>
					</tr>
				</thead>
				<tbody>
					{#snippet row(t: Torrent)}
						<tr
							data-torrent-id={t.id}
							class:selected={selection.has(t.id)}
							class:hr={hrOf(t).inGroup}
							class:ready={readyOf(t)}
							aria-selected={selection.has(t.id)}
						>
							<td class="col-name">
								<div class="name-cell">
									<a class="t-name" href="/torrent/{t.id}" title={t.name}>{t.name}</a>
									{#if hrOf(t).inGroup}
										<span
											class="hr-badge"
											title="Hit &amp; Run — seeded {fmtDuration(hrOf(t).seeded)} of {fmtHours(hrOf(t).required)} ({fmtDuration(hrOf(t).remaining)} to go). {hrRuleHint()}"
										>
											HR {fmtHours(hrOf(t).seeded)}/{fmtHours(hrOf(t).required)}
										</span>
									{/if}
									{#if readyOf(t)}
										<span class="ready-badge" title={archiveReadyHint()}>✓ ready</span>
									{/if}
								</div>
							</td>
							{#each dataCols as col (col.key)}
								{#if col.key === 'status'}
									<td><StatusBadge torrent={t} /></td>
								{:else if col.key === 'progress'}
									<td>
										<div class="prog-cell">
											<ProgressBar value={t.percentDone} />
											<span class="prog-label">
												{fmtPercent(t.percentDone)}
												{#if t.percentDone < 1 && statusInfo(t).key === 'downloading'}
													· ETA {fmtEta(t.eta)}
												{/if}
											</span>
										</div>
									</td>
								{:else if col.key === 'size'}
									<td class="num">{fmtBytes(t.sizeWhenDone)}</td>
								{:else if col.key === 'rateDown'}
									<td class="num dim">{fmtSpeed(t.rateDownload)}</td>
								{:else if col.key === 'rateUp'}
									<td class="num dim">{fmtSpeed(t.rateUpload)}</td>
								{:else if col.key === 'ratio'}
									<td class="num">{fmtRatio(t.uploadRatio)}</td>
								{:else if col.key === 'seeded'}
									<td class="num dim">{fmtDuration(t.secondsSeeding)}</td>
								{/if}
							{/each}
							<td class="col-actions">
								<button
									class="icon-btn"
									title="Play video in browser"
									aria-label="Play video in browser"
									onclick={() => void quickPlay(t)}
								>
									▷
								</button>
								<button
									class="icon-btn"
									title={statusInfo(t).key === 'paused' ? 'Resume' : 'Pause'}
									aria-label={statusInfo(t).key === 'paused' ? 'Resume' : 'Pause'}
									onclick={() => toggle(t)}
								>
									{statusInfo(t).key === 'paused' ? '▶' : '❚❚'}
								</button>
								<button
									class="icon-btn danger-act"
									title="Remove torrent…"
									aria-label="Remove torrent…"
									onclick={() => {
										removeTarget = t;
										removeDeleteData = false;
									}}
								>
									✕
								</button>
							</td>
						</tr>
					{/snippet}
					{#each renderItems as item (item.kind === 'group' ? `g:${item.group.key}` : item.torrent.id)}
						{#if item.kind === 'group'}
							{@const g = item.group}
							{@const matched = g.rows.length}
							{@const total = dirTotals.get(g.key) ?? matched}
							<tr class="group-row">
								<td colspan={dataCols.length + 2}>
									<button
										class="group-toggle"
										aria-expanded={!collapsedDirs.has(g.key)}
										title={g.key}
										onclick={() => toggleGroup(g.key)}
									>
										<span class="group-caret" aria-hidden="true">
											{collapsedDirs.has(g.key) ? '▸' : '▾'}
										</span>
										<span class="group-path">{g.key}</span>
										<span class="group-meta">
											{total > matched ? `${matched}/${total}` : matched}
											· {fmtBytes(g.rows.reduce((s, t) => s + t.sizeWhenDone, 0))}
										</span>
									</button>
								</td>
							</tr>
						{:else}
							{@render row(item.torrent)}
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<Modal open={addOpen} title="Add torrent" onclose={() => (addOpen = false)}>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			void confirmAdd();
		}}
	>
		<label class="field">
			<span>Magnet link or .torrent URL</span>
			<input type="text" placeholder="magnet:?xt=urn:btih:…" bind:value={addUrl} />
		</label>
		<p class="hint">Transmission fetches the URL itself; local file upload is not in this MVP.</p>
	</form>
	{#snippet footer()}
		<button class="btn" onclick={() => (addOpen = false)} disabled={addBusy}>Cancel</button>
		<button class="btn primary" onclick={() => void confirmAdd()} disabled={addBusy || !addUrl.trim()}>
			{addBusy ? 'Adding…' : 'Add'}
		</button>
	{/snippet}
</Modal>

{#if removeTarget}
	<Modal open title="Remove torrent" onclose={() => (removeTarget = null)}>
		<p class="confirm-message">Remove <strong>{removeTarget.name}</strong> from the list?</p>
		<label class="check-row">
			<input type="checkbox" bind:checked={removeDeleteData} />
			<span>
				Also delete downloaded data ({fmtBytes(removeTarget.sizeWhenDone)}) — <em>cannot be undone</em>
			</span>
		</label>
		{#snippet footer()}
			<button class="btn" onclick={() => (removeTarget = null)} disabled={removeBusy}>Cancel</button>
			<button class="btn danger" onclick={() => void confirmRemove()} disabled={removeBusy}>
				{removeBusy ? 'Removing…' : removeDeleteData ? 'Remove + delete data' : 'Remove from list'}
			</button>
		{/snippet}
	</Modal>
{/if}

{#if selection.size > 0}
	<div class="sel-bar" role="toolbar" aria-label="Actions for selected torrents">
		<span class="sel-count" aria-live="polite">
			{selection.size} selected · {fmtBytes(selectedTotal)}
		</span>
		<div class="sel-actions">
			<button class="btn sm" onclick={() => void store.actMany([...selection], { action: 'start' })}>
				<span aria-hidden="true">▶</span> Resume
			</button>
			<button class="btn sm" onclick={() => void store.actMany([...selection], { action: 'stop' })}>
				<span aria-hidden="true">❚❚</span> Pause
			</button>
			<button class="btn sm" onclick={() => void store.actMany([...selection], { action: 'verify' })}>
				Verify
			</button>
			{#if selHr.inGroup > 0}
				<button class="btn sm" onclick={() => void store.setHr([...selection], 'exclude')}>
					Exclude from HR{selHr.inGroup > 1 ? ` (${selHr.inGroup})` : ''}
				</button>
			{/if}
			{#if selHr.excluded > 0}
				<button class="btn sm" onclick={() => void store.setHr([...selection], 'include')}>
					Add back to HR{selHr.excluded > 1 ? ` (${selHr.excluded})` : ''}
				</button>
			{/if}
			<button class="btn sm" onclick={() => openBulkMove([...selection])}>Move to HDD…</button>
			<span class="sel-sep" aria-hidden="true"></span>
			<button class="btn sm danger" onclick={() => openBulkRemove([...selection])}>Remove…</button>
		</div>
		<button class="icon-btn" title="Clear selection (Esc)" aria-label="Clear selection" onclick={() => clearSelection()}>
			✕
		</button>
	</div>
{/if}

{#if ctx}
	<div class="ctx-menu" role="menu" bind:this={ctxMenuEl} style="left: {ctx.x}px; top: {ctx.y}px">
		{#if ctxSingle}
			<button class="ctx-item" role="menuitem" onclick={() => void openDetail(ctxSingle!.id)}>
				Open details
			</button>
			<button class="ctx-item" role="menuitem" onclick={() => void copyMagnet(ctxSingle!)}>
				Copy magnet link
			</button>
			<div class="ctx-sep" role="separator"></div>
		{/if}
		<button class="ctx-item" role="menuitem" onclick={() => bulk(ctxIds, 'start')}>Resume</button>
		<button class="ctx-item" role="menuitem" onclick={() => bulk(ctxIds, 'stop')}>Pause</button>
		<button class="ctx-item" role="menuitem" onclick={() => bulk(ctxIds, 'verify')}>Verify</button>
		<div class="ctx-sep" role="separator"></div>
		{#if ctxHr.inGroup > 0}
			<button class="ctx-item" role="menuitem" onclick={() => bulkHr(ctxIds, 'exclude')}>
				Exclude from HR{ctxHr.inGroup > 1 ? ` (${ctxHr.inGroup})` : ''}
			</button>
		{/if}
		{#if ctxHr.excluded > 0}
			<button class="ctx-item" role="menuitem" onclick={() => bulkHr(ctxIds, 'include')}>
				Add back to HR{ctxHr.excluded > 1 ? ` (${ctxHr.excluded})` : ''}
			</button>
		{/if}
		<button class="ctx-item" role="menuitem" onclick={() => openBulkMove(ctxIds)}>Move to HDD…</button>
		<div class="ctx-sep" role="separator"></div>
		<button class="ctx-item danger" role="menuitem" onclick={() => openBulkRemove(ctxIds)}>
			Remove…
		</button>
	</div>
{/if}

{#if colsOpen}
	<div
		class="ctx-menu columns-menu"
		role="menu"
		aria-label="Table columns"
		bind:this={colsMenuEl}
		style="left: {colsPos.x}px; top: {colsPos.y}px"
	>
		<div class="cols-title">Columns</div>
		<button class="ctx-item cols-item" role="menuitemcheckbox" aria-checked="true" disabled>
			<span class="cols-check" aria-hidden="true">✓</span>
			Name <span class="cols-hint">always shown</span>
		</button>
		{#each COLUMNS.filter((c) => c.hideable) as col (col.key)}
			<button
				class="ctx-item cols-item"
				role="menuitemcheckbox"
				aria-checked={!prefs.hidden.includes(col.key)}
				onclick={() => toggleColumn(col.key)}
			>
				<span class="cols-check" aria-hidden="true">
					{prefs.hidden.includes(col.key) ? '' : '✓'}
				</span>
				{col.menuLabel}
			</button>
		{/each}
		{#if prefs.hidden.length > 0}
			<div class="ctx-sep" role="separator"></div>
			<button class="ctx-item cols-item" role="menuitem" onclick={showAllColumns}>
				Show all
			</button>
		{/if}
		<div class="ctx-sep" role="separator"></div>
		<div class="cols-title">Group by</div>
		<button
			class="ctx-item cols-item"
			role="menuitemradio"
			aria-checked={grouping.groupBy === 'none'}
			onclick={() => (grouping = { ...grouping, groupBy: 'none' })}
		>
			<span class="cols-check" aria-hidden="true">{grouping.groupBy === 'none' ? '✓' : ''}</span>
			None
		</button>
		<button
			class="ctx-item cols-item"
			role="menuitemradio"
			aria-checked={grouping.groupBy === 'location'}
			onclick={() => (grouping = { ...grouping, groupBy: 'location' })}
		>
			<span class="cols-check" aria-hidden="true">{grouping.groupBy === 'location' ? '✓' : ''}</span>
			Location
		</button>
	</div>
{/if}

<Modal
	open={bulkMoveOpen}
	title="Move torrents to external HDD"
	onclose={() => (bulkMoveOpen = false)}
>
	<p class="confirm-message">
		Move <strong>{bulkMoveIds.length}</strong> torrent(s) ({fmtBytes(sumSize(bulkMoveIds))}) to the
		same destination?
	</p>
	<label class="field">
		<span>Destination path (as Transmission on your Mac sees it)</span>
		<input type="text" placeholder="/Volumes/YourHDD/…" bind:value={bulkMoveLocation} />
	</label>
	<label class="check-row">
		<input type="checkbox" bind:checked={bulkMoveData} />
		<span>Move data from the current location (uncheck only to re-locate in place)</span>
	</label>
	{#if store.config?.moveDestination}
		<p class="hint">Default from MOVE_DESTINATION: <code>{store.config.moveDestination}</code></p>
	{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (bulkMoveOpen = false)} disabled={bulkMoveBusy}>Cancel</button>
		<button
			class="btn primary"
			onclick={() => void confirmBulkMove()}
			disabled={bulkMoveBusy || !bulkMoveLocation.trim()}
		>
			{bulkMoveBusy ? 'Moving…' : 'Move torrents'}
		</button>
	{/snippet}
</Modal>

{#if bulkRemoveOpen}
	<Modal open title="Remove torrents" onclose={() => (bulkRemoveOpen = false)}>
		<p class="confirm-message">
			Remove <strong>{bulkRemoveIds.length}</strong> torrent(s) ({fmtBytes(bulkRemoveTotal)}) from
			the list?
		</p>
		<label class="check-row">
			<input type="checkbox" bind:checked={bulkRemoveDeleteData} />
			<span>
				Also delete downloaded data — <em>cannot be undone</em>
			</span>
		</label>
		{#snippet footer()}
			<button class="btn" onclick={() => (bulkRemoveOpen = false)} disabled={bulkRemoveBusy}>Cancel</button>
			<button class="btn danger" onclick={() => void confirmBulkRemove()} disabled={bulkRemoveBusy}>
				{bulkRemoveBusy ? 'Removing…' : bulkRemoveDeleteData ? 'Remove + delete data' : 'Remove from list'}
			</button>
		{/snippet}
	</Modal>
{/if}
