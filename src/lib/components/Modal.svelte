<script lang="ts">
	let {
		open = false,
		title = '',
		onclose,
		children,
		footer
	}: {
		open?: boolean;
		title?: string;
		onclose?: () => void;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	} = $props();
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && open) onclose?.();
	}}
/>

{#if open}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose?.();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') onclose?.();
		}}
	>
		<div class="modal" role="dialog" aria-modal="true" aria-label={title}>
			<header class="modal-head">
				<h3>{title}</h3>
				<button class="icon-btn" aria-label="Close" onclick={() => onclose?.()}>✕</button>
			</header>
			<div class="modal-body">
				{@render children?.()}
			</div>
			{#if footer}
				<footer class="modal-foot">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}
