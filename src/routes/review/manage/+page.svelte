<script lang="ts">
	import { onMount } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { fmtBytes } from '$lib/format';
	import { readReviewPrefs, reviewKey, writeReviewPrefs } from '$lib/review';
	import { store } from '$lib/stores/torrents.svelte';
	import type { ReviewClearResult, ReviewItem } from '$lib/types';

	/* Every reviewable media file with its current decision:
	 * undecided (wanted), kept (wanted + kept mask), removed (deselected,
	 * still on disk), deleted (deselected + deleted from disk — Transmission
	 * keeps listing it until the torrent goes away). */

	type RowState = 'undecided' | 'kept' | 'removed' | 'deleted';

	interface Row {
		item: ReviewItem;
		state: RowState;
	}

	const STATE_LABEL: Record<RowState, string> = {
		undecided: 'UNDECIDED',
		kept: 'KEPT',
		removed: 'REMOVED',
		deleted: 'DELETED'
	};

	let loading = $state(true);
	let loadError = $state('');
	let rows = $state<Row[]>([]);
	let filter = $state<'all' | 'undecided' | 'kept' | 'removed'>('all');
	let search = $state('');
	/** key of the row with an action in flight — disables just that row */
	let busyKey = $state<string | null>(null);

	let kept = new Set<string>();
	let cleared = new Set<string>();

	function savePrefs() {
		writeReviewPrefs({ kept: [...kept], cleared: [...cleared] });
	}

	async function load() {
		loading = true;
		loadError = '';
		try {
			const res = await fetch('/api/review');
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
			const deck = body.deck as ReviewItem[];
			const rejected = body.rejected as ReviewItem[];

			const next: Row[] = [];
			const seen = new Set<string>();
			for (const item of deck) {
				const k = reviewKey(item);
				seen.add(k);
				next.push({ item, state: kept.has(k) ? 'kept' : 'undecided' });
			}
			for (const item of rejected) {
				const k = reviewKey(item);
				seen.add(k);
				next.push({ item, state: cleared.has(k) ? 'deleted' : 'removed' });
			}
			rows = next;

			// prune decision keys whose files vanished (torrent removed etc.)
			const keptSize = kept.size;
			const clearedSize = cleared.size;
			kept = new Set([...kept].filter((k) => seen.has(k)));
			cleared = new Set([...cleared].filter((k) => seen.has(k)));
			if (kept.size !== keptSize || cleared.size !== clearedSize) savePrefs();
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const p = readReviewPrefs();
		kept = new Set(p.kept);
		cleared = new Set(p.cleared);
		void load();
	});

	const counts = $derived({
		all: rows.length,
		undecided: rows.filter((r) => r.state === 'undecided').length,
		kept: rows.filter((r) => r.state === 'kept').length,
		removed: rows.filter((r) => r.state === 'removed' || r.state === 'deleted').length
	});

	const visible = $derived(
		rows.filter((r) => {
			if (filter === 'undecided' && r.state !== 'undecided') return false;
			if (filter === 'kept' && r.state !== 'kept') return false;
			if (filter === 'removed' && r.state !== 'removed' && r.state !== 'deleted') return false;
			const q = search.trim().toLowerCase();
			if (q && !r.item.name.toLowerCase().includes(q) && !r.item.torrentName.toLowerCase().includes(q)) {
				return false;
			}
			return true;
		})
	);

	const removedBytes = $derived(
		rows.filter((r) => r.state === 'removed').reduce((s, r) => s + r.item.length, 0)
	);

	/* ---------- row actions ---------- */

	function patch(key: string, state: RowState) {
		rows = rows.map((r) => (reviewKey(r.item) === key ? { ...r, state } : r));
	}

	async function run(key: string, fn: () => Promise<void> | void) {
		if (busyKey) return;
		busyKey = key;
		try {
			await fn();
		} finally {
			busyKey = null;
		}
	}

	async function setWanted(item: ReviewItem, wanted: boolean): Promise<boolean> {
		try {
			const res = await fetch(`/api/torrents/${item.torrentId}/action`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'set-files', indices: [item.index], wanted })
			});
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
			return true;
		} catch (e) {
			store.setFlash(e instanceof Error ? e.message : String(e), 'error');
			return false;
		}
	}

	function keep(row: Row) {
		const k = reviewKey(row.item);
		void run(k, () => {
			kept.add(k);
			savePrefs();
			patch(k, 'kept');
		});
	}

	function unkeep(row: Row) {
		const k = reviewKey(row.item);
		void run(k, () => {
			kept.delete(k);
			savePrefs();
			patch(k, 'undecided');
		});
	}

	function remove(row: Row) {
		const k = reviewKey(row.item);
		void run(k, async () => {
			if (!(await setWanted(row.item, false))) return;
			void store.refreshJunk();
			patch(k, 'removed');
		});
	}

	function restore(row: Row) {
		const k = reviewKey(row.item);
		void run(k, async () => {
			if (!(await setWanted(row.item, true))) return;
			if (cleared.delete(k)) savePrefs();
			void store.refreshJunk();
			patch(k, 'undecided');
		});
	}

	function deleteOne(row: Row) {
		const k = reviewKey(row.item);
		void run(k, async () => {
			try {
				const res = await fetch('/api/review', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ items: [{ id: row.item.torrentId, index: row.item.index }] })
				});
				const json = await res.json();
				if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
				if (json.deleted === 1) {
					store.setFlash(`Deleted ${displayName(row.item)}, freed ${fmtBytes(json.freed)}`);
				} else if (json.skipped?.length || json.failed?.length) {
					const why = json.skipped?.[0]?.reason ?? json.failed?.[0]?.error ?? 'not deleted';
					store.setFlash(why, 'error');
					return;
				}
				// deleted=0 without failures: nothing on disk — still counts as cleared
				cleared.add(k);
				savePrefs();
				patch(k, 'deleted');
				void store.refreshJunk();
			} catch (e) {
				store.setFlash(e instanceof Error ? e.message : String(e), 'error');
			}
		});
	}

	/* ---------- clear all rejected ---------- */

	let clearOpen = $state(false);
	let clearing = $state(false);

	const clearable = $derived(rows.filter((r) => r.state === 'removed'));

	function locationAllowed(dir: string): boolean {
		return store.locations.some((loc) => {
			const l = loc.replace(/\/+$/, '') || '/';
			return dir === l || dir.startsWith(l + '/');
		});
	}

	const blockedClearable = $derived(clearable.filter((r) => !locationAllowed(r.item.downloadDir)));

	async function doClear() {
		if (clearable.length === 0 || clearing) return;
		clearing = true;
		try {
			const res = await fetch('/api/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items: clearable.map((r) => ({ id: r.item.torrentId, index: r.item.index }))
				})
			});
			const json = (await res.json()) as ReviewClearResult & { error?: string };
			if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
			if (json.failed.length === 0 && json.skipped.length === 0) {
				store.setFlash(`Cleared ${json.deleted} file(s), freed ${fmtBytes(json.freed)}`);
				for (const r of clearable) cleared.add(reviewKey(r.item));
				savePrefs();
			} else {
				store.setFlash(
					`Cleared ${json.deleted}, freed ${fmtBytes(json.freed)} — ${json.failed.length + json.skipped.length} not deleted`,
					'error'
				);
			}
			clearOpen = false;
			await load();
			void store.refreshJunk();
		} catch (e) {
			store.setFlash(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			clearing = false;
		}
	}

	/* ---------- display ---------- */

	function displayName(item: ReviewItem): string {
		const p = `${item.torrentName}/`;
		return item.name.startsWith(p) ? item.name.slice(p.length) : item.name;
	}
</script>

<section class="page">
	<header class="review-head">
		<a class="back" href="/review">← Review deck</a>
		<h2>DECISIONS</h2>
		<span class="dim">{counts.all} media file(s)</span>
		<div class="review-head-right">
			<button class="btn sm" onclick={() => void load()}>Refresh</button>
			<button class="btn danger sm" onclick={() => (clearOpen = true)} disabled={clearable.length === 0}>
				Clear {clearable.length} rejected…
			</button>
		</div>
	</header>

	<div class="toolbar">
		<div class="chips" role="group" aria-label="Filter by decision">
			<button class="chip" class:active={filter === 'all'} onclick={() => (filter = 'all')}>
				All<span class="chip-count">{counts.all}</span>
			</button>
			<button class="chip" class:active={filter === 'undecided'} onclick={() => (filter = 'undecided')}>
				Undecided<span class="chip-count">{counts.undecided}</span>
			</button>
			<button class="chip" class:active={filter === 'kept'} onclick={() => (filter = 'kept')}>
				Kept<span class="chip-count">{counts.kept}</span>
			</button>
			<button class="chip" class:active={filter === 'removed'} onclick={() => (filter = 'removed')}>
				Removed<span class="chip-count">{counts.removed}</span>
			</button>
		</div>
		<div class="toolbar-right">
			<input class="search" type="search" placeholder="Filter by file or torrent…" bind:value={search} />
		</div>
	</div>

	{#if loading}
		<div class="empty-state">
			<h3>Loading…</h3>
			<p>Collecting decisions across all torrents.</p>
		</div>
	{:else if loadError}
		<div class="empty-state">
			<h3>Cannot load decisions</h3>
			<p class="err">{loadError}</p>
			<button class="btn" onclick={() => void load()}>Retry</button>
		</div>
	{:else if visible.length === 0}
		<div class="empty-state">
			<h3>{rows.length === 0 ? 'No media files' : 'Nothing matches'}</h3>
			<p>
				{rows.length === 0
					? 'No fully-downloaded videos or images in any torrent.'
					: 'Adjust the filter chips or the search.'}
			</p>
		</div>
	{:else}
		<div class="table-wrap tall">
			<table class="files-table manage-table">
				<thead>
					<tr>
						<th scope="col">State</th>
						<th scope="col">File</th>
						<th class="num" scope="col">Size</th>
						<th class="num" scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each visible as row (reviewKey(row.item))}
						{@const key = reviewKey(row.item)}
						{@const busy = busyKey === key}
						<tr class:rm-deleted={row.state === 'deleted'}>
							<td><span class="dec-badge dec-{row.state}">{STATE_LABEL[row.state]}</span></td>
							<td>
								{#if row.state !== 'deleted'}
									<a
										class="file-play"
										href={`/torrent/${row.item.torrentId}/play?file=${row.item.index}`}
										title="Open in player"
										aria-label="Play {displayName(row.item)}"
									>
										▶
									</a>
								{/if}
								<span class="file-path" title={row.item.name}>{displayName(row.item)}</span>
								<span class="dim"> · {row.item.torrentName}</span>
							</td>
							<td class="num">{fmtBytes(row.item.length)}</td>
							<td class="num manage-actions">
								{#if row.state === 'undecided'}
									<button class="btn sm" onclick={() => keep(row)} disabled={busy}>Keep</button>
									<button class="btn sm danger" onclick={() => remove(row)} disabled={busy}>Remove</button>
								{:else if row.state === 'kept'}
									<button class="btn sm" onclick={() => unkeep(row)} disabled={busy}>Unkeep</button>
								{:else if row.state === 'removed'}
									<button class="btn sm" onclick={() => restore(row)} disabled={busy}>Restore</button>
									<button class="btn sm danger" onclick={() => deleteOne(row)} disabled={busy}>Delete</button>
								{:else}
									<button
										class="btn sm"
										onclick={() => restore(row)}
										disabled={busy}
										title="Re-select the file so Transmission downloads it again"
									>
										Restore
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="hint">
			Removed = deselected in Transmission, still on disk (~{fmtBytes(removedBytes)}). Delete frees
			the space; Restore re-selects the file. Kept is a local decision — unkeep returns the file
			to the deck.
		</p>
	{/if}
</section>

<Modal open={clearOpen} title="Clear rejected media" onclose={() => (clearOpen = false)}>
	<p class="confirm-message">
		Permanently delete <strong>{clearable.length}</strong> rejected media file(s)
		(~{fmtBytes(removedBytes)}) from disk? This cannot be undone.
	</p>
	{#if blockedClearable.length > 0}
		<p class="warn">
			{blockedClearable.length} file(s) sit in locations not enabled for cleanup — they cannot be
			deleted until the location is enabled on the torrent's page.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (clearOpen = false)} disabled={clearing}>Cancel</button>
		<button class="btn danger" onclick={() => void doClear()} disabled={clearing}>
			{clearing ? 'Clearing…' : `Clear ${clearable.length} file(s)`}
		</button>
	{/snippet}
</Modal>
