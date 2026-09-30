<script lang="ts">
	// PROTOTYPE variant C — "Seed Ledger": the HR tracker as a bookkeeping
	// document. Obligations in ink, debt in red, settled rows ticked in the
	// margin, a ruled totals row. Deliberately not the cream+serif+terracotta
	// default: office paper, workhorse sans, Georgia masthead only. Throwaway.
	import { SvelteSet } from 'svelte/reactivity';
	import { MOCK_SELECTED_ID, MOCK_SESSION, MOCK_TORRENTS } from './mock';
	import { hrInfo } from '$lib/hr';
	import { isArchiveReady, statusInfo } from '$lib/status';
	import { fmtBytes, fmtEta, fmtHours, fmtRatio } from '$lib/format';

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
		bytes: rows.reduce((s, r) => s + r.t.sizeWhenDone, 0),
		balance: rows.reduce((s, r) => s + r.hr.remaining, 0),
		hr: rows.filter((r) => r.hr.inGroup).length,
		ready: rows.filter((r) => r.ready).length
	};

	const selected = new SvelteSet<number>([MOCK_SELECTED_ID]);
	const selectedRows = $derived(rows.filter((r) => selected.has(r.t.id)));
	const selectedBytes = $derived(selectedRows.reduce((s, r) => s + r.t.sizeWhenDone, 0));

	function toggle(id: number) {
		selected.has(id) ? selected.delete(id) : selected.add(id);
	}
</script>

<div class="desk">
	<article class="sheet">
		<header class="masthead">
			<h1 class="title"><span class="mark">txdl</span> seed obligations ledger</h1>
			<p class="meta">Transmission {MOCK_SESSION.version} · online · archive volume “{MOCK_SESSION.archiveVolume}”</p>
		</header>

		<nav class="tabs" aria-label="Filters">
			<button class="tab active">All <span class="n">{rows.length}</span></button>
			<button class="tab">Owing <span class="n red">{totals.hr}</span></button>
			<button class="tab">Downloading <span class="n">1</span></button>
			<button class="tab">Settled <span class="n green">{totals.ready}</span></button>
			<span class="find">
				<input type="search" placeholder="Find in ledger…" aria-label="Find in ledger" />
			</span>
		</nav>

		<table>
			<thead>
				<tr>
					<th class="c-tick" aria-label="Settled">✓</th>
					<th class="c-name">Item</th>
					<th class="num">Size</th>
					<th class="num">Owed</th>
					<th class="num">Seeded</th>
					<th class="num">Balance</th>
					<th class="num">Ratio</th>
					<th class="c-state">State</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.t.id)}
					<tr
						class:selected={selected.has(r.t.id)}
						class:settled={r.hr.met}
						onclick={() => toggle(r.t.id)}
						aria-selected={selected.has(r.t.id)}
					>
						<td class="c-tick">{#if r.hr.met}<span class="tick" title="obligation settled">✓</span>{/if}</td>
						<td class="c-name" title={r.t.name}>{r.t.name}</td>
						<td class="num">{fmtBytes(r.t.sizeWhenDone)}</td>
						<td class="num">{fmtHours(r.hr.required)}</td>
						<td class="num">{fmtHours(r.hr.seeded)}</td>
						<td class="num">
							{#if r.hr.met}
								<span class="settled-word">—</span>
							{:else}
								<span class="debt">{fmtHours(r.hr.remaining)}</span>
							{/if}
						</td>
						<td class="num">{fmtRatio(r.t.uploadRatio)}</td>
						<td class="c-state">
							{#if r.st.key === 'downloading'}
								<span class="down">downloading · {fmtEta(r.t.eta)} left</span>
							{:else if r.st.key === 'paused'}
								<span class="paused">paused{r.hr.inGroup ? ' · owing' : ''}</span>
							{:else if r.st.key === 'queued'}
								<span class="paused">queued</span>
							{:else if r.ready}
								<span class="ok">ready to archive</span>
							{:else}
								<span class="seeding">seeding</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td class="c-tick"></td>
					<td class="tot-label">Totals — {rows.length} items</td>
					<td class="num tot">{fmtBytes(totals.bytes)}</td>
					<td class="num tot"></td>
					<td class="num tot"></td>
					<td class="num tot {totals.balance > 0 ? 'debt' : ''}">{fmtHours(totals.balance)} owed</td>
					<td class="num tot"></td>
					<td class="c-state tot">{totals.ready} ready</td>
				</tr>
			</tfoot>
		</table>

		<footer class="actions">
			{#if selectedRows.length > 0}
				<span class="marked">{selectedRows.length} marked · {fmtBytes(selectedBytes)}</span>
				<button class="act" title="prototype — visual only">open</button>
				<button class="act" title="prototype — visual only">clean junk files</button>
				<button class="act" title="prototype — visual only">move to archive</button>
				<button class="act danger" title="prototype — visual only">remove</button>
			{:else}
				<span class="marked quiet">Click rows to mark entries. Double-rule rows carry forward.</span>
			{/if}
			<span class="colophon">seed ≤ 1 GiB for 12 h · ≤ 5 GiB for 24 h · &gt; 5 GiB for 48 h</span>
		</footer>
	</article>
</div>

<style>
	.desk {
		min-height: 100dvh;
		background: #dedad0;
		padding: 34px 20px 84px;
		font:
			13px/1.5 -apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		color: #201f1c;
	}

	.sheet {
		max-width: 1040px;
		margin: 0 auto;
		background: #fbfaf7;
		border: 1px solid #cfcabd;
		box-shadow: 0 1px 2px rgba(60, 55, 40, 0.12), 0 10px 30px rgba(60, 55, 40, 0.14);
		padding: 30px 44px 26px;
	}

	/* ---------- masthead ---------- */

	.masthead {
		display: flex;
		align-items: baseline;
		gap: 18px;
		padding-bottom: 12px;
		border-bottom: 3px double #201f1c;
	}

	.title {
		margin: 0;
		font-size: 19px;
		font-weight: 400;
		letter-spacing: 0.01em;
	}

	.mark {
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 700;
		font-style: italic;
		margin-right: 8px;
	}

	.meta {
		margin: 0 0 0 auto;
		color: #7b776c;
		font-size: 11.5px;
	}

	/* ---------- tabs ---------- */

	.tabs {
		display: flex;
		align-items: center;
		gap: 4px;
		margin: 16px 0 10px;
		border-bottom: 1px solid #201f1c;
	}

	.tab {
		border: none;
		background: none;
		font: inherit;
		font-size: 12.5px;
		color: #7b776c;
		padding: 5px 10px 6px;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.tab:hover {
		color: #201f1c;
	}

	.tab.active {
		color: #201f1c;
		border-bottom-color: #201f1c;
	}

	.n {
		font-variant-numeric: tabular-nums;
		font-size: 11px;
		color: #a39f92;
	}

	.n.red {
		color: #a23325;
	}

	.n.green {
		color: #2e6b3f;
	}

	.find {
		margin-left: auto;
		padding-bottom: 4px;
	}

	.find input {
		border: none;
		border-bottom: 1px solid #c6c1b2;
		background: none;
		font: inherit;
		font-size: 12px;
		color: #201f1c;
		padding: 2px 2px 3px;
		width: 170px;
	}

	.find input:focus-visible {
		outline: none;
		border-bottom-color: #201f1c;
	}

	/* ---------- table ---------- */

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		font-size: 11.5px;
		font-weight: 500;
		color: #7b776c;
		text-align: left;
		padding: 9px 10px 6px;
		border-bottom: 1px solid #201f1c;
		white-space: nowrap;
	}

	th.num {
		text-align: right;
	}

	td {
		padding: 10px 10px;
		border-bottom: 1px solid #e2ded2;
		vertical-align: baseline;
		white-space: nowrap;
	}

	td.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	tbody tr {
		cursor: default;
	}

	tbody tr:hover {
		background: #f6f4ec;
	}

	tbody tr.selected {
		background: #f3ecd7;
		box-shadow: inset 2px 0 0 #201f1c;
	}

	.c-tick {
		width: 26px;
		text-align: center;
		color: #2e6b3f;
	}

	.tick {
		font-size: 13px;
	}

	.c-name {
		max-width: 360px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.settled .c-name {
		color: #5c584d;
	}

	.debt {
		color: #a23325;
		font-weight: 600;
	}

	.settled-word {
		color: #a39f92;
	}

	.c-state {
		font-size: 12px;
		color: #7b776c;
	}

	.ok {
		color: #2e6b3f;
	}

	.down {
		color: #274b8f;
	}

	.paused {
		color: #7b776c;
	}

	.seeding {
		color: #201f1c;
	}

	tfoot td {
		border-bottom: none;
		border-top: 3px double #201f1c;
		padding-top: 9px;
		font-weight: 600;
	}

	.tot-label {
		font-size: 12px;
	}

	.tot {
		font-size: 12.5px;
	}

	/* ---------- actions ---------- */

	.actions {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 14px;
		font-size: 12.5px;
	}

	.marked {
		color: #201f1c;
		font-weight: 600;
	}

	.marked.quiet {
		color: #a39f92;
		font-weight: 400;
	}

	.act {
		border: none;
		background: none;
		font: inherit;
		font-size: 12.5px;
		color: #274b8f;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		padding: 0;
	}

	.act.danger {
		color: #a23325;
	}

	.colophon {
		margin-left: auto;
		color: #a39f92;
		font-size: 11px;
	}

	:focus-visible {
		outline: 2px solid #274b8f;
		outline-offset: 2px;
	}
</style>
