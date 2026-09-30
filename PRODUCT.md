# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user today: the owner — a private-tracker seeder on macOS running native Transmission, managing a personal queue from localhost. Built as a personal tool, but kept presentable enough to share or publish later without embarrassment. No multi-user concerns; authentication is explicitly out of scope (localhost binding is the trust boundary).

## Product Purpose

A minimal download manager for Transmission built around one pipeline: download + seed → clean up unselected junk files → move the data to an archive volume → remove the torrent from Transmission. Success means the daily seed/clean/archive cycle happens in one tab, at a glance, in a few clicks, with no data leaving the machine.

## Positioning

txdl-manager closes the gaps Transmission's own RPC and web UI leave open: per-file junk deletion (the RPC can only delete whole-torrent data, so the download dir is mounted read-write into the container), a derived Hit & Run seed-obligation tracker computed live from `secondsSeeding`, and one-click relocate-then-remove. Generic Transmission UIs manage torrents; this manages the torrent's end-of-life pipeline.

## Operating Context

- Runs on the Mac next to a native macOS Transmission: Docker Compose (`oven/bun` executing an adapter-node build), UI bound to `127.0.0.1:3000`. Bun is the runtime for install/test/dev.
- Transmission RPC is reached via `host.docker.internal` (hostname resolved to IP to pass Transmission's whitelist); whitelist/auth details are per-setup.
- The real setup spans **multiple volumes and download locations** — the README's single "SSD → Move to HDD" narrative is the exemplar workflow, not a literal map of the machine. `MOVE_DESTINATION` presets the archive path.
- HR manual exclusions persist in `HR_STATE_FILE` and survive restarts; everything else about HR is derived, never stored per torrent.
- Development without Transmission: mock RPC server on :9092 plus `dev-fixtures/` junk files (`bun run dev:mock`).

## Capabilities and Constraints

- Torrent list: 2s polling, live status/progress/speeds/ratio/seed time/ETA, filter chips, search, sorting.
- Finder-style multi-select (plain click, ⌘/Ctrl-toggle, Shift-range, ⌘A, Esc-clear) with a right-click context menu and floating selection bar for bulk actions (resume/pause/verify, move, remove, HR changes, copy magnet).
- **Hit & Run group — binding product truth.** The size tiers (≤ 1 GiB → 12 h · ≤ 5 GiB → 24 h · > 5 GiB → 48 h) mirror the seed-time policy of the user's specific tracker; preserve the numbers exactly. Scope: every torrent owes (all-owing); torrents graduate automatically as `secondsSeeding` accrues, and manual "remove from HR" exclusions are the only persisted override.
- The archive-ready badge in code (complete + ratio ≥ 2 or ≥ 72 h seeded) is **not** a binding rule — the user recognizes no ratio rule. Treat HR graduation as the real readiness signal; the ratio-based badge is legacy mechanics, fair game for redesign.
- Junk cleanup: scans/deletes files deselected in the file list (including `.part` partials and empty directories left behind), shows wasted space. Guarded by a path-containment check (symlinks included) and a re-fetch of state from Transmission immediately before any deletion.
- Move (via `torrent-set-location`, preset destination), Remove (list-only or with data, behind confirmation), Add (magnet / .torrent URL), start/pause/verify, per-torrent detail with wanted/unwanted file checkboxes.
- No authentication by design; the app binds to localhost only and must never be exposed beyond it.

## Evidence on Hand

- `README.md` — features, setup, cleanup workflow, HR rules, config reference, safety notes.
- `scripts/mock-transmission.mjs` + `dev-fixtures/` — full UI development and testing without a live Transmission.
- `bun test` suite — path containment, RPC session handshake, junk selection/deletion, HR rules + state.
- No external evidence (users, testimonials, metrics) exists; this is a personal tool — never fabricate any.

## Product Principles

1. The pipeline is the product: a feature earns its place by shortening seed → clean → move → remove.
2. Local-first and private: no data leaves the machine; localhost is the trust boundary.
3. Truth is derived from Transmission: membership, readiness, and pre-deletion state come from fresh RPC reads, never stale UI data.
4. Safety before convenience on destructive operations: containment checks, confirmations, re-fetch before delete.
5. Small but presentable: single-user simplicity now, clean enough to hand to someone else later.

## Accessibility & Inclusion

The Finder-style keyboard selection model (⌘/Shift-click, ⌘A, Esc, right-click, delegated window events) is a product interaction commitment, not decoration — preserve it across any UI changes.
