# txdl-manager — MVP Transmission download manager (SvelteKit + Svelte 5 + Docker)

Empty project, built from scratch. Workflow it serves: **seed on SSD → clean unselected/partial junk files → relocate torrent to external HDD → remove torrent**.

## Architecture
- SvelteKit 2 + Svelte 5 (runes) + TypeScript, `@sveltejs/adapter-node`.
- All Transmission RPC goes through SvelteKit server routes (avoids CORS, centralizes the `X-Transmission-Session-Id` 409 handshake, keeps config server-side).
- Junk-file deletion runs in the app container against the mounted download dir (RPC can only delete whole-torrent data, so the app does file-level deletes itself).
- UI polls `/api/state` every 2s (pauses when tab hidden). Hand-rolled dark CSS, no UI framework.

## Config (`.env`, read by compose — `.env.example` provided)
- `TRANSMISSION_RPC_URL` — default `http://host.docker.internal:63825/transmission/rpc`
- `HOST_DOWNLOAD_DIR` (mac SSD path) mounted read-write at container `/data`
- `MOVE_DESTINATION` — HDD path preset for the Move dialog
- App bound to `127.0.0.1:3000` only (no auth, local tool)

## Server (`src/lib/server/`)
- `transmission.ts` — typed RPC client: automatic 409/session-id retry; `session-get`, `torrent-get` (incl. `files`, `fileStats`, `secondsSeeding`, `downloadDir`), `torrent-set` (filesWanted/filesUnwanted), `torrent-remove`, `torrent-set-location`, start/stop, `torrent-add`.
- `paths.ts` — host→container path mapping + containment guard: resolve realpath, refuse anything outside `/data` (symlinks included). Unit-tested — this protects a destructive endpoint.
- `cleanup.ts` — junk scan/delete: files with `wanted=false` (or partial) that exist on disk → delete, prune empty parent dirs, report freed bytes.
- Routes: `GET /api/state`, `POST /api/torrents/[id]/action` (start/stop/remove/move/set-files), `POST /api/torrents/[id]/cleanup` (`dryRun` | `delete`), `POST /api/torrents/add`.

## UI
- `/` — torrent list: filter chips (All / Downloading / Seeding / Done / Stopped), search, progress bars, speeds, ratio + seed time, "archive-ready" badge, row actions; polling with pause/resume.
- `/torrent/[id]` — file list with wanted-checkboxes (live `filesWanted`/`filesUnwanted`), **Junk panel** (unselected files, on-disk size, delete-with-confirm), **Move to HDD** dialog (preset from `MOVE_DESTINATION`, issues `torrent-set-location`), **Remove** (list-only vs delete-data), both behind a confirm modal.
- Runes-based store (`torrents.svelte.ts`, class + `$state`), Svelte 5 idioms (`onclick`, snippets, callback props).

## Dev & verification
- `scripts/mock-transmission.mjs` — dev-only fake RPC (torrents incl. unselected files) since the live RPC on 63825 isn't answering right now; used for building/verifying the UI and API end-to-end.
- Vitest: path-containment guard, session-id retry, junk-selection logic.
- Verify `npm run build` + `node build` against mock; then start Docker Desktop and `docker compose up --build`, check UI in browser + curl the API.

## Deliverables
`Dockerfile` (multi-stage, node:22-alpine), `docker-compose.yml`, `.env.example`, README (incl. the one-time Transmission prerequisite: `rpc-bind-address: 0.0.0.0` + whitelist so the container can reach host RPC on 63825), `git init` + initial commit.

## Order
scaffold → server lib + tests → API routes → store → pages/components → mock server → Docker → README → build/run verification.