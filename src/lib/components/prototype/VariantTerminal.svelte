<script lang="ts">
	// PROTOTYPE variant B — "Terminal": the seeder's console instrument.
	// Full-bleed monospace grid, ANSI-hue semantics, inverted-video selection,
	// keybind legend. No chrome, no radius, no glow. Throwaway.
	import { SvelteSet } from 'svelte/reactivity';
	import { MOCK_SELECTED_ID, MOCK_SESSION, MOCK_TORRENTS } from './mock';
	import { hrInfo } from '$lib/hr';
	import { isArchiveReady, statusInfo } from '$lib/status';
	import { fmtBytes, fmtHours, fmtRatio, fmtSpeed } from '$lib/format';

	type Row = {
		t: (typeof MOCK_TORRENTS)[number];
		st: ReturnType<typeof statusInfo>;
		hr: ReturnType<typeof hrInfo>;
		ready: boolean;
	};

	const rows: Row[] = MOCK_TORRENTS.map((t) => ({
		t,
		st: statusInfo(t),
		hr: hrInfo(t, false),
		ready: isArchiveReady(t, false)
	}));

	const totals = {
		down: rows.reduce((s, r) => s + r.t.rateDownload, 0),
		up: rows.reduce((s, r) => s + r.t.rateUpload, 0),
		hr: rows.filter((r) => r.hr.inGroup).length,
		ready: rows.filter((r) => r.ready).length
	};

	const selected = new SvelteSet<number>([MOCK_SELECTED_ID]);
	const selectedRows = $derived(rows.filter((r) => selected.has(r.t.id)));
	const selectedBytes = $derived(selectedRows.reduce((s, r) => s + r.t.sizeWhenDone, 0));

	const stateWord = (r: Row) =>
		({ downloading: 'LEECH', seeding: 'SEED', paused: 'IDLE', queued: 'QUEUE', checking: 'CHECK' })[r.st.key];

	function toggle(id: number) {
		selected.has(id) ? selected.delete(id) : selected.add(id);
	}

	/** character-cell progress: filled + empty blocks out of 10 */
	function blocks(p: number) {
		const f = Math.round(p * 10);
		return '█'.repeat(f) + '░'.repeat(10 - f);
	}
</script>

<div class="crt">
	<header class="statusline">
		<span class="host">txdl@macbook</span>
		<span class="sep">—</span>
		<span class="dim">transmission {MOCK_SESSION.version}</span>
		<span class="lamp on" aria-label="online">●</span>
		<span class="dim">online</span>
		<span class="right">
			<span class="dim">↓</span> <span class="bright">{fmtSpeed(totals.down)}</span>
			<span class="dim">↑</span> <span class="bright">{fmtSpeed(totals.up)}</span>
		</span>
	</header>

	<div class="meters">
		<span class="meter"><span class="dim">TORRENTS</span> <span class="bright">{rows.length}</span></span>
		<span class="meter"><span class="dim">HR OWED</span> <span class="yellow">{totals.hr}</span></span>
		<span class="meter"><span class="dim">READY</span> <span class="green">{totals.ready}</span></span>
		<span class="meter hintm">seed ≤1 GiB 12h · ≤5 GiB 24h · &gt;5 GiB 48h</span>
	</div>

	<div class="grid">
		<table>
			<thead>
				<tr>
					<th class="c-name">NAME</th>
					<th class="num">SIZE</th>
					<th class="c-done">DONE</th>
					<th class="num">SEED</th>
					<th class="num">RATIO</th>
					<th class="num">DOWN</th>
					<th class="num">UP</th>
					<th>STATE</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.t.id)}
					<tr class:selected={selected.has(r.t.id)} onclick={() => toggle(r.t.id)} aria-selected={selected.has(r.t.id)}>
						<td class="c-name" title={r.t.name}><span class="nm">{r.t.name}</span></td>
						<td class="num">{fmtBytes(r.t.sizeWhenDone)}</td>
						<td class="c-done">
							{#if r.t.percentDone < 1}
								<span class="dim">[</span><span class="cyan">{blocks(r.t.percentDone)}</span><span class="dim">]</span>
								<span class="dim">{Math.round(r.t.percentDone * 100)}%</span>
							{:else if r.ready}
								<span class="green">done·ok</span>
							{:else}
								<span class="dim">done</span>
							{/if}
						</td>
						<td class="num">
							{#if r.hr.met}
								<span class="green">✓</span>
							{:else}
								<span class="yellow">{fmtHours(r.hr.seeded)}/{fmtHours(r.hr.required)}h</span>
							{/if}
						</td>
						<td class="num">{fmtRatio(r.t.uploadRatio)}</td>
						<td class="num dim">{fmtSpeed(r.t.rateDownload)}</td>
						<td class="num dim">{fmtSpeed(r.t.rateUpload)}</td>
						<td><span class="st st-{r.st.key}">{stateWord(r)}</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<footer class="cmdline">
		{#if selectedRows.length > 0}
			<span class="bright">{selectedRows.length} sel · {fmtBytes(selectedBytes)}</span>
			<span class="dim">—</span>
			<span class="key">[r]esume</span>
			<span class="key">[p]ause</span>
			<span class="key">[m]ove to hdd</span>
			<span class="key warn">[x]remove</span>
			<span class="dim">esc clears</span>
		{:else}
			<span class="dim">↑↓ select · ↵ open · space pause · m move · x remove · / search · a add</span>
		{/if}
	</footer>
</div>

<style>
	.crt {
		min-height: 100dvh;
		background: #0d110e;
		color: #93a093;
		font:
			12.5px/1.5 ui-monospace,
			'SF Mono',
			SFMono-Regular,
			Menlo,
			Consolas,
			monospace;
		display: flex;
		flex-direction: column;
		padding: 10px 14px 64px;
		box-sizing: border-box;
	}

	.dim {
		color: #6a746b;
	}

	.bright {
		color: #dde8da;
	}

	.green {
		color: #52c25d;
	}

	.yellow {
		color: #d6b849;
	}

	.cyan {
		color: #4cc2c8;
	}

	/* ---------- header ---------- */

	.statusline {
		display: flex;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid #26302a;
		padding-bottom: 7px;
	}

	.host {
		color: #dde8da;
		font-weight: 700;
	}

	.sep {
		color: #57625a;
	}

	.lamp {
		margin-left: 10px;
	}

	.lamp.on {
		color: #52c25d;
	}

	.right {
		margin-left: auto;
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.meters {
		display: flex;
		gap: 26px;
		padding: 8px 0;
		border-bottom: 1px solid #26302a;
	}

	.meter {
		display: flex;
		gap: 7px;
		align-items: baseline;
	}

	.meter .bright,
	.meter .yellow,
	.meter .green {
		font-size: 15px;
		font-weight: 700;
	}

	.hintm {
		margin-left: auto;
	}

	/* ---------- grid ---------- */

	.grid {
		flex: 1;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 820px;
	}

	th {
		text-align: left;
		font-weight: 600;
		font-size: 10.5px;
		letter-spacing: 0.05em;
		color: #6a746b;
		padding: 8px 10px 6px;
		border-bottom: 1px solid #26302a;
		white-space: nowrap;
		position: sticky;
		top: 0;
		background: #0d110e;
	}

	th.num {
		text-align: right;
	}

	td {
		padding: 5px 10px;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	td.num {
		text-align: right;
	}

	tbody tr {
		cursor: default;
	}

	tbody tr:hover {
		background: #131a14;
	}

	/* inverted video — the terminal's selection */
	tbody tr.selected {
		background: #dde8da;
		color: #0d110e;
	}

	tbody tr.selected .dim {
		color: #4a544c;
	}

	tbody tr.selected .yellow {
		color: #7a5d0a;
	}

	tbody tr.selected .green,
	tbody tr.selected .cyan {
		color: #10623b;
	}

	tbody tr.selected .st {
		color: inherit;
	}

	.c-name {
		max-width: 420px;
	}

	.nm {
		display: inline-block;
		max-width: 400px;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: bottom;
		color: #c7d3c4;
	}

	tbody tr.selected .nm {
		color: #0d110e;
	}

	.st {
		font-weight: 700;
	}

	.st-seeding {
		color: #52c25d;
	}

	.st-downloading {
		color: #4cc2c8;
	}

	.st-paused {
		color: #6b756c;
	}

	.st-queued {
		color: #d6b849;
	}

	/* ---------- command line ---------- */

	.cmdline {
		border-top: 1px solid #26302a;
		padding-top: 7px;
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
		min-height: 20px;
	}

	.key {
		color: #c7d3c4;
	}

	.key.warn {
		color: #d05a4a;
	}

	:focus-visible {
		outline: 1px dashed #d6b849;
		outline-offset: -1px;
	}
</style>
