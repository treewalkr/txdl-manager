# txdl-manager

A minimal download manager for [Transmission](https://transmissionbt.com/), built around one workflow:

> download + seed on the internal SSD → **clean up unselected junk files** → **move the torrent to the external HDD** → **remove it from Transmission**

SvelteKit 2 / Svelte 5 (runes) frontend over the Transmission RPC API, packaged with Docker Compose. Runs on the **Bun** runtime (`bun install` / `bun test`, `oven/bun` Docker image executing the adapter-node build); locally on your Mac next to your native Transmission — no data leaves your machine.

## Features (MVP)

- **Torrent list** — live (2s polling) status, progress, speeds, ratio, seed time, ETA; filter chips, search, sorting.
- **Archive-ready badge** — highlights torrents that are complete and have seeded enough (ratio ≥ 2 or ≥ 72h seeded), i.e. ready to move and remove.
- **Per-torrent detail** — file list with wanted/unwanted checkboxes (`filesWanted` / `filesUnwanted`).
- **Junk cleanup** — scans files you unselected that still exist on disk, shows the space they waste, and deletes them (plus empty directories they leave behind). Guarded by a path-containment check with unit tests.
- **Move to HDD** — issues `torrent-set-location` to relocate the data, with your HDD path preset.
- **Remove** — from list only, or with deleting data, behind a confirmation.
- **Add** — magnet link or .torrent URL.
- Start / pause / verify.

## One-time Transmission setup

Your Transmission runs natively on macOS and (by default) binds its RPC to `127.0.0.1`, which the Docker container cannot reach. Quit Transmission, edit `~/Library/Application Support/Transmission/settings.json`, and set:

```json
{
	"rpc-enabled": true,
	"rpc-port": 63825,
	"rpc-bind-address": "0.0.0.0",
	"rpc-whitelist-enabled": true,
	"rpc-whitelist": "127.0.0.1,::1,192.168.*"
}
```

Notes:

- `rpc-bind-address: "0.0.0.0"` + the whitelist lets the container in (it arrives via `host.docker.internal`, which maps into `192.168.*` on Docker Desktop). The web UI itself only binds to `127.0.0.1`, and macOS's firewall blocks inbound `192.168.*` to Transmission unless you allow it — still, if you're on untrusted networks, also set `"rpc-authentication-required": true` with a username/password and fill `TRANSMISSION_RPC_USERNAME` / `TRANSMISSION_RPC_PASSWORD` in `.env`.
- Keep the port matching what you use today (63825 here).
- Restart Transmission after editing (it overwrites settings.json on exit, so quit *first*).

## Usage

```bash
cp .env.example .env
# edit .env: HOST_DOWNLOAD_DIR=<your Transmission download dir on the Mac>
#            MOVE_DESTINATION=<your HDD path, optional>
docker compose up -d --build
open http://localhost:3000
```

`HOST_DOWNLOAD_DIR` is mounted read-write into the container at `/data` — that's what makes junk-file deletion possible (Transmission's RPC can only delete whole-torrent data). Leave it unset to run without file access; cleanup will then report the download dir as unmapped.

### The cleanup workflow

1. Open a torrent → **Files** → uncheck everything you don't want. Transmission stops downloading those files, but anything already allocated stays on disk.
2. **Junk cleanup** → *Scan unselected files* → review the list and sizes → *Delete permanently*.
3. When the badge says **✓ ready** (or whenever you're done seeding): **Move to HDD…** → pick the destination → Transmission relocates the data.
4. **Remove…** → *Remove from list* (without deleting data — the files now live on the HDD).

## Development without Transmission

A mock RPC server plus fixture junk files let you develop and test the full UI:

```bash
bun install
bun run dev:mock   # starts scripts/mock-transmission.mjs on :9091, then vite dev
```

Then set the env the mock expects (SvelteKit loads `.env` in dev):

```bash
# .env (dev only)
TRANSMISSION_RPC_URL=http://127.0.0.1:9091/transmission/rpc
HOST_DOWNLOAD_DIR=/mock-downloads
DATA_ROOT=./dev-fixtures
```

The mock reports download dir `/mock-downloads`, mapped to `dev-fixtures/` on disk, so junk cleanup really deletes the fixture files (restore with `git checkout dev-fixtures`).

## Tests

```bash
bun test       # bun:test: path containment guard, RPC session handshake, junk selection/deletion
bun run check  # svelte-check
```

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `3000` | Local port for the UI (bound to 127.0.0.1) |
| `TRANSMISSION_RPC_URL` | `http://host.docker.internal:63825/transmission/rpc` | RPC endpoint |
| `TRANSMISSION_RPC_USERNAME` / `_PASSWORD` | — | Only if RPC auth is enabled |
| `HOST_DOWNLOAD_DIR` | *(unset)* | Transmission's download dir on the host; mounted RW at `/data` |
| `MOVE_DESTINATION` | *(unset)* | HDD path preset for the Move dialog |

## Safety notes

- The delete endpoint resolves real paths and refuses anything that escapes `/data` (symlinks included); see `src/lib/server/paths.ts` and its tests.
- Torrent state is re-fetched from Transmission immediately before deletion — never from stale UI data.
- The app itself has **no authentication**; it binds to `127.0.0.1` only. Don't expose it beyond localhost.
