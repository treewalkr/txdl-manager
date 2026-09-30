<script lang="ts">
	let { value = 0, done = false }: { value?: number; done?: boolean } = $props();
	const pct = $derived(Math.min(100, Math.max(0, value * 100)));
	const cells = $derived(Math.round(pct / 10));
</script>

<!-- block-character gauge — the console's progress bar -->
<span
	class="blocks {(done || pct >= 100) ? 'done' : ''}"
	role="progressbar"
	aria-valuenow={Math.round(pct)}
	aria-valuemin={0}
	aria-valuemax={100}
>
	<span class="blocks-chars" aria-hidden="true">{'█'.repeat(cells)}{'░'.repeat(10 - cells)}</span>
</span>
