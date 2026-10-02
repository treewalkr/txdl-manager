<script lang="ts">
	import { goto } from '$app/navigation';
	import { fmtBytes } from '$lib/format';
	import { untrack } from 'svelte';

	let { data } = $props();

	// remux/transcode streams are piped fMP4: seeking reloads the stream with a
	// new ?t= offset; "direct" seeks natively via currentTime.
	const piped = $derived(data.mode === 'remux' || data.mode === 'transcode');
	const isImage = $derived(data.kind === 'image');

	let videoEl = $state<HTMLVideoElement | undefined>();
	let stageEl = $state<HTMLDivElement | undefined>();

	let src = $state('');
	let offsetBase = $state(0); // seconds requested via ?t= (piped modes)
	let wantPlay = $state(true); // autoplay intent, kept across stream reloads
	let pendingResume = $state(0); // direct-mode resume, applied once metadata loads
	let playing = $state(false);
	let buffering = $state(false);
	let pos = $state(0); // displayed position, seconds
	let dur = $state(0); // refined from load data / loadedmetadata
	let volume = $state(1);
	let muted = $state(false);
	let fullscreen = $state(false);
	let scrub = $state<number | null>(null); // non-null while dragging the timeline
	let resumedNote = $state('');
	let loadError = $state('');
	let listOpen = $state(false); // track-list overlay (persists across switches)
	let switchNote = $state('');

	const MODE_LABEL: Record<string, string> = {
		direct: 'DIRECT',
		remux: 'REMUX',
		transcode: 'TRANSCODE'
	};

	/* ---------- the torrent's playable files ---------- */

	const tracks = $derived(data.tracks ?? []);
	const trackPos = $derived(tracks.findIndex((t) => t.index === data.index));
	const hasPlaylist = $derived(tracks.length >= 2);
	// arrows switch tracks only when there's somewhere to switch to; with a
	// single playable file they keep their volume role
	const switchable = $derived(hasPlaylist && tracks.filter((t) => t.complete).length >= 2);

	function switchTrack(delta: 1 | -1) {
		if (!data.torrent) return;
		let i = trackPos;
		for (;;) {
			i += delta;
			if (i < 0) return note('FIRST TRACK');
			if (i >= tracks.length) return note('LAST TRACK');
			if (tracks[i].complete) {
				void goto(`/torrent/${data.torrent.id}/play?file=${tracks[i].index}`, { noScroll: true });
				return;
			}
		}
	}

	function openTrack(index: number, complete: boolean) {
		if (!complete || !data.torrent || index === data.index) return;
		void goto(`/torrent/${data.torrent.id}/play?file=${index}`, { noScroll: true });
	}

	let switchNoteTimer: ReturnType<typeof setTimeout> | undefined;
	function note(text: string) {
		switchNote = text;
		clearTimeout(switchNoteTimer);
		switchNoteTimer = setTimeout(() => (switchNote = ''), 1500);
	}

	function streamUrl(t: number): string {
		const base = `/api/torrents/${data.torrent?.id}/stream/${data.index}`;
		return piped && t > 0 ? `${base}?t=${Math.floor(t)}` : base;
	}

	function fmtClock(sec: number): string {
		if (!Number.isFinite(sec) || sec < 0) sec = 0;
		const s = Math.floor(sec);
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const mm = String(m).padStart(2, '0');
		const ss = String(s % 60).padStart(2, '0');
		return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
	}

	/* ---------- resume positions (localStorage, best-effort) ---------- */

	const RESUME_KEY = 'txdl.resume.v1';

	function readResume(key: string): number {
		try {
			const map = JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}') as Record<string, number>;
			const v = map[key];
			return Number.isFinite(v) ? v : 0;
		} catch {
			return 0;
		}
	}

	function saveResume(key: string, seconds: number) {
		try {
			const map = JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}') as Record<string, number>;
			map[key] = seconds;
			localStorage.setItem(RESUME_KEY, JSON.stringify(map));
		} catch {
			/* private mode etc. — resume is best-effort */
		}
	}

	function clearResume(key: string) {
		try {
			const map = JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}') as Record<string, number>;
			delete map[key];
			localStorage.setItem(RESUME_KEY, JSON.stringify(map));
		} catch {
			/* ignore */
		}
	}

	/* ---------- seeking ---------- */

	function seekTo(t: number) {
		if (!data.torrent || data.problem) return;
		const target = Math.max(0, Math.min(t, dur || Number.POSITIVE_INFINITY));
		resumedNote = '';
		if (piped) {
			offsetBase = target;
			pos = target;
			loadError = '';
			src = streamUrl(target);
		} else if (videoEl) {
			videoEl.currentTime = target;
		}
	}

	function scrubFromEvent(e: PointerEvent): number {
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		return frac * dur;
	}

	function onScrubDown(e: PointerEvent) {
		if (!dur) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		scrub = scrubFromEvent(e);
	}

	function onScrubMove(e: PointerEvent) {
		if (scrub === null) return;
		scrub = scrubFromEvent(e);
	}

	function onScrubUp() {
		if (scrub === null) return;
		seekTo(scrub);
		scrub = null;
	}

	function onScrubKey(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			e.preventDefault();
			e.stopPropagation();
			seekTo(pos + (e.key === 'ArrowLeft' ? -10 : 10));
		} else if (e.key === 'Home') {
			e.stopPropagation();
			seekTo(0);
		} else if (e.key === 'End') {
			e.stopPropagation();
			seekTo(dur);
		}
	}

	/* ---------- transport ---------- */

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) {
			wantPlay = true;
			void videoEl.play().catch(() => {});
		} else {
			wantPlay = false;
			videoEl.pause();
		}
	}

	function nudge(seconds: number) {
		seekTo((scrub ?? pos) + seconds);
	}

	function toggleMute() {
		muted = !muted;
		if (videoEl) videoEl.muted = muted;
	}

	function setVolume(v: number) {
		volume = Math.max(0, Math.min(1, v));
		muted = volume === 0;
		if (videoEl) {
			videoEl.volume = volume;
			videoEl.muted = muted;
		}
	}

	function onVolumePointer(e: PointerEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		setVolume((e.clientX - rect.left) / rect.width);
	}

	function onVolumeKey(e: KeyboardEvent) {
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			e.stopPropagation();
			setVolume(volume + (e.key === 'ArrowUp' ? 0.1 : -0.1));
		}
	}

	async function toggleFullscreen() {
		if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
		else await stageEl?.requestFullscreen?.().catch(() => {});
	}

	/* ---------- keyboard ---------- */

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return;
		}
		switch (e.key) {
			case ' ':
			case 'k':
			case 'K':
				e.preventDefault();
				togglePlay();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				nudge(-10);
				break;
			case 'ArrowRight':
				e.preventDefault();
				nudge(10);
				break;
			case 'j':
			case 'J':
				nudge(-30);
				break;
			case 'l':
			case 'L':
				nudge(30);
				break;
			case 'ArrowUp':
				e.preventDefault();
				if (switchable) switchTrack(-1);
				else setVolume(volume + 0.1);
				break;
			case 'ArrowDown':
				e.preventDefault();
				if (switchable) switchTrack(1);
				else setVolume(volume - 0.1);
				break;
			case '-':
			case '_':
				setVolume(volume - 0.1);
				break;
			case '=':
			case '+':
				setVolume(volume + 0.1);
				break;
			case 'm':
			case 'M':
				toggleMute();
				break;
			case 'f':
			case 'F':
				void toggleFullscreen();
				break;
			case 't':
			case 'T':
				if (hasPlaylist) listOpen = !listOpen;
				break;
			case 'Escape':
				// close the track list first, then let Esc leave fullscreen /
				// navigate back
				if (listOpen) {
					listOpen = false;
					break;
				}
				if (!document.fullscreenElement) history.back();
				break;
		}
	}

	/* ---------- media element events ---------- */

	function onLoadedMetadata() {
		if (!videoEl) return;
		videoEl.volume = volume;
		videoEl.muted = muted;
		if (!piped && Number.isFinite(videoEl.duration)) dur = videoEl.duration;
		if (pendingResume > 0) {
			videoEl.currentTime = pendingResume;
			pendingResume = 0;
		}
	}

	function onCanPlay() {
		buffering = false;
		if (wantPlay && videoEl?.paused) void videoEl.play().catch(() => {});
	}

	function onTimeUpdate() {
		if (!videoEl) return;
		pos = piped ? offsetBase + videoEl.currentTime : videoEl.currentTime;
		if (Math.abs(pos - lastSaved) > 5) {
			saveResume(`${data.torrent?.hashString}:${data.index}`, pos);
			lastSaved = pos;
		}
	}

	function onEnded() {
		playing = false;
		clearResume(`${data.torrent?.hashString}:${data.index}`);
	}

	/* ---------- per-track init (re-runs on every track switch) ---------- */

	let lastInitIndex = -1;
	let lastSaved = 0;

	$effect(() => {
		if (!data.torrent || data.problem) return;
		const key = `${data.torrent.hashString}:${data.index}`;

		untrack(() => {
			if (lastInitIndex === data.index) return; // same track, don't restart
			lastInitIndex = data.index;

			// reset everything that belongs to the previous track
			pos = 0;
			offsetBase = 0;
			playing = false;
			wantPlay = true;
			buffering = false;
			loadError = '';
			scrub = null;
			pendingResume = 0;
			resumedNote = '';
			lastSaved = 0;
			dur = data.durationSec ?? 0;

			if (isImage) {
				src = streamUrl(0);
				return;
			}

			const saved = readResume(key);
			const startAt = saved > 30 && (dur === 0 || saved < dur - 60) ? saved : 0;
			if (startAt > 0) {
				resumedNote = `resumed at ${fmtClock(startAt)}`;
				if (piped) {
					offsetBase = startAt;
					pos = startAt;
				} else {
					pendingResume = startAt;
				}
			}
			src = streamUrl(startAt);
		});

		const clearNote = setTimeout(() => (resumedNote = ''), 6000);
		const onHide = () => saveResume(key, pos);
		window.addEventListener('pagehide', onHide);
		return () => {
			clearTimeout(clearNote);
			window.removeEventListener('pagehide', onHide);
			// pos still holds the previous track's position at cleanup time
			saveResume(key, pos);
		};
	});
</script>

<svelte:window
	onkeydown={onKeydown}
	onfullscreenchange={() => (fullscreen = Boolean(document.fullscreenElement))}
/>

<section class="player-page">
	{#if data.problem || !data.torrent}
		<header class="player-head">
			<a class="back" href={data.torrent ? `/torrent/${data.torrent.id}` : '/'}>← Back</a>
		</header>
		<div class="player-problem">
			<h3>Cannot play</h3>
			<p>{data.problem?.message}</p>
			{#if data.problem?.hint}
				<p class="dim">{data.problem.hint}</p>
			{/if}
		</div>
	{:else}
		<header class="player-head">
			<a class="back" href={`/torrent/${data.torrent.id}`} title={data.torrent.name}>
				← {data.torrent.name}
			</a>
			<div class="player-meta">
				<span class="player-file">{data.fileName}</span>
				<span class="dim">
					{fmtBytes(data.sizeBytes)} · {data.torrent.downloadDir}
				</span>
			</div>
			{#if data.mode}
				<span class="badge st-{data.mode}">{MODE_LABEL[data.mode]}</span>
			{/if}
		</header>

		<div class="player-stage" bind:this={stageEl}>
			{#if isImage}
				<img {src} alt={data.fileName} draggable="false" onerror={() => (loadError = 'The image could not be loaded.')} />
			{:else}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoEl}
					{src}
					preload="metadata"
					playsinline
					onloadedmetadata={onLoadedMetadata}
					oncanplay={onCanPlay}
					ontimeupdate={onTimeUpdate}
					onplaying={() => (buffering = false)}
					onwaiting={() => (buffering = true)}
					onplay={() => (playing = true)}
					onpause={() => (playing = false)}
					onended={onEnded}
					onerror={() => (loadError = 'The browser could not play this stream.')}
				></video>
			{/if}

			{#if listOpen && tracks.length > 0}
				<div class="player-tracks">
					<div class="player-tracks-head">Tracks ({tracks.length})</div>
					<ul>
						{#each tracks as t, i (t.index)}
							<li>
								<button
									class="track-row"
									class:current={t.index === data.index}
									class:incomplete={!t.complete}
									disabled={!t.complete}
									title={!t.complete ? 'Still downloading' : t.name}
									onclick={() => openTrack(t.index, t.complete)}
								>
									<span class="track-idx">{t.index === data.index ? '▸' : String(i + 1).padStart(2, '0')}</span>
									<span class="track-name">{t.name}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if buffering}
				<div class="player-overlay">BUFFERING</div>
			{:else if loadError}
				<div class="player-overlay err">{loadError}</div>
			{:else if switchNote}
				<div class="player-overlay">{switchNote}</div>
			{:else if !playing && !isImage}
				<button class="player-bigplay" onclick={togglePlay} aria-label="Play">▶</button>
			{/if}
		</div>

		<footer class="player-transport">
			{#if isImage}
				{#if switchable}
					<button class="player-btn" onclick={() => switchTrack(-1)} title="Previous file (↑)" aria-label="Previous file">▲</button>
				{/if}
				{#if hasPlaylist}
					<span class="track-counter">FILE {trackPos + 1}/{tracks.length}</span>
				{/if}
				{#if switchable}
					<button class="player-btn" onclick={() => switchTrack(1)} title="Next file (↓)" aria-label="Next file">▼</button>
				{/if}
				<span class="transport-spacer"></span>
			{:else}
				{#if switchable}
					<button class="player-btn" onclick={() => switchTrack(-1)} title="Previous file (↑)" aria-label="Previous file">▲</button>
				{/if}
				<button class="player-btn" onclick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
					{playing ? '❚❚' : '▶'}
				</button>
				{#if switchable}
					<button class="player-btn" onclick={() => switchTrack(1)} title="Next file (↓)" aria-label="Next file">▼</button>
				{/if}
				<div
					class="timeline"
					role="slider"
					aria-label="Seek"
					aria-valuemin={0}
					aria-valuemax={Math.max(Math.round(dur), 0)}
					aria-valuenow={Math.round(scrub ?? pos)}
					tabindex="0"
					onpointerdown={onScrubDown}
					onpointermove={onScrubMove}
					onpointerup={onScrubUp}
					onpointercancel={onScrubUp}
					onkeydown={onScrubKey}
				>
					<div class="timeline-fill" style="width: {dur > 0 ? Math.min(((scrub ?? pos) / dur) * 100, 100) : 0}%"></div>
				</div>
				<span class="player-clock num">{fmtClock(scrub ?? pos)} / {fmtClock(dur)}</span>
				<button class="player-btn" onclick={toggleMute} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}>
					{muted || volume === 0 ? '×' : '♪'}
				</button>
				<div
					class="vol-meter"
					role="slider"
					aria-label="Volume"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
					tabindex="0"
					onpointerdown={onVolumePointer}
					onkeydown={onVolumeKey}
				>
					<span class="blocks-chars">
						{'█'.repeat(Math.round((muted ? 0 : volume) * 8)) + '░'.repeat(8 - Math.round((muted ? 0 : volume) * 8))}
					</span>
				</div>
				{#if hasPlaylist}
					<span class="track-counter">TRACK {trackPos + 1}/{tracks.length}</span>
				{/if}
			{/if}
			{#if hasPlaylist}
				<button
					class="player-btn"
					onclick={() => (listOpen = !listOpen)}
					aria-pressed={listOpen}
					title="Track list (T)"
				>
					≡
				</button>
			{/if}
			{#if resumedNote}
				<span class="player-note dim">{resumedNote}</span>
			{/if}
			<button class="player-btn" onclick={toggleFullscreen} aria-label="Fullscreen">
				{fullscreen ? '⤡' : '⛶'}
			</button>
		</footer>
	{/if}
</section>
