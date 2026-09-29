<script lang="ts">
	import type { Torrent } from '$lib/types';
	import { statusInfo } from '$lib/status';

	let { torrent }: { torrent: Torrent } = $props();
	const info = $derived(statusInfo(torrent));
</script>

<span class="badge st-{info.key}" title={torrent.error !== 0 ? torrent.errorString : undefined}>
	{info.label}
</span>
