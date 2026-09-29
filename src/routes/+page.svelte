<script lang="ts">
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { goto } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { fmtBytes, fmtDuration, fmtEta, fmtHours, fmtPercent, fmtRatio, fmtSpeed } from '$lib/format';
	import { hrInfo, hrRuleHint } from '$lib/hr';
	import { applySelection } from '$lib/selection';
	import {
		archiveReadyHint,
		isArchiveReady,
		matchesFilter,
		statusInfo,
		type FilterKey
	} from '$lib/status';
	import { store } from '$lib/stores/torrents.svelte';
	import type { Torrent } from '$lib/types';

	let filter = $state<FilterKey>('all');
	let query = $state('');
	let sortKey = $state('activity');
	let sortDir = $state(-1);

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

	const filteredIds = $derived(filtered.map((t) => t.id));
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
		if (el?.closest('.ctx-menu, .modal, .modal-backdrop, .toast')) return;
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

	function onWindowContext(e: MouseEvent) {
		const id = rowIdFrom(e);
		if (id === null) {
			ctx = null; // right-click elsewhere: dismiss, keep the native menu
			return;
		}
		e.preventDefault();
		// Finder semantics: the menu acts on the whole selection when the
		// right-clicked row is part of it, otherwise on just that row
		if (!selection.has(id)) {
			setAllSelection([id]);
			anchorId = id;
		}
		const ids = [...selection];
		const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 250));
		const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 380));
		ctx = { ids, single: ids.length === 1 ? (store.byId(ids[0]) ?? null) : null, x, y };
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (ctx) ctx = null;
			else clearSelection();
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
	oncontextmenu={onWindowContext}
	onkeydown={onWindowKeydown}
	onscroll={() => (ctx = null)}
	onresize={() => (ctx = null)}
/>

<section class="page">
	<div class="toolbar">
		<div class="chips">
			{#each FILTERS as f (f.key)}
				<button class="chip {filter === f.key ? 'active' : ''}" onclick={() => (filter = f.key)}>
					{f.label} <span class="chip-count">{counts[f.key]}</span>
				</button>
			{/each}
		</div>
		<div class="toolbar-right">
			<input class="search" type="search" placeholder="Search torrents…" bind:value={query} />
			<select bind:value={sortKey} aria-label="Sort by">
				<option value="activity">Recent activity</option>
				<option value="name">Name</option>
				<option value="progress">Progress</option>
				<option value="size">Size</option>
				<option value="ratio">Ratio</option>
				<option value="seed">Seed time</option>
			</select>
			<button class="icon-btn" title="Toggle sort direction" onclick={() => (sortDir = -sortDir)}>
				{sortDir === -1 ? '↓' : '↑'}
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
		</div>
	{:else if filtered.length === 0}
		<div class="empty-state">
			<h3>{store.torrents.length === 0 ? 'No torrents' : 'Nothing matches'}</h3>
			<p>
				{store.torrents.length === 0
					? 'Add a magnet link or .torrent URL to get started.'
					: 'Try a different filter or search.'}
			</p>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="torrent-table">
				<thead>
					<tr>
						<th class="col-name">Name</th>
						<th>Status</th>
						<th class="col-progress">Progress</th>
						<th class="num">Size</th>
						<th class="num">↓</th>
						<th class="num">↑</th>
						<th class="num">Ratio</th>
						<th class="num">Seeded</th>
						<th class="col-actions"></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as t (t.id)}
						<tr
							data-torrent-id={t.id}
							class:selected={selection.has(t.id)}
							class:hr={hrOf(t).inGroup}
							class:ready={isArchiveReady(t, store.session)}
						>
							<td class="col-name">
								<a class="t-name" href="/torrent/{t.id}">{t.name}</a>
								{#if hrOf(t).inGroup}
									<span
										class="hr-badge"
										title="Hit &amp; Run — seeded {fmtDuration(hrOf(t).seeded)} of {fmtHours(hrOf(t).required)} ({fmtDuration(hrOf(t).remaining)} to go). {hrRuleHint()}"
									>
										HR {fmtHours(hrOf(t).seeded)}/{fmtHours(hrOf(t).required)}
									</span>
								{/if}
								{#if isArchiveReady(t, store.session)}
									<span class="ready-badge" title={archiveReadyHint()}>✓ ready</span>
								{/if}
							</td>
							<td><StatusBadge torrent={t} /></td>
							<td class="col-progress">
								<div class="prog-cell">
									<ProgressBar value={t.percentDone} />
									<span class="prog-label">
										{fmtPercent(t.percentDone)}
										{#if t.percentDone < 1 && statusInfo(t).key === 'downloading'} · ETA {fmtEta(t.eta)}{/if}
									</span>
								</div>
							</td>
							<td class="num">{fmtBytes(t.sizeWhenDone)}</td>
							<td class="num dim">{fmtSpeed(t.rateDownload)}</td>
							<td class="num dim">{fmtSpeed(t.rateUpload)}</td>
							<td class="num">{fmtRatio(t.uploadRatio)}</td>
							<td class="num dim">{fmtDuration(t.secondsSeeding)}</td>
							<td class="col-actions">
								<button
									class="icon-btn"
									title={statusInfo(t).key === 'paused' ? 'Resume' : 'Pause'}
									onclick={() => toggle(t)}
								>
									{statusInfo(t).key === 'paused' ? '▶' : '❚❚'}
								</button>
								<button
									class="icon-btn danger-act"
									title="Remove torrent…"
									onclick={() => {
										removeTarget = t;
										removeDeleteData = false;
									}}
								>
									✕
								</button>
							</td>
						</tr>
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
		<span class="sel-count">{selection.size} selected · {fmtBytes(selectedTotal)}</span>
		<div class="sel-actions">
			<button class="btn sm" onclick={() => void store.actMany([...selection], { action: 'start' })}>
				▶ Resume
			</button>
			<button class="btn sm" onclick={() => void store.actMany([...selection], { action: 'stop' })}>
				❚❚ Pause
			</button>
			<button class="btn sm" onclick={() => void store.actMany([...selection], { action: 'verify' })}>
				Verify
			</button>
			{#if selHr.inGroup > 0}
				<button class="btn sm" onclick={() => void store.setHr([...selection], 'exclude')}>
					Remove from HR{selHr.inGroup > 1 ? ` (${selHr.inGroup})` : ''}
				</button>
			{/if}
			{#if selHr.excluded > 0}
				<button class="btn sm" onclick={() => void store.setHr([...selection], 'include')}>
					Add back to HR{selHr.excluded > 1 ? ` (${selHr.excluded})` : ''}
				</button>
			{/if}
			<button class="btn sm" onclick={() => openBulkMove([...selection])}>Move to HDD…</button>
			<button class="btn sm danger" onclick={() => openBulkRemove([...selection])}>Remove…</button>
		</div>
		<button class="icon-btn" title="Clear selection (Esc)" onclick={() => clearSelection()}>✕</button>
	</div>
{/if}

{#if ctx}
	<div class="ctx-menu" role="menu" style="left: {ctx.x}px; top: {ctx.y}px">
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
				Remove from HR{ctxHr.inGroup > 1 ? ` (${ctxHr.inGroup})` : ''}
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
