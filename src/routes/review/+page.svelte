<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { fmtBytes } from '$lib/format';
	import { extOf } from '$lib/media';
	import { readReviewPrefs, reviewKey, writeReviewPrefs } from '$lib/review';
	import { store } from '$lib/stores/torrents.svelte';
	import type { ReviewClearResult, ReviewItem } from '$lib/types';

	/* ---------- deck state ---------- */

	let loading = $state(true);
	let loadError = $state('');
	/** Cards still awaiting a decision, in review order. */
	let queue = $state<ReviewItem[]>([]);
	/** Deck size at load — the progress denominator. */
	let total = $state(0);
	let rejected = $state<ReviewItem[]>([]);
	let lastAction = $state<{ item: ReviewItem; verb: 'remove' | 'keep' | 'skip' } | null>(null);

	const current = $derived(queue[0] ?? null);
	const next = $derived(queue[1] ?? null);
	const doneCount = $derived(total - queue.length);
	const rejectedBytes = $derived(rejected.reduce((s, r) => s + r.length, 0));

	/* ---------- kept/cleared decisions (localStorage, best-effort) ---------- */

	let kept = new Set<string>();
	let cleared = new Set<string>();

	function savePrefs() {
		writeReviewPrefs({ kept: [...kept], cleared: [...cleared] });
	}

	/* ---------- loading ---------- */

	async function load() {
		loading = true;
		loadError = '';
		try {
			const res = await fetch('/api/review');
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
			queue = (body.deck as ReviewItem[]).filter((i) => !kept.has(reviewKey(i)));
			total = queue.length;
			rejected = (body.rejected as ReviewItem[]).filter((i) => !cleared.has(reviewKey(i)));
			lastAction = null;
			resetCard();
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function startOver() {
		kept = new Set();
		cleared = new Set();
		savePrefs();
		void load();
	}

	onMount(() => {
		const p = readReviewPrefs();
		kept = new Set(p.kept);
		cleared = new Set(p.cleared);
		void load();
	});

	/* ---------- decisions ---------- */

	let busy = $state(false); // a decision is in flight (server round-trip)
	let flying = $state<'out-left' | 'out-right' | null>(null);

	function resetCard() {
		flying = null;
		dragging = false;
		dragX = 0;
		videoStarted = false;
		mediaError = '';
	}

	// deselecting via store.act would toast on every swipe — too noisy for a
	// card flow; errors still surface through the flash message
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

	async function decide(verb: 'remove' | 'keep' | 'skip') {
		const item = current;
		if (!item || busy || flying) return;
		if (verb !== 'skip') flying = verb === 'remove' ? 'out-left' : 'out-right';
		busy = true;
		try {
			if (verb === 'remove') {
				if (!(await setWanted(item, false))) {
					flying = null;
					dragX = 0; // snap back — the toast already says why
					return;
				}
				rejected = [item, ...rejected];
				void store.refresh();
				void store.refreshJunk();
			} else if (verb === 'keep') {
				kept.add(reviewKey(item));
				savePrefs();
			}
			lastAction = { item, verb };
			if (flying) await new Promise((r) => setTimeout(r, FLY_MS));
			queue = queue.slice(1);
			resetCard();
		} finally {
			busy = false;
		}
	}

	async function undo() {
		const last = lastAction;
		if (!last || busy || flying) return;
		busy = true;
		try {
			if (last.verb === 'remove') {
				if (!(await setWanted(last.item, true))) return;
				rejected = rejected.filter((r) => reviewKey(r) !== reviewKey(last.item));
				void store.refresh();
				void store.refreshJunk();
			} else if (last.verb === 'keep') {
				kept.delete(reviewKey(last.item));
				savePrefs();
			}
			queue = [last.item, ...queue];
			lastAction = null;
			resetCard();
		} finally {
			busy = false;
		}
	}

	/* ---------- drag gesture ---------- */

	const DRAG_COMMIT_PX = 90;
	const FLY_MS = 120;

	let dragging = $state(false);
	let dragX = $state(0);
	let dragStartX = 0;

	function onCardPointerDown(e: PointerEvent) {
		if (!current || busy || flying) return;
		// buttons/links/native video controls must keep their own clicks — a
		// drag started there (or pointer capture) would swallow them
		const target = e.target as HTMLElement;
		if (target.closest('button, a, video')) return;
		dragging = true;
		dragStartX = e.clientX;
	}

	// move/up live on the window: a drag that leaves the card must keep
	// tracking, without capturing the pointer away from child elements
	function onWindowPointerMove(e: PointerEvent) {
		if (!dragging) return;
		dragX = e.clientX - dragStartX;
	}

	function onCardPointerUp() {
		if (!dragging) return;
		dragging = false;
		if (dragX <= -DRAG_COMMIT_PX) void decide('remove');
		else if (dragX >= DRAG_COMMIT_PX) void decide('keep');
		else dragX = 0;
	}

	const cardTransform = $derived(
		flying === 'out-left' ? 'translateX(-120%)' : flying === 'out-right' ? 'translateX(120%)' : `translateX(${dragX}px)`
	);
	const removeOpa = $derived(
		flying === 'out-left' ? 1 : dragX < 0 ? Math.min(1, -dragX / DRAG_COMMIT_PX) : 0
	);
	const keepOpa = $derived(
		flying === 'out-right' ? 1 : dragX > 0 ? Math.min(1, dragX / DRAG_COMMIT_PX) : 0
	);

	/* ---------- media rendering ---------- */

	let videoStarted = $state(false);
	let mediaError = $state('');
	let videoEl = $state<HTMLVideoElement | undefined>();

	function streamUrl(item: ReviewItem): string {
		return `/api/torrents/${item.torrentId}/stream/${item.index}`;
	}

	// the ▶ click counts as a user gesture, but autoplay on a freshly created
	// element can still be refused — retry muted (preview sound off, controls on)
	function onVideoCanPlay() {
		if (!videoEl || !videoEl.paused) return;
		videoEl.play().catch(() => {
			if (!videoEl) return;
			videoEl.muted = true;
			videoEl.play().catch(() => {});
		});
	}

	/* ---------- clear (the unwanted list) ---------- */

	let clearOpen = $state(false);
	let clearing = $state(false);
	let clearResult = $state<ReviewClearResult | null>(null);

	function locationAllowed(dir: string): boolean {
		return store.locations.some((loc) => {
			const l = loc.replace(/\/+$/, '') || '/';
			return dir === l || dir.startsWith(l + '/');
		});
	}

	const blockedRejected = $derived(rejected.filter((r) => !locationAllowed(r.downloadDir)));

	async function doClear() {
		if (rejected.length === 0 || clearing) return;
		clearing = true;
		try {
			const res = await fetch('/api/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items: rejected.map((r) => ({ id: r.torrentId, index: r.index }))
				})
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
			clearResult = json as ReviewClearResult;
			if (clearResult.failed.length === 0 && clearResult.skipped.length === 0) {
				store.setFlash(`Cleared ${clearResult.deleted} file(s), freed ${fmtBytes(clearResult.freed)}`);
				// Transmission keeps the file entry after a disk delete — remember
				// cleared cards so they don't reappear in the rejected list
				for (const r of rejected) cleared.add(reviewKey(r));
				savePrefs();
			} else {
				store.setFlash(
					`Cleared ${clearResult.deleted}, freed ${fmtBytes(clearResult.freed)} — ${clearResult.failed.length + clearResult.skipped.length} not deleted`,
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

	/* ---------- keyboard ---------- */

	function onKeydown(e: KeyboardEvent) {
		if (clearOpen) return;
		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				void decide('remove');
				break;
			case 'ArrowRight':
				e.preventDefault();
				void decide('keep');
				break;
			case 'ArrowDown':
			case 's':
			case 'S':
				e.preventDefault();
				void decide('skip');
				break;
			case 'z':
			case 'Z':
			case 'u':
			case 'U':
				void undo();
				break;
			case 'Escape':
				void goto('/');
				break;
		}
	}
</script>

<svelte:window
	onkeydown={onKeydown}
	onpointermove={onWindowPointerMove}
	onpointerup={onCardPointerUp}
	onpointercancel={onCardPointerUp}
/>

<section class="page review-page">
	<header class="review-head">
		<a class="back" href="/">← All torrents</a>
		<h2>MEDIA REVIEW</h2>
		<a class="review-link" href="/review/manage" title="View and change every keep/remove decision">
			manage ▸
		</a>
		<span class="review-prog dim">{loading ? '…' : `${doneCount}/${total} reviewed`}</span>
		<div class="review-head-right">
			<button class="btn sm" onclick={startOver} title="Forget kept/cleared decisions and start fresh">
				Start over
			</button>
		</div>
	</header>

	{#if loading}
		<div class="empty-state">
			<h3>Loading…</h3>
			<p>Collecting fully-downloaded videos and images across all torrents.</p>
		</div>
	{:else if loadError}
		<div class="empty-state">
			<h3>Cannot load the review deck</h3>
			<p class="err">{loadError}</p>
			<button class="btn" onclick={() => void load()}>Retry</button>
		</div>
	{:else if !current}
		<div class="empty-state">
			<h3>Nothing left to review</h3>
			<p>
				{total === 0
					? 'No fully-downloaded videos or images in any torrent.'
					: 'Every media file has a decision. Rejected files wait below until you clear them.'}
			</p>
		</div>
	{:else}
		<div class="review-stage">
			{#if next}
				<div class="review-card review-next" aria-hidden="true">
					<span class="dim">next: {next.name}</span>
				</div>
			{/if}
			{#key reviewKey(current)}
				<!-- the drag gesture mirrors the REMOVE/KEEP buttons and arrow keys -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="review-card review-current"
					class:dragging
					style:transform={cardTransform}
					onpointerdown={onCardPointerDown}
				>
					<div class="review-media-wrap">
						{#if current.kind === 'image'}
							<img
								class="review-media"
								src={streamUrl(current)}
								alt={current.name}
								draggable="false"
								onerror={() => (mediaError = 'image could not be loaded — moved or deleted?')}
							/>
						{:else if videoStarted}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								bind:this={videoEl}
								class="review-media"
								src={streamUrl(current)}
								controls
								autoplay
								playsinline
								preload="metadata"
								oncanplay={onVideoCanPlay}
								onerror={() => (mediaError = 'stream failed — open in the player instead')}
							></video>
						{:else}
							<button class="review-play" onclick={() => (videoStarted = true)} aria-label="Preview video inline">
								▶
							</button>
							<span class="review-video-hint">.{extOf(current.name)} · preview on click</span>
						{/if}
						{#if mediaError}
							<div class="review-media-err">{mediaError}</div>
						{/if}
						{#if removeOpa > 0}
							<span class="review-stamp nope" style:opacity={removeOpa}>REMOVE</span>
						{/if}
						{#if keepOpa > 0}
							<span class="review-stamp like" style:opacity={keepOpa}>KEEP</span>
						{/if}
					</div>
					<div class="review-meta">
						<span class="badge">{current.kind.toUpperCase()}</span>
						<span class="review-file" title={current.name}>{current.name}</span>
						<span class="dim">{fmtBytes(current.length)}</span>
						<a class="review-open" href={`/torrent/${current.torrentId}/play?file=${current.index}`}>
							player ↗
						</a>
					</div>
					<div class="review-from dim" title={current.downloadDir}>
						in {current.torrentName} · {current.downloadDir}
					</div>
				</div>
			{/key}
		</div>

		<div class="review-actions">
			<button
				class="btn danger"
				onclick={() => void decide('remove')}
				disabled={busy || !current}
				title="Deselect this file (← or drag left)"
			>
				✕ REMOVE
			</button>
			<button class="btn" onclick={() => void undo()} disabled={!lastAction || busy} title="Undo the last decision (Z)">
				↩ UNDO
			</button>
			<button class="btn" onclick={() => void decide('skip')} disabled={busy || !current} title="Decide later (↓)">
				SKIP
			</button>
			<button
				class="btn green"
				onclick={() => void decide('keep')}
				disabled={busy || !current}
				title="Keep this file (→ or drag right)"
			>
				✓ KEEP
			</button>
		</div>
	{/if}

	<footer class="review-foot">
		<span class="review-rej" title="Files you rejected — deselected in Transmission, still on disk">
			✦ REJECTED {rejected.length} · ~{fmtBytes(rejectedBytes)}
		</span>
		<button class="btn danger sm" onclick={() => (clearOpen = true)} disabled={rejected.length === 0}>
			CLEAR…
		</button>
		<span class="hint">← remove · → keep · ↓ skip · Z undo · drag the card</span>
		{#if clearResult && (clearResult.failed.length > 0 || clearResult.skipped.length > 0)}
			<ul class="err-list">
				{#each clearResult.skipped as s (s.torrent + s.reason)}
					<li>{s.torrent}: {s.reason}</li>
				{/each}
				{#each clearResult.failed as f (f.name + f.error)}
					<li>{f.name}: {f.error}</li>
				{/each}
			</ul>
		{/if}
	</footer>
</section>

<Modal open={clearOpen} title="Clear rejected media" onclose={() => (clearOpen = false)}>
	<p class="confirm-message">
		Deselect and permanently delete <strong>{rejected.length}</strong> rejected media file(s)
		(~{fmtBytes(rejectedBytes)}) from disk? This cannot be undone.
	</p>
	{#if blockedRejected.length > 0}
		<p class="warn">
			{blockedRejected.length} file(s) sit in locations not enabled for cleanup — they will be
			deselected but not deleted. Enable the location on the torrent's page to finish the job.
		</p>
	{/if}
	{#snippet footer()}
		<button class="btn" onclick={() => (clearOpen = false)} disabled={clearing}>Cancel</button>
		<button class="btn danger" onclick={() => void doClear()} disabled={clearing}>
			{clearing ? 'Clearing…' : `Clear ${rejected.length} file(s)`}
		</button>
	{/snippet}
</Modal>
