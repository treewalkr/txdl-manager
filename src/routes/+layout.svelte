<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { fmtSpeed } from '$lib/format';
	import { store } from '$lib/stores/torrents.svelte';

	let { children } = $props();

	const downTotal = $derived(store.torrents.reduce((s, t) => s + t.rateDownload, 0));
	const upTotal = $derived(store.torrents.reduce((s, t) => s + t.rateUpload, 0));

	$effect(() => store.start());
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
