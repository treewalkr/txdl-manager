<script lang="ts">
	import { page } from '$app/state';
	import Modal from '$lib/components/Modal.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { fmtBytes, fmtDate, fmtDuration, fmtEta, fmtPercent, fmtRatio, fmtSpeed } from '$lib/format';
	import { statusInfo } from '$lib/status';
	import { store } from '$lib/stores/torrents.svelte';
	import type { CleanupDeleteResult, CleanupScanResult } from '$lib/types';

	const id = $derived(Number(page.params?.id ?? Number.NaN));

	const summary = $derived(store.byId(id));
	const detail = $derived(store.detail && store.detail.id === id ? store.detail : null);
	const torrent = $derived(detail ?? summary ?? null);
	const files = $derived(detail?.files ?? []);
	const stats = $derived(detail?.fileStats ?? []);

	// junk panel
	let scan = $state<CleanupScanResult | null>(null);
	let scanning = $state(false);
	let cleanupConfirmOpen = $state(false);
	let cleaning = $state(false);
	let cleanupResult = $state<CleanupDeleteResult | null>(null);

	// move dialog
	let moveOpen = $state(false);
	let moveLocation = $state('');
	let moveData = $state(true);
	let moveBusy = $state(false);

	// remove dialog
	let removeOpen = $state(false);
	let removeDeleteData = $state(false);
	let removeBusy = $state(false);

	$effect(() => {
		store.watchDetail(Number.isInteger(id) ? id : null);
		return () => store.watchDetail(null);
	});

	// when the torrent disappears (removed here or elsewhere) after at least one
	// successful state fetch, go back to the list
	$effect(() => {
		if (store.lastUpdated > 0 && store.connected && !summary && !detail) {
			void gotoList();
		}
	});

	async function gotoList() {
		const { goto } = await import('$app/navigation');
		await goto('/');
	}

	async function runScan() {
		scanning = true;
		cleanupResult = null;
		scan = await store.cleanup(id, 'scan');
		scanning = false;
	}

	async function confirmCleanup() {
		cleaning = true;
		const result = await store.cleanup(id, 'delete');
		cleaning = false;
		if (result) {
			cleanupConfirmOpen = false;
			cleanupResult = result;
			scan = result;
			if (result.failed.length === 0 && result.freed > 0) {
				store.setFlash(`Deleted ${result.deleted} junk file(s), freed ${fmtBytes(result.freed)}`);
			}
		}
	}

	async function confirmMove() {
		if (!moveLocation.trim()) return;
		moveBusy = true;
		const ok = await store.act(id, { action: 'move', location: moveLocation.trim(), move: moveData });
		moveBusy = false;
		if (ok) moveOpen = false;
	}

	async function confirmRemove() {
		removeBusy = true;
		const ok = await store.act(id, { action: 'remove', deleteData: removeDeleteData });
		removeBusy = false;
		if (ok) removeOpen = false;
	}

	function openMove() {
		moveLocation = store.config?.moveDestination ?? '';
		moveData = true;
		moveOpen = true;
	}

	async function setWanted(index: number, wanted: boolean) {
		const ok = await store.act(id, { action: 'set-files', indices: [index], wanted });
		if (ok) {
			// refresh junk info since the wanted set changed
			if (scan) void runScan();
		}
	}

	const fileRows = $derived(
		files.map((f, i) => {
			const multi = files.length > 1 && files.some((x) => x.name.includes('/'));
			const display = multi ? f.name.split('/').slice(1).join('/') || f.name : f.name;
			const depth = display.split('/').length - 1;
			return { f, i, display, depth, wanted: stats[i]?.wanted ?? true, completed: stats[i]?.bytesCompleted ?? f.bytesCompleted };
		})
	);
</script>

<section class="page">
	{#if !torrent}
		<div class="empty-state">
			<h3>Loading…</h3>
			<p>Fetching torrent details.</p>
		</div>
	{:else}
		<div class="detail-head">
			<div class="detail-title">
				<a class="back" href="/">← All torrents</a>
				<h2>{torrent.name}</h2>
				<div class="detail-sub">
					<StatusBadge torrent={torrent} />
					<span class="mono dim">{torrent.downloadDir}</span>
					<span class="dim">added {fmtDate(torrent.dateAdded)}</span>
					{#if torrent.error !== 0}<span class="err">{torrent.errorString}</span>{/if}
				</div>
			</div>
			<div class="detail-actions">
				<button class="btn" onclick={() => store.act(id, { action: statusInfo(torrent).key === 'paused' ? 'start' : 'stop' })}>
					{statusInfo(torrent).key === 'paused' ? '▶ Resume' : '❚❚ Pause'}
				</button>
				<button class="btn" onclick={() => store.act(id, { action: 'verify' })}>Verify</button>
				<button class="btn" onclick={openMove}>Move to HDD…</button>
				<button
					class="btn danger"
					onclick={() => {
						removeDeleteData = false;
						removeOpen = true;
					}}
				>
					Remove…
				</button>
			</div>
		</div>

		<div class="stat-grid">
			<div class="stat">
				<span class="stat-label">Progress</span>
				<span class="stat-value">{fmtPercent(torrent.percentDone)}</span>
				<ProgressBar value={torrent.percentDone} />
			</div>
			<div class="stat">
				<span class="stat-label">Size</span>
				<span class="stat-value">{fmtBytes(torrent.sizeWhenDone)}</span>
				{#if torrent.percentDone < 1}
					<span class="dim">{fmtBytes(torrent.leftUntilDone)} left · ETA {fmtEta(torrent.eta)}</span>
				{/if}
			</div>
			<div class="stat">
				<span class="stat-label">Speeds</span>
				<span class="stat-value">↓ {fmtSpeed(torrent.rateDownload)}</span>
				<span class="dim">↑ {fmtSpeed(torrent.rateUpload)}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Ratio</span>
				<span class="stat-value">{fmtRatio(torrent.uploadRatio)}</span>
				<span class="dim">{fmtBytes(torrent.uploadedEver)} uploaded</span>
			</div>
			<div class="stat">
				<span class="stat-label">Seed time</span>
				<span class="stat-value">{fmtDuration(torrent.secondsSeeding)}</span>
				<span class="dim">peers: ↓{torrent.peersSendingToUs} · ↑{torrent.peersGettingFromUs}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Finished</span>
				<span class="stat-value">{fmtDate(torrent.dateDone)}</span>
				<span class="dim">active {fmtDate(torrent.activityDate)}</span>
			</div>
		</div>

		<div class="card junk-card">
			<div class="card-head">
				<h3>Junk cleanup</h3>
				<div class="card-actions">
					<button class="btn" onclick={() => void runScan()} disabled={scanning || !detail}>
						{scanning ? 'Scanning…' : 'Scan unselected files'}
					</button>
				</div>
			</div>
			<p class="hint">
				Files you unchecked in the list below that still exist on disk. Transmission keeps them
				around after you deselect — delete them here to reclaim space before archiving.
			</p>
			{#if scan && !scan.mapped}
				<p class="warn">
					The download directory <code>{scan.downloadDir}</code> is not mapped into this app.
					Set <code>HOST_DOWNLOAD_DIR</code> in <code>.env</code> to the same path Transmission
					uses, and mount it (see docker-compose.yml).
				</p>
			{:else if scan}
				{#if scan.junk.length === 0}
					<p class="ok-text">No unselected files on disk — nothing to clean. 🎉</p>
				{:else}
					<p>
						<strong>{scan.junk.length}</strong> unselected file(s),
						<strong>{fmtBytes(scan.totalOnDisk)}</strong> on disk.
					</p>
					<ul class="junk-list">
						{#each scan.junk as j (j.index)}
							<li>
								<span class="mono">{j.name}</span>
								<span class="dim">{fmtBytes(j.sizeOnDisk)}</span>
							</li>
						{/each}
					</ul>
					<button class="btn danger" onclick={() => (cleanupConfirmOpen = true)} disabled={scanning}>
						Delete {scan.junk.length} file(s), free {fmtBytes(scan.totalOnDisk)}
					</button>
				{/if}
			{/if}
			{#if cleanupResult && cleanupResult.failed.length > 0}
				<ul class="err-list">
					{#each cleanupResult.failed as f (f.name)}
						<li>{f.name}: {f.error}</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="card files-card">
			<div class="card-head">
				<h3>Files</h3>
				<span class="dim hint">Uncheck a file to stop downloading it and mark it as junk.</span>
			</div>
			{#if fileRows.length === 0}
				<p class="hint">No file details{detail ? ' — magnet metadata may still be downloading.' : ' — loading.'}</p>
			{:else}
				<div class="table-wrap">
					<table class="files-table">
						<thead>
							<tr>
								<th class="col-want"></th>
								<th>Path</th>
								<th class="num">Size</th>
								<th class="num">Progress</th>
							</tr>
						</thead>
						<tbody>
							{#each fileRows as row (row.i)}
								<tr class:unwanted={!row.wanted}>
									<td class="col-want">
										<input
											type="checkbox"
											checked={row.wanted}
											onchange={(e) => void setWanted(row.i, e.currentTarget.checked)}
											aria-label="Download {row.display}"
										/>
									</td>
									<td>
										<span class="file-path" style="padding-left: {row.depth * 16}px">{row.display || row.f.name}</span>
									</td>
									<td class="num">{fmtBytes(row.f.length)}</td>
									<td class="num">{fmtPercent(row.f.length > 0 ? row.completed / row.f.length : 0)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</section>

<Modal open={moveOpen} title="Move to external HDD" onclose={() => (moveOpen = false)}>
	<label class="field">
		<span>Destination path (as Transmission on your Mac sees it)</span>
		<input type="text" placeholder="/Volumes/YourHDD/…" bind:value={moveLocation} />
	</label>
	<label class="check-row">
		<input type="checkbox" bind:checked={moveData} />
		<span>Move data from the current location (uncheck only to re-locate in place)</span>
	</label>
	{#if store.config?.moveDestination}
		<p class="hint">Default from MOVE_DESTINATION: <code>{store.config.moveDestination}</code></p>
	{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (moveOpen = false)} disabled={moveBusy}>Cancel</button>
		<button class="btn primary" onclick={() => void confirmMove()} disabled={moveBusy || !moveLocation.trim()}>
			{moveBusy ? 'Moving…' : 'Move torrent'}
		</button>
	{/snippet}
</Modal>

{#if torrent && removeOpen}
	<Modal open title="Remove torrent" onclose={() => (removeOpen = false)}>
		<p class="confirm-message">Remove <strong>{torrent.name}</strong> from the list?</p>
		<label class="check-row">
			<input type="checkbox" bind:checked={removeDeleteData} />
			<span>
				Also delete downloaded data ({fmtBytes(torrent.sizeWhenDone)}) — <em>cannot be undone</em>
			</span>
		</label>
		<p class="hint">
			After a successful move to HDD, remove <em>without</em> deleting data: the files are
			no longer on the SSD.
		</p>
		{#snippet footer()}
			<button class="btn" onclick={() => (removeOpen = false)} disabled={removeBusy}>Cancel</button>
			<button class="btn danger" onclick={() => void confirmRemove()} disabled={removeBusy}>
				{removeBusy ? 'Removing…' : removeDeleteData ? 'Remove + delete data' : 'Remove from list'}
			</button>
		{/snippet}
	</Modal>
{/if}

<Modal open={cleanupConfirmOpen} title="Delete junk files" onclose={() => (cleanupConfirmOpen = false)}>
	{#if scan}
		<p class="confirm-message">
			Permanently delete <strong>{scan.junk.length}</strong> unselected file(s)
			({fmtBytes(scan.totalOnDisk)}) from disk?
			This cannot be undone.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (cleanupConfirmOpen = false)} disabled={cleaning}>Cancel</button>
		<button class="btn danger" onclick={() => void confirmCleanup()} disabled={cleaning}>
			{cleaning ? 'Deleting…' : 'Delete permanently'}
		</button>
	{/snippet}
</Modal>
