<script lang="ts">
	import { fmtBytes } from '$lib/format';
	import { untrack } from 'svelte';

	let { data } = $props();

	// remux/transcode streams are piped fMP4: seeking reloads the stream with a
	// new ?t= offset; "direct" seeks natively via currentTime.
	const piped = $derived(data.mode === 'remux' || data.mode === 'transcode');

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

	const MODE_LABEL: Record<string, string> = {
		direct: 'DIRECT',
		remux: 'REMUX',
		transcode: 'TRANSCODE'
	};

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
	const resumeKey = $derived(`${data.torrent?.hashString ?? ''}:${data.index}`);

	function readResume(): number {
		try {
			const map = JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}') as Record<string, number>;
			const v = map[resumeKey];
			return Number.isFinite(v) ? v : 0;
		} catch {
			return 0;
		}
	}

	let lastSaved = 0;
	function saveResume(seconds: number) {
		try {
			const map = JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}') as Record<string, number>;
			map[resumeKey] = seconds;
			localStorage.setItem(RESUME_KEY, JSON.stringify(map));
			lastSaved = seconds;
		} catch {
			/* private mode etc. — resume is best-effort */
		}
	}

	function clearResume() {
		try {
			const map = JSON.parse(localStorage.getItem(RESUME_KEY) ?? '{}') as Record<string, number>;
			delete map[resumeKey];
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
				setVolume(volume + 0.1);
				break;
			case 'ArrowDown':
				e.preventDefault();
				setVolume(volume - 0.1);
				break;
			case 'm':
			case 'M':
				toggleMute();
				break;
			case 'f':
			case 'F':
				void toggleFullscreen();
				break;
			case 'Escape':
				// let the browser exit fullscreen on its own; otherwise leave
				if (!document.fullscreenElement) history.back();
				break;
		}
	}

	/* ---------- video element events ---------- */

	function onLoadedMetadata() {
		if (!piped && videoEl && Number.isFinite(videoEl.duration)) dur = videoEl.duration;
		if (pendingResume > 0 && !piped && videoEl) {
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
		if (Math.abs(pos - lastSaved) > 5) saveResume(pos);
	}

	function onEnded() {
		playing = false;
		clearResume();
	}

	/* ---------- mount: initial source + resume ---------- */

	// One-shot init on mount; `data` is static for this navigation, everything
	// else is read untracked so later dur/src writes don't re-run this.
	$effect(() => {
		if (!data.torrent || data.problem) return;

		untrack(() => {
			if (dur === 0 && data.durationSec) dur = data.durationSec;
			const saved = readResume();
			const startAt = saved > 30 && (dur === 0 || saved < dur - 60) ? saved : 0;
			if (startAt > 0) {
				resumedNote = `resumed at ${fmtClock(startAt)}`;
				if (piped) {
					offsetBase = startAt;
					pos = startAt;
					src = streamUrl(startAt);
				} else {
					pendingResume = startAt;
				}
			}
			if (src === '') src = streamUrl(0);
		});

		const clearNote = setTimeout(() => (resumedNote = ''), 6000);
		const onHide = () => saveResume(pos);
		window.addEventListener('pagehide', onHide);
		return () => {
			clearTimeout(clearNote);
			window.removeEventListener('pagehide', onHide);
			saveResume(pos);
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
			<span class="badge st-{data.mode}">{MODE_LABEL[data.mode ?? '']}</span>
		</header>

		<div class="player-stage" bind:this={stageEl}>
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
			{#if buffering}
				<div class="player-overlay">BUFFERING</div>
			{:else if loadError}
				<div class="player-overlay err">{loadError}</div>
			{:else if !playing}
				<button class="player-bigplay" onclick={togglePlay} aria-label="Play">▶</button>
			{/if}
		</div>

		<footer class="player-transport">
			<button class="player-btn" onclick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
				{playing ? '❚❚' : '▶'}
			</button>
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
			{#if resumedNote}
				<span class="player-note dim">{resumedNote}</span>
			{/if}
			<button class="player-btn" onclick={toggleFullscreen} aria-label="Fullscreen">
				{fullscreen ? '⤡' : '⛶'}
			</button>
		</footer>
	{/if}
</section>
