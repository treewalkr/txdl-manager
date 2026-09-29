<script lang="ts">
	let { value = 0, done = false }: { value?: number; done?: boolean } = $props();
	const pct = $derived(Math.min(100, Math.max(0, value * 100)));
</script>

<div class="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
	<div class="progress-fill {(done || pct >= 100) ? 'done' : ''}" style="width: {pct}%"></div>
</div>
