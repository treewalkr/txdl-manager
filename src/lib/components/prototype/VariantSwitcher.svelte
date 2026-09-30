<script lang="ts">
	// PROTOTYPE — floating variant switcher (see the `prototype` skill, UI
	// branch). Deliberately styled as evaluation chrome, not as part of any
	// variant's world. Rendered in dev only, whenever ?variant= prototyping is
	// active. Throwaway.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	const VARIANTS = [
		{ key: '', label: 'Current design' },
		{ key: 'native', label: 'A · Native Mac' },
		{ key: 'terminal', label: 'B · Terminal' },
		{ key: 'ledger', label: 'C · Ledger' },
		{ key: 'instrument', label: 'D · Instrument' }
	];

	const currentKey = $derived(page.url.searchParams.get('variant') ?? '');
	const index = $derived(Math.max(0, VARIANTS.findIndex((v) => v.key === currentKey)));

	function go(i: number) {
		const v = VARIANTS[((i % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
		const params = new URLSearchParams(page.url.searchParams);
		if (v.key) params.set('variant', v.key);
		else params.delete('variant');
		const qs = params.toString();
		void goto(page.url.pathname + (qs ? `?${qs}` : ''), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function onKeydown(e: KeyboardEvent) {
		// don't fight text entry or the incumbent Name-column resize handle
		if (
			e.target instanceof Element &&
			e.target.closest('input, textarea, select, [contenteditable], .col-resize')
		)
			return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			go(index - 1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			go(index + 1);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="proto-bar" role="toolbar" aria-label="Prototype variant switcher">
	<button class="nav" onclick={() => go(index - 1)} aria-label="Previous variant">◀</button>
	<span class="label">
		<span class="tag">PROTOTYPE</span>
		<strong>{VARIANTS[index]?.label ?? 'Current design'}</strong>
		<span class="pos">{index + 1}/{VARIANTS.length}</span>
		<span class="hint" aria-hidden="true">← →</span>
	</span>
	<button class="nav" onclick={() => go(index + 1)} aria-label="Next variant">▶</button>
</div>

<style>
	.proto-bar {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 999;
		display: flex;
		align-items: center;
		gap: 10px;
		background: #16161a;
		color: #f2f2f4;
		border: 1px solid #000;
		border-radius: 8px;
		padding: 6px 8px;
		font:
			12px/1.4 -apple-system,
			BlinkMacSystemFont,
			sans-serif;
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
	}

	.nav {
		border: 1px solid #3c3c44;
		background: #23232a;
		color: #f2f2f4;
		border-radius: 5px;
		width: 26px;
		height: 24px;
		font-size: 10px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.nav:hover {
		background: #32323b;
	}

	.label {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 0 6px;
		white-space: nowrap;
	}

	.tag {
		background: #f5b800;
		color: #16161a;
		font-weight: 700;
		font-size: 9.5px;
		letter-spacing: 0.07em;
		padding: 1.5px 6px;
		border-radius: 4px;
	}

	.pos {
		color: #8b8b96;
		font-variant-numeric: tabular-nums;
	}

	.hint {
		color: #8b8b96;
		border: 1px solid #3c3c44;
		border-radius: 4px;
		padding: 0 5px;
		font-size: 10.5px;
	}
</style>
