<script lang="ts">
	// PROTOTYPE variant D — "Instrument": the seed station as a Rams-era
	// control unit — pale chassis, indicator lamps, big tabular readouts,
	// physical keys with pressed depth, one signal orange, inset display
	// window with tick-marked gauges. Throwaway.
	import { SvelteSet } from 'svelte/reactivity';
	import { MOCK_SELECTED_ID, MOCK_SESSION, MOCK_TORRENTS } from './mock';
	import { hrInfo } from '$lib/hr';
	import { isArchiveReady, statusInfo } from '$lib/status';
	import { fmtBytes, fmtEta, fmtHours, fmtPercent, fmtRatio, fmtSpeed } from '$lib/format';

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

	function toggle(id: number) {
		selected.has(id) ? selected.delete(id) : selected.add(id);
	}

	/** lamp semantics: green = settled/ready · orange = HR owed · dark = downloading · hollow = stopped · grey = queued */
	const lamp = (r: Row) =>
		r.hr.inGroup ? 'owed' : r.ready ? 'ok' : r.st.key === 'downloading' ? 'active' : r.st.key === 'paused' ? 'off' : 'wait';
</script>

<div class="bench">
	<div class="unit">
		<header class="plate">
			<span class="brand">txdl</span>
			<span class="brand-sub">seed control</span>
			<span class="lamps">
				<span class="lamp"><i class="bulb on"></i>online</span>
				<span class="lamp"><i class="bulb vol"></i>{MOCK_SESSION.archiveVolume}</span>
			</span>
		</header>

		<section class="readouts">
			<div class="readout">
				<span class="value">{fmtSpeed(totals.down)}</span>
				<span class="label">download</span>
			</div>
			<div class="readout">
				<span class="value">{fmtSpeed(totals.up)}</span>
				<span class="label">upload</span>
			</div>
			<div class="readout">
				<span class="value signal">{totals.hr}</span>
				<span class="label">HR owed</span>
			</div>
			<div class="readout">
				<span class="value">{totals.ready}</span>
				<span class="label">ready to archive</span>
			</div>
		</section>

		<section class="keys">
			<button class="key" title="prototype — visual only">Pause</button>
			<button class="key" title="prototype — visual only">Verify</button>
			<button class="key" title="prototype — visual only">Clean junk</button>
			<button class="key signal" title="prototype — visual only">Move to {MOCK_SESSION.archiveVolume}</button>
			<button class="key" title="prototype — visual only">Remove</button>
			<button class="key add" title="prototype — visual only">Add torrent</button>
		</section>

		<section class="display">
			<table>
				<thead>
					<tr>
						<th class="c-lamp"></th>
						<th class="c-name">Name</th>
						<th class="num">Size</th>
						<th class="c-gauge">Progress</th>
						<th class="num">Seed owed</th>
						<th class="num">Ratio</th>
						<th class="num">Up</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.t.id)}
						<tr class:selected={selected.has(r.t.id)} onclick={() => toggle(r.t.id)} aria-selected={selected.has(r.t.id)}>
							<td class="c-lamp"><i class="bulb {lamp(r)}" title={r.st.label}></i></td>
							<td class="c-name" title={r.t.name}>{r.t.name}</td>
							<td class="num">{fmtBytes(r.t.sizeWhenDone)}</td>
							<td class="c-gauge">
								{#if r.t.percentDone < 1}
									<span class="gauge"><span class="gauge-fill" style="width: {r.t.percentDone * 100}%"></span><i class="tick t25"></i><i class="tick t50"></i><i class="tick t75"></i></span>
									<span class="gauge-label">{fmtPercent(r.t.percentDone)} · {fmtEta(r.t.eta)}</span>
								{:else}
									<span class="gauge-label ok">complete</span>
								{/if}
							</td>
							<td class="num">
								{#if r.hr.met}
									<span class="ok">—</span>
								{:else if r.t.percentDone < 1}
									<span class="dim">—</span>
								{:else}
									<span class="owing">{fmtHours(r.hr.remaining)}</span>
								{/if}
							</td>
							<td class="num">{fmtRatio(r.t.uploadRatio)}</td>
							<td class="num dim">{fmtSpeed(r.t.rateUpload)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<footer class="statusline">
			{#if selectedRows.length > 0}
				<span class="sel">{selectedRows.length} selected · {fmtBytes(selectedBytes)}</span>
				<span class="sel-keys">
					<button class="mini" title="prototype — visual only">resume</button>
					<button class="mini" title="prototype — visual only">pause</button>
					<button class="mini" title="prototype — visual only">move</button>
					<button class="mini danger" title="prototype — visual only">remove</button>
				</span>
			{:else}
				<span class="plain">transmission {MOCK_SESSION.version} · online</span>
			{/if}
			<span class="plain right">{rows.length} torrents</span>
		</footer>
	</div>
</div>

<style>
	.bench {
		min-height: 100dvh;
		background: #a7a49e;
		padding: 26px 18px 84px;
		font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
		font-size: 13px;
		line-height: 1.45;
		color: #262624;
	}

	.unit {
		max-width: 1060px;
		margin: 0 auto;
		background: #e9e7e2;
		border: 2px solid #262624;
		border-radius: 12px;
		padding: 18px 20px 14px;
		display: flex;
		flex-direction: column;
		gap: 0;
		box-shadow: 0 14px 34px rgba(30, 28, 22, 0.35);
	}

	/* ---------- nameplate ---------- */

	.plate {
		display: flex;
		align-items: center;
		gap: 9px;
		padding-bottom: 12px;
	}

	.brand {
		font-weight: 700;
		font-size: 19px;
		letter-spacing: -0.01em;
	}

	.brand-sub {
		color: #6d6b64;
		font-size: 11.5px;
		margin-top: 3px;
	}

	.lamps {
		margin-left: auto;
		display: flex;
		gap: 18px;
	}

	.lamp {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: #6d6b64;
	}

	.bulb {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		display: inline-block;
		border: 1.5px solid #262624;
		background: transparent;
	}

	.bulb.on {
		background: #3e9b4f;
		border-color: #262624;
	}

	.bulb.vol {
		background: #262624;
	}

	.bulb.ok {
		background: #3e9b4f;
	}

	.bulb.owed {
		background: #e2571e;
	}

	.bulb.active {
		background: #262624;
	}

	.bulb.off {
		background: transparent;
	}

	.bulb.wait {
		background: #b7b4ac;
	}

	/* ---------- readouts ---------- */

	.readouts {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-top: 1px solid #262624;
		border-bottom: 1px solid #262624;
	}

	.readout {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 12px 18px 10px;
	}

	.readout + .readout {
		border-left: 1px solid #262624;
	}

	.value {
		font-size: 23px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
	}

	.value.signal {
		color: #d64d15;
	}

	.label {
		font-size: 10.5px;
		color: #6d6b64;
	}

	/* ---------- keys ---------- */

	.keys {
		display: flex;
		gap: 10px;
		padding: 14px 0;
		flex-wrap: wrap;
	}

	.key {
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		color: #262624;
		background: #f6f4ef;
		border: 1.5px solid #262624;
		border-bottom-width: 4px;
		border-radius: 7px;
		padding: 7px 16px 6px;
		cursor: pointer;
	}

	.key:hover {
		background: #fdfcf9;
	}

	.key:active {
		border-bottom-width: 1.5px;
		transform: translateY(2.5px);
	}

	.key.signal {
		background: #e2571e;
		border-color: #262624;
		color: #fff;
	}

	.key.add {
		margin-left: auto;
		background: #262624;
		color: #f6f4ef;
	}

	/* ---------- display window ---------- */

	.display {
		background: #fbfaf7;
		border: 1.5px solid #262624;
		border-radius: 8px;
		box-shadow: inset 0 2px 5px rgba(38, 38, 36, 0.12);
		overflow: auto;
		max-height: 56dvh;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 780px;
	}

	th {
		font-size: 10.5px;
		font-weight: 500;
		color: #8a887f;
		text-align: left;
		padding: 9px 12px 7px;
		border-bottom: 1px solid #d9d6cd;
		white-space: nowrap;
		position: sticky;
		top: 0;
		background: #fbfaf7;
	}

	th.num {
		text-align: right;
	}

	td {
		padding: 9px 12px;
		border-bottom: 1px solid #e8e5dd;
		white-space: nowrap;
		vertical-align: middle;
	}

	td.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody tr {
		cursor: default;
	}

	tbody tr:hover {
		background: #f2efe7;
	}

	tbody tr.selected {
		background: #f3ead9;
		box-shadow: inset 3px 0 0 #e2571e;
	}

	.dim {
		color: #77756c;
	}

	.ok {
		color: #2f7c40;
	}

	.owing {
		color: #d64d15;
		font-weight: 600;
	}

	.c-lamp {
		width: 22px;
	}

	.c-name {
		max-width: 340px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* gauge: dark ink fill with quarter tick marks */
	.c-gauge {
		min-width: 190px;
	}

	.gauge {
		display: inline-block;
		position: relative;
		vertical-align: middle;
		width: 120px;
		height: 7px;
		background: #e3e0d7;
		border: 1px solid #262624;
		margin-right: 9px;
	}

	.gauge-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: #262624;
	}

	.tick {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: #fbfaf7;
	}

	.t25 {
		left: 25%;
	}

	.t50 {
		left: 50%;
	}

	.t75 {
		left: 75%;
	}

	.gauge-label {
		font-size: 11.5px;
		color: #8a887f;
		font-variant-numeric: tabular-nums;
	}

	.gauge-label.ok {
		color: #2f7c40;
	}

	/* ---------- status line ---------- */

	.statusline {
		display: flex;
		align-items: center;
		gap: 16px;
		padding-top: 12px;
		font-size: 12px;
	}

	.plain {
		color: #6d6b64;
	}

	.plain.right {
		margin-left: auto;
	}

	.sel {
		font-weight: 600;
	}

	.sel-keys {
		display: flex;
		gap: 8px;
	}

	.mini {
		font: inherit;
		font-size: 11.5px;
		color: #262624;
		background: #f6f4ef;
		border: 1px solid #262624;
		border-bottom-width: 2.5px;
		border-radius: 5px;
		padding: 2px 10px 2px;
		cursor: pointer;
	}

	.mini:active {
		border-bottom-width: 1px;
		transform: translateY(1.5px);
	}

	.mini.danger {
		color: #b03510;
	}

	:focus-visible {
		outline: 2px solid #262624;
		outline-offset: 2px;
	}

	@media (max-width: 720px) {
		.readouts {
			grid-template-columns: repeat(2, 1fr);
		}

		.readout:nth-child(3) {
			border-left: none;
		}
	}
</style>
