# Hit & Run (HR) group — seed-time obligation tracking

## Semantics (the contract)

**Rule** — required seed time by torrent size (`sizeWhenDone`, GiB = 1024³ to match the UI's `fmtBytes`):
| Size | Must seed |
|---|---|
| ≤ 1 GiB | 12 h |
| ≤ 5 GiB | 24 h |
| > 5 GiB | 48 h |

- `met` := `secondsSeeding >= required` (both fields already fetched by `TORRENT_LIST_FIELDS` — no RPC changes).
- **In HR** := `!met && !excluded(id)` — every torrent owing seed time shows in HR, including still-downloading/paused ones (seed clock reads 0).
- **Auto-graduation**: derived on every 2 s poll; when seed time crosses the requirement the torrent silently moves back to normal (badge/chip membership drop automatically).
- **Manual "Remove from HR"** = exclusion: stays out of HR even while owing, persisted across restarts.
- **Manual "Add to HR"** = restore: clears the exclusion so the rule applies again. (Per your answer, manual adds graduate by the rule — so "Add to HR" is only offered for torrents you previously removed; everything not-met is already in HR.)

## Code changes

1. **`src/lib/hr.ts`** (new, shared client+server): `requiredSeedSeconds(size)` with the 3 buckets; `hrInfo(t, excluded)` → `{ required, seeded, remaining, met, inGroup, excluded }`; `hrRuleHint()` ("≤ 1 GiB → 12 h · ≤ 5 GiB → 24 h · > 5 GiB → 48 h").
2. **`src/lib/server/hr-state.ts`** (new): JSON file `{ version: 1, excluded: number[] }` at path from new env `HR_STATE_FILE` (default `.data/hr-state.json` resolved vs cwd). `getHrState()` (missing/corrupt → empty), `setHrExcluded(id, on)` — read-modify-write behind a promise-chain mutex, atomic tmp+rename, mkdir -p parent. Stale ids of removed torrents are harmless (no pruning).
3. **`src/lib/server/config.ts`**: add `hrStateFile` to `env()` (not in publicConfig).
4. **`src/routes/api/hr/+server.ts`** (new): `GET` → `{ excluded }`; `POST { id, op: 'exclude' | 'include' }` → validates, writes state, returns `{ message, excluded }`. Errors via existing `fail()`.
5. **`src/routes/api/state/+server.ts`**: include `hr: { excluded }` in the payload (read per poll — tiny file).
6. **`src/lib/stores/torrents.svelte.ts`**: `$state hrExcluded: number[]` filled in `refresh()`; new `setHr(id, op)` → POST `/api/hr`, update set locally from response + `setFlash` (no full refresh needed).
7. **`src/lib/status.ts`**: `FilterKey` gains `'hr'`; `matchesFilter(t, filter, hrExcluded?: number[])` — `'hr'` case delegates to `hrInfo`.
8. **`src/lib/format.ts`**: `fmtHours(sec)` — compact "5.2h" / "12h" (one decimal < 10 h, integer above).
9. **`src/routes/+page.svelte`**: `HR` chip second in `FILTERS` (after All) + count; pass `store.hrExcluded` to `matchesFilter` in `counts`/`filtered`; in the name cell next to `ready-badge`: `<span class="hr-badge">HR {fmtHours(seeded)}/{fmtHours(required)}</span>` when in group; `class:hr` row for a violet left-edge inset (ready inset wins if both).
10. **`src/routes/torrent/[id]/+page.svelte`**: new "Hit & Run" card (between stat-grid and junk card, same `.card` recipe): the torrent's bucket + requirement, `ProgressBar` of `seeded/required`, status line ("In HR — seeded 5h 12m of 24h · 18h 48m left" / "Requirement met ✓" / "Removed from HR — still owes 18h 48m"), contextual buttons **Remove from HR** / **Add back to HR**, hint with the full rule.
11. **`src/app.css`**: `.hr-badge` (violet pill — `--violet` token is currently unused) + `tr.hr td:first-child` inset.
12. **`scripts/mock-transmission.mjs`**: set id 2 (ubuntu, 3.8 GiB seeding) `secondsSeeding: 20h` — demos a live-counting HR member (tick already adds 2 s/2 s); stays archive-ready via ratio 7.3, showing HR ⊥ archive-ready. id 1 (8.4 GiB downloading, 48 h bucket) and id 4 (620 MiB, 12 h bucket) demo owing states; id 3 demos met.
13. **`docker-compose.yml`**: bind `./.data:/state` + env `HR_STATE_FILE=/state/hr-state.json` — same host dir as dev default, survives rebuilds.
14. **`.gitignore`**: `.data/`. **`README.md`**: HR section (rule table, manual remove/restore, `HR_STATE_FILE`).

## Tests
- `tests/hr.test.ts`: bucket boundaries (1 GiB±1, 5 GiB±1), `hrInfo` combos (met/excluded/remaining), `matchesFilter('hr')` with/without exclusion.
- `tests/hr-state.test.ts`: mkdtemp + `HR_STATE_FILE` env (same lazy-env pattern as cleanup tests): missing file → empty, exclude/include roundtrip persists, corrupt JSON → fresh.
- Existing 24 tests stay green.

## Verification
1. `bun test` + `bun run check` → clean.
2. `bun run dev:mock` → browser: HR chip counts 3 (ids 1, 2, 4); badges show "5.0h/48h" etc.; detail card on each state; Remove from HR → chip count drops; Add back → returns; `.data/hr-state.json` written; restart dev server → exclusion persists.
3. `docker compose up -d --build` → live vs real Transmission: HR count over 538 torrents; exclude one, `docker compose restart app`, verify still excluded via host `./.data/hr-state.json`.
4. `git commit`.