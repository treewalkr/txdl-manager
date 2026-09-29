# txdl-manager

A minimal download manager for [Transmission](https://transmissionbt.com/), built around one workflow:

> download + seed on the internal SSD → **clean up unselected junk files** → **move the torrent to the external HDD** → **remove it from Transmission**

SvelteKit 2 / Svelte 5 (runes) frontend over the Transmission RPC API, packaged with Docker Compose and running on Bun. Runs locally next to your native Transmission — no data leaves your machine.

## Features

- Live torrent list (2s polling): status, progress, speeds, ratio, seed time; filter chips, search, sorting.
- Finder-style multi-select with a right-click context menu and a floating bulk-action bar.
- Hit & Run group tracking the seed time owed by size (≤ 1 GiB → 12 h · ≤ 5 GiB → 24 h · > 5 GiB → 48 h); torrents graduate automatically, manual exclusions persist.
- Archive-ready badge for torrents that are complete and seeded enough (ratio ≥ 2 or ≥ 72 h).
- Per-torrent detail page with wanted/unwanted file checkboxes.
- Junk cleanup of unselected files (incl. `.part` leftovers and empty dirs), guarded by a path-containment check.
- Move to HDD, remove (optionally with data), add magnet/.torrent URL, start/pause/verify.

## One-time Transmission setup

Enable Transmission's RPC (default port **9091**) and point `TRANSMISSION_RPC_URL` at it. The RPC port is separate from the BitTorrent peer port in Network settings — don't mix them up.

**Native macOS app:** Transmission → Settings → Remote → *Enable remote access*. That's all — the Mac app listens on all interfaces, and this app resolves `host.docker.internal` to an IP so Transmission's host whitelist accepts the container's requests. If one is ever rejected with 403, add `192.168.*` to the RPC whitelist in the same panel.

**Headless transmission-daemon** (settings live in `settings.json`; stop the daemon before editing, or it overwrites the file on exit):

```json
{
	"rpc-enabled": true,
	"rpc-port": 9091,
	"rpc-bind-address": "0.0.0.0",
	"rpc-whitelist-enabled": true,
	"rpc-whitelist": "127.0.0.1,::1,192.168.*"
}
```

On untrusted networks, also enable RPC auth and set `TRANSMISSION_RPC_USERNAME` / `TRANSMISSION_RPC_PASSWORD` in `.env`.

## Usage

```bash
cp .env.example .env   # set HOST_DOWNLOAD_DIR=<Transmission's download dir>, MOVE_DESTINATION=<HDD path>
docker compose up -d --build
open http://localhost:3000
```

`HOST_DOWNLOAD_DIR` is mounted read-write at `/data` — that's what makes junk-file deletion possible (RPC can only delete whole-torrent data). Leave it unset to run without file access.

## Development

```bash
bun install
bun run dev:mock   # mock RPC on :9092 + vite dev; env preset, real .env ignored
bun test           # bun:test unit tests
bun run check      # svelte-check
```

The mock's download dir maps to `dev-fixtures/` on disk, so junk cleanup really deletes fixtures (restore with `git checkout dev-fixtures`).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `3000` | Local port for the UI (127.0.0.1 only) |
| `TRANSMISSION_RPC_URL` | `http://host.docker.internal:9091/transmission/rpc` | RPC endpoint |
| `TRANSMISSION_RPC_USERNAME` / `_PASSWORD` | — | Only if RPC auth is enabled |
| `HOST_DOWNLOAD_DIR` | *(unset)* | Transmission's download dir on the host, mounted RW at `/data` |
| `MOVE_DESTINATION` | *(unset)* | HDD path preset for the Move dialog |
| `HR_STATE_FILE` | `/state/hr-state.json` in Docker, `.data/hr-state.json` in dev | "Removed from HR" overrides |

The app has no authentication and binds to `127.0.0.1` only — don't expose it beyond localhost. The delete endpoint resolves real paths and refuses anything escaping `/data` (see `src/lib/server/paths.ts` and its tests).
