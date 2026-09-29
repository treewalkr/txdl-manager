# Multi-select + right-click context menu for the torrent list

## UX — mimics Finder / Windows Explorer

**Selection model** (no checkboxes, OS-style):
- Plain click selects one row (clears the rest); **⌘/Ctrl+click** toggles a row; **Shift+click** selects the range from the last anchor row; **⌘A** selects all currently *filtered* rows; **Esc** or a click on empty space clears.
- Selected rows get a blue tint (existing HR/ready edge accents coexist). Selection survives the 2s polling, filter/search/sort changes, and switching back; ids of torrents removed elsewhere auto-drop.
- Dragging to select *text* won't clobber the selection (guarded via `getSelection()`).
- The torrent-name link still opens the detail page; the per-row pause/✕ buttons keep working without touching selection.

**Right-click context menu** on rows (native menu suppressed):
- Finder semantics: if the right-clicked row is part of the current selection, the menu acts on the **whole selection**; otherwise it acts on just that row (and selects it).
- Items: **Open details**, **Copy magnet link** (`magnet:?xt=urn:btih:{hashString}&dn=…` via clipboard, single target only) · **Resume**, **Pause**, **Verify** · **Remove from HR (n)** / **Add back to HR (n)** shown when applicable among targets · **Move to HDD…** · **Remove…** (danger, opens confirm modal).
- Closes on any click, Esc, scroll, or resize; position clamped to the viewport.

**Selection bar** — floating pill at bottom-center whenever anything is selected: "N selected · total size" + Resume / Pause / Verify / HR toggles (contextual) / Move to HDD… / Remove… / ✕ clear.

## Code changes

1. **`src/lib/selection.ts`** (new): pure `applySelection(current, clicked, mods, orderedIds, anchor)` implementing click/meta/shift(+meta) semantics with anchor tracking — unit-tested in `tests/selection.test.ts`.
2. **`src/routes/api/torrents/action/+server.ts`** (new): bulk endpoint, `POST { action: start|stop|verify|remove|move, ids: number[], deleteData?, location?, move? }`, reusing the existing array-based RPC helpers (`startTorrents(ids)` etc. already take arrays). Validated ids, count-aware messages. `set-files` stays on the per-id route.
3. **`/api/hr` + `hr-state.ts`**: POST accepts `ids: number[]`; `setHrExcluded(ids, on)` generalized to arrays (same mutex + atomic write); pluralized messages.
4. **Store**: `actMany(ids, body)` (flash + refresh) and `setHr` takes an id array; detail-page call sites updated to `store.setHr([id], …)`.
5. **`src/routes/+page.svelte`**: `SvelteSet` selection + anchor state; a `$effect` prunes vanished ids. All row interaction via **`svelte:window` delegation** (click → select/clear, contextmenu → menu, keydown → ⌘A/Esc, scroll/resize → close) — no per-row handlers, so no new a11y warnings; clicks on links/buttons/inputs/modals/menu are ignored by the selection logic. Rows gain `data-torrent-id` + `class:selected`. Adds the context menu markup, the selection bar, and bulk **Move** / **Remove** modals (count + total size + delete-data checkbox, reusing the Modal component).
6. **`src/app.css`**: `tr.selected` tint, `.ctx-menu` / `.ctx-item` / `.ctx-sep`, `.sel-bar` (z-index between content and toast), `.btn.sm`.
7. **Tests**: new selection tests; `tests/hr-state.test.ts` updated to the array API + a multi-id case. **README**: feature bullet.

## Verification
1. `bun test` + `bun run check` → clean.
2. `dev:mock` browser pass: click/⌘/shift/⌘A/Esc selection; menu on single + selection targets; bulk Pause of 2 mock torrents → both pause; bulk HR exclude/restore; Copy magnet; bulk Remove (list-only) removes a mock torrent; Move modal cancel.
3. `docker compose up -d --build`; live spot check at 127.0.0.1:3000: selection + menu render across the real 538-torrent list (no destructive live actions).
4. `git commit`.