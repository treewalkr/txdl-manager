<script lang="ts">
	import type { Torrent } from '$lib/types';
	import { statusInfo } from '$lib/status';

	let { torrent }: { torrent: Torrent } = $props();
	const info = $derived(statusInfo(torrent));

	// the console reads state as a colored word, not a badge
	const WORD: Record<string, string> = {
		downloading: 'LEECH',
		seeding: 'SEED',
		paused: 'IDLE',
		queued: 'QUEUE',
		checking: 'CHECK'
	};
	const word = $derived(
		torrent.error !== 0 ? 'ERR' : (WORD[info.key] ?? info.label.toUpperCase())
	);
</script>

<span class="badge st-{info.key}" title={torrent.error !== 0 ? torrent.errorString : undefined}>
	{word}
</span>
