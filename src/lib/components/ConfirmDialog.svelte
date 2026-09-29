<script lang="ts">
	import Modal from './Modal.svelte';

	let {
		open = false,
		title = 'Confirm',
		message = '',
		confirmLabel = 'Confirm',
		danger = false,
		busy = false,
		onconfirm,
		onclose
	}: {
		open?: boolean;
		title?: string;
		message?: string;
		confirmLabel?: string;
		danger?: boolean;
		busy?: boolean;
		onconfirm?: () => void;
		onclose?: () => void;
	} = $props();
</script>

<Modal {open} {title} {onclose}>
	<p class="confirm-message">{message}</p>
	{#snippet footer()}
		<button class="btn" onclick={() => onclose?.()} disabled={busy}>Cancel</button>
		<button class="btn {danger ? 'danger' : 'primary'}" onclick={() => onconfirm?.()} disabled={busy}>
			{busy ? 'Working…' : confirmLabel}
		</button>
	{/snippet}
</Modal>
