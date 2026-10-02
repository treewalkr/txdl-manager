# txdl-manager

A minimal download manager for [Transmission](https://transmissionbt.com/), built around one workflow:

> download + seed on the internal SSD → **clean up unselected junk files** → **move the torrent to the external HDD** → **remove it from Transmission**

SvelteKit 2 / Svelte 5 (runes) over the Transmission RPC API, Docker Compose on Bun. Runs locally next to your Transmission — no data leaves your machine.

## Usage

```bash
cp .env.example .env   # set HOST_DOWNLOAD_ROOTS=<download dirs>, MOVE_DESTINATION=<HDD path>
docker compose up -d --build
open http://localhost:3000
```

`HOST_DOWNLOAD_ROOTS` lists host directories (comma-separated) that are bind-mounted **at the same paths** into the container — that's what makes junk-file deletion possible (RPC can only delete whole-torrent data). Each download location is enabled once from a torrent's *Junk cleanup* panel; the choice persists.

No auth, binds to `127.0.0.1` only — keep it local. All other config has defaults; see `.env.example`.

## Development

```bash
bun install
bun run dev:mock   # mock RPC on :9092 + vite dev; download dir maps to dev-fixtures/
bun test           # bun:test unit tests
bun run check      # svelte-check
```
