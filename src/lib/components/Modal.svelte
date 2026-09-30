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

	let dialog: HTMLElement | undefined = $state();

	const FOCUSABLE = [
		'button:not(:disabled)',
		'[href]',
		'input:not(:disabled)',
		'select:not(:disabled)',
		'textarea:not(:disabled)',
		'[tabindex]:not([tabindex="-1"])'
	].join(', ');

	// focus enters the dialog with the keyboard trap below; leaves back where it came from
	$effect(() => {
		if (!open) return;
		const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const t = setTimeout(() => dialog?.focus(), 0);
		return () => {
			clearTimeout(t);
			restore?.focus();
		};
	});

	function onWindowKeydown(e: KeyboardEvent) {
		if (!open || !dialog) return;
		if (e.key === 'Escape') {
			// keep Escape from also clearing the row selection behind the dialog
			e.stopImmediatePropagation();
			onclose?.();
			return;
		}
		if (e.key !== 'Tab') return;
		const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
			(el) => el.offsetParent !== null
		);
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		if (e.shiftKey && (active === first || active === dialog)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && (active === last || active === dialog)) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose?.();
		}}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			bind:this={dialog}
		>
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
