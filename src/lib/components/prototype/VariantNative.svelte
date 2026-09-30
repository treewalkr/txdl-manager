<script lang="ts">
	// PROTOTYPE variant A — "Native Mac": the tool as a macOS utility window
	// (source-list sidebar, Aqua-light materials, system controls). Throwaway.
	import { SvelteSet } from 'svelte/reactivity';
	import { MOCK_SELECTED_ID, MOCK_SESSION, MOCK_TORRENTS } from './mock';
	import { hrInfo } from '$lib/hr';
	import { isArchiveReady, matchesFilter, statusInfo } from '$lib/status';
	import { fmtBytes, fmtDuration, fmtEta, fmtHours, fmtPercent, fmtRatio, fmtSpeed } from '$lib/format';

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

	const NAV: { group: string; items: { key: string; label: string }[] }[] = [
		{ group: 'Library', items: [{ key: 'all', label: 'All Torrents' }, { key: 'downloading', label: 'Downloading' }, { key: 'seeding', label: 'Seeding' }, { key: 'paused', label: 'Paused' }] },
		{ group: 'Obligations', items: [{ key: 'hr', label: 'HR Owed' }, { key: 'ready', label: 'Ready to Archive' }] }
	];

	const count = (key: string) =>
		key === 'ready' ? rows.filter((r) => r.ready).length : rows.filter((r) => matchesFilter(r.t, key as never)).length;

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
</script>

<div class="desk">
	<div class="window">
		<aside class="sidebar">
			<div class="side-head">
				<span class="side-title">txdl</span>
				<span class="side-sub">Transmission</span>
			</div>
			{#each NAV as group (group.group)}
				<div class="side-group">{group.group}</div>
				{#each group.items as item (item.key)}
					<button class="side-item" class:active={item.key === 'all'}>
						{item.label}
						<span class="side-count">{count(item.key)}</span>
					</button>
				{/each}
			{/each}
			<div class="side-foot">
				<div class="vol">
					<span class="vol-name">{MOCK_SESSION.archiveVolume}</span>
					<span class="vol-path">{MOCK_SESSION.archivePath}</span>
				</div>
			</div>
		</aside>

		<div class="main">
			<div class="toolbar">
				<h1 class="title">All Torrents</h1>
				<div class="toolbar-actions">
					<input class="search" type="search" placeholder="Search" aria-label="Search torrents" />
					<button class="btn add" title="prototype — visual only">Add</button>
				</div>
			</div>

			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th class="c-name">Name</th>
							<th class="num">Size</th>
							<th class="c-prog">Progress</th>
							<th class="num">Seeding</th>
							<th class="num">Ratio</th>
							<th class="num">Down</th>
							<th class="num">Up</th>
							<th class="c-act"></th>
						</tr>
					</thead>
					<tbody>
						{#each rows as r (r.t.id)}
							<tr
								class:selected={selected.has(r.t.id)}
								class:warn={r.hr.inGroup}
								onclick={() => toggle(r.t.id)}
								aria-selected={selected.has(r.t.id)}
							>
								<td class="c-name">
									<span class="markers" aria-hidden="true">
										{#if r.hr.inGroup}<span class="dot owed" title="HR owed — {fmtDuration(r.hr.remaining)} to go"></span>{/if}
										{#if r.ready}<span class="dot ok" title="Ready to archive"></span>{/if}
									</span>
									<span class="name" title={r.t.name}>{r.t.name}</span>
								</td>
								<td class="num">{fmtBytes(r.t.sizeWhenDone)}</td>
								<td class="c-prog">
									{#if r.t.percentDone < 1}
										<span class="bar"><span class="fill" style="width: {r.t.percentDone * 100}%"></span></span>
										<span class="pct">{fmtPercent(r.t.percentDone)} · {fmtEta(r.t.eta)}</span>
									{:else}
										<span class="pct complete">Complete</span>
									{/if}
								</td>
								<td class="num">
									{#if r.hr.met}
										<span class="met">Met</span>
									{:else}
										<span class="owing">{fmtHours(r.hr.seeded)} / {fmtHours(r.hr.required)}</span>
									{/if}
								</td>
								<td class="num">{fmtRatio(r.t.uploadRatio)}</td>
								<td class="num dim">{fmtSpeed(r.t.rateDownload)}</td>
								<td class="num dim">{fmtSpeed(r.t.rateUpload)}</td>
								<td class="c-act">
									<button class="glyph" title="{r.st.key === 'paused' ? 'Resume' : 'Pause'} (prototype — visual only)" aria-label="{r.st.key === 'paused' ? 'Resume' : 'Pause'}">
										{r.st.key === 'paused' ? '▶' : '❚❚'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="statusbar">
				<span class="sel-info">
					{selectedRows.length === 0
						? `${rows.length} torrents · ${totals.hr} owe HR · ${totals.ready} ready`
						: `${selectedRows.length} selected · ${fmtBytes(selectedBytes)}`}
				</span>
				<span class="sel-actions">
					<button class="link" title="prototype — visual only">Resume</button>
					<button class="link" title="prototype — visual only">Pause</button>
					<button class="link" title="prototype — visual only">Move to {MOCK_SESSION.archiveVolume}…</button>
					<button class="link danger" title="prototype — visual only">Remove</button>
				</span>
				<span class="rates">
					<span>↓ {fmtSpeed(totals.down)}</span>
					<span>↑ {fmtSpeed(totals.up)}</span>
				</span>
			</div>
		</div>
	</div>
</div>

<style>
	.desk {
		min-height: 100dvh;
		background: #dfe1e6;
		padding: 22px 22px 70px;
		font:
			13px/1.45 -apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		color: #1d1d1f;
	}

	.window {
		max-width: 1220px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 216px 1fr;
		min-height: calc(100dvh - 92px);
		background: #ffffff;
		border: 1px solid #b9bbc2;
		border-radius: 10px;
		overflow: hidden;
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.12),
			0 12px 32px rgba(0, 0, 0, 0.16);
	}

	/* ---------- sidebar (source list) ---------- */

	.sidebar {
		background: #eff0f3;
		border-right: 1px solid #d9dade;
		padding: 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.side-head {
		padding: 2px 8px 10px;
		display: flex;
		align-items: baseline;
		gap: 7px;
	}

	.side-title {
		font-weight: 700;
		font-size: 15px;
	}

	.side-sub {
		color: #8a8a90;
		font-size: 11px;
	}

	.side-group {
		padding: 10px 8px 3px;
		font-size: 11px;
		font-weight: 600;
		color: #7c7c82;
	}

	.side-item {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		border: none;
		background: none;
		font: inherit;
		color: #26282c;
		text-align: left;
		padding: 4px 8px;
		border-radius: 6px;
		cursor: pointer;
	}

	.side-item:hover {
		background: #e2e3e8;
	}

	.side-item.active {
		background: #3478f6;
		color: #fff;
	}

	.side-count {
		margin-left: auto;
		font-size: 11px;
		color: #8a8a90;
		font-variant-numeric: tabular-nums;
	}

	.side-item.active .side-count {
		color: rgba(255, 255, 255, 0.8);
	}

	.side-foot {
		margin-top: auto;
		padding: 10px 8px 2px;
		border-top: 1px solid #d9dade;
	}

	.vol {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.vol-name {
		font-weight: 600;
		font-size: 12px;
	}

	.vol-path {
		color: #8a8a90;
		font-size: 10.5px;
		word-break: break-all;
	}

	/* ---------- main ---------- */

	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		border-bottom: 1px solid #e4e4e8;
	}

	.title {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}

	.toolbar-actions {
		margin-left: auto;
		display: flex;
		gap: 8px;
	}

	.search {
		width: 180px;
		border: 1px solid #c7c9cf;
		border-radius: 6px;
		background: #fff;
		padding: 3px 9px;
		font: inherit;
		font-size: 12.5px;
		color: #1d1d1f;
	}

	.btn.add {
		border: none;
		background: #3478f6;
		color: #fff;
		border-radius: 6px;
		padding: 4px 14px;
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}

	.btn.add:hover {
		background: #2b6be1;
	}

	/* ---------- table ---------- */

	.table-scroll {
		flex: 1;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 700px;
	}

	th {
		font-size: 11px;
		font-weight: 600;
		color: #7c7c82;
		text-align: left;
		padding: 7px 12px;
		border-bottom: 1px solid #e4e4e8;
		white-space: nowrap;
		position: sticky;
		top: 0;
		background: #fff;
	}

	th.num {
		text-align: right;
	}

	td {
		padding: 8px 9px;
		border-bottom: 1px solid #eeeff2;
		white-space: nowrap;
		vertical-align: middle;
	}

	tbody tr {
		cursor: default;
	}

	tbody tr:hover {
		background: #f5f6f8;
	}

	tbody tr.selected {
		background: #3478f6;
		color: #fff;
	}

	tbody tr.selected .dim,
	tbody tr.selected td.num {
		color: rgba(255, 255, 255, 0.92);
	}

	td.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.dim {
		color: #8a8a90;
	}

	.c-name {
		max-width: 300px;
	}

	.markers {
		display: inline-flex;
		gap: 4px;
		margin-right: 7px;
		vertical-align: 1px;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		display: inline-block;
	}

	.dot.owed {
		background: #d99000;
	}

	.dot.ok {
		background: #249e47;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 250px;
		display: inline-block;
		vertical-align: bottom;
	}

	.c-prog {
		min-width: 160px;
	}

	.bar {
		display: inline-block;
		vertical-align: middle;
		width: 96px;
		height: 4px;
		border-radius: 2px;
		background: #e6e7eb;
		overflow: hidden;
		margin-right: 8px;
	}

	.fill {
		display: block;
		height: 100%;
		background: #3478f6;
		border-radius: 2px;
	}

	.pct {
		color: #7c7c82;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.pct.complete {
		color: #249e47;
	}

	.owing {
		color: #a86e00;
	}

	.met {
		color: #249e47;
	}

	tbody tr.selected .owing {
		color: #ffe2b0;
	}

	tbody tr.selected .met,
	tbody tr.selected .pct.complete,
	tbody tr.selected .dot.owed {
		color: #c9f2d4;
	}

	tbody tr.selected .dot.owed {
		background: #ffd479;
	}

	tbody tr.selected .dot.ok {
		background: #7ee29a;
	}

	.c-act {
		text-align: right;
	}

	.glyph {
		border: none;
		background: none;
		color: #7c7c82;
		font-size: 11px;
		width: 26px;
		height: 24px;
		border-radius: 5px;
		cursor: pointer;
	}

	.glyph:hover {
		background: #e8e9ed;
		color: #1d1d1f;
	}

	tbody tr.selected .glyph {
		color: rgba(255, 255, 255, 0.85);
	}

	tbody tr.selected .glyph:hover {
		background: rgba(255, 255, 255, 0.18);
		color: #fff;
	}

	/* ---------- status bar ---------- */

	.statusbar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 7px 14px;
		border-top: 1px solid #e4e4e8;
		background: #f7f7f9;
		font-size: 12px;
		color: #6d6d72;
	}

	.sel-actions {
		display: flex;
		gap: 12px;
	}

	.link {
		border: none;
		background: none;
		font: inherit;
		font-size: 12px;
		color: #3478f6;
		cursor: pointer;
		padding: 0;
	}

	.link.danger {
		color: #d23b3b;
	}

	.rates {
		margin-left: auto;
		display: flex;
		gap: 12px;
		font-variant-numeric: tabular-nums;
	}

	:focus-visible {
		outline: 2px solid #3478f6;
		outline-offset: 1px;
		border-radius: 4px;
	}
</style>
