<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { fmtSpeed } from '$lib/format';
	import { store } from '$lib/stores/torrents.svelte';

	let { children } = $props();

	const downTotal = $derived(store.torrents.reduce((s, t) => s + t.rateDownload, 0));
	const upTotal = $derived(store.torrents.reduce((s, t) => s + t.rateUpload, 0));

	$effect(() => store.start());

	// the pre-paint script in app.html owns the attribute; this mirrors it for the icon
	let theme = $state<'dark' | 'light'>(browser && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		if (theme === 'light') {
			document.documentElement.dataset.theme = 'light';
		} else {
			delete document.documentElement.dataset.theme;
		}
		localStorage.setItem('theme', theme);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>txdl — transmission manager</title>
</svelte:head>

<div class="app">
	<header class="topbar">
		<a class="brand" href="/">
			txdl<span class="brand-sub">transmission manager</span>
		</a>
		<div class="top-stats" class:live={store.connected}>
			<span title="Total download speed">↓ {fmtSpeed(downTotal)}</span>
			<span title="Total upload speed">↑ {fmtSpeed(upTotal)}</span>
		</div>
		<span
			class="conn {store.connected ? 'on' : 'off'}"
			title={store.connected ? `Transmission ${store.session?.version ?? ''} — ${store.config?.rpcUrl ?? ''}` : (store.error ?? 'Connecting…')}
		>
			<span class="conn-dot"></span>
			{store.connected ? (store.session?.version ? `v${store.session.version}` : 'connected') : 'offline'}
		</span>
		<button
			class="icon-btn"
			onclick={toggleTheme}
			title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
			aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		>
			{#if theme === 'dark'}
				<!-- sun: the theme you'd switch to -->
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
				</svg>
			{:else}
				<!-- moon: the theme you'd switch to -->
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
				</svg>
			{/if}
		</button>
	</header>

	<main>
		{@render children()}
	</main>
</div>

{#if store.flash}
	<div class="toast {store.flash.tone}" role={store.flash.tone === 'error' ? 'alert' : 'status'}>
		{store.flash.message}
	</div>
{/if}
