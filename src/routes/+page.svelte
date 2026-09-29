<script lang="ts">
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { fmtBytes, fmtDuration, fmtEta, fmtHours, fmtPercent, fmtRatio, fmtSpeed } from '$lib/format';
	import { hrInfo, hrRuleHint } from '$lib/hr';
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
</script>

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
						<tr class:hr={hrOf(t).inGroup} class:ready={isArchiveReady(t, store.session)}>
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
