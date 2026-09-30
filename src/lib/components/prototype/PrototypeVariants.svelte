<script lang="ts">
	// PROTOTYPE — variant dispatcher for the torrent-list visual-world
	// exploration (?variant= on "/"). Throwaway; the winning world gets folded
	// into the real design and the rest moves to a throwaway branch.
	import VariantNative from './VariantNative.svelte';
	import VariantTerminal from './VariantTerminal.svelte';
	import VariantLedger from './VariantLedger.svelte';
	import VariantInstrument from './VariantInstrument.svelte';

	let { variant }: { variant: string } = $props();
</script>

{#if variant === 'terminal'}
	<VariantTerminal />
{:else if variant === 'ledger'}
	<VariantLedger />
{:else if variant === 'instrument'}
	<VariantInstrument />
{:else}
	<VariantNative />
{/if}
