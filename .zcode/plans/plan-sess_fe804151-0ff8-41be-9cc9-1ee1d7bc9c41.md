# Switch txdl-manager runtime from Node.js to Bun (+ optimize for Bun)

## Decision: `adapter-node` executed by Bun
Keep the official `@sveltejs/adapter-node` output and run it with the Bun runtime. Bun implements every Node API this app uses (`node:fs/promises`, `node:path`, `node:dns/promises`, global `fetch`, `AbortSignal.timeout`, `node:http` in the mock), so **zero server-code changes** — while everything around the code becomes fully Bun: `bun install`, `bun test`, `bun run`, `oven/bun` Docker image. The community `adapter-bun` (native `Bun.serve()`) was considered and rejected: third-party, can lag SvelteKit 2.63's new vite-plugin setup, and its marginal HTTP gain isn't worth the breakage risk for a local tool.

## Step 0 — Tooling
`bun --version`; if missing, `brew install bun`.

## Changes
1. **Lockfile/deps**: delete `package-lock.json` and `node_modules`; `bun install` (creates text `bun.lock`, committed); `bun remove -d vitest @types/node`; `bun add -d @types/bun` (bun-types also types our `node:*` imports). `svelte-check`/`typescript` stay.
2. **package.json scripts**: `"test": "bun test"`, `"dev:mock": "bun scripts/mock-transmission.mjs & vite dev"`; `dev`/`build`/`check` unchanged (invoked via `bun run`).
3. **Tests (3 files) → `bun:test`**: swap imports; in `tests/transmission.test.ts` replace `vi.fn<typeof fetch>()` chains with Bun `mock()` (queued responses via a closure index; assertions via `toHaveBeenCalledTimes` + Bun's call log — final API surface confirmed at implementation); `paths`/`cleanup` tests are 1:1 import swaps. Delete `vitest.config.ts`. No `bunfig.toml` needed (default discovery finds `tests/*.test.ts`).
4. **Dockerfile → oven/bun**:
   - build: `FROM oven/bun:1` → `COPY package.json bun.lock` → `bun install --frozen-lockfile` → `bun run build`
   - runtime: `FROM oven/bun:1-alpine`, `USER bun`, `CMD ["bun", "--smol", "build/index.js"]` (`--smol` = memory-optimized GC, right for an always-on local container).
5. **No changes**: server lib, mock script, `docker-compose.yml`, `.env` (PORT/ORIGIN/`host.docker.internal` behave identically under Bun; the DNS-resolve 421 workaround keeps working).
6. **README**: npm→bun commands (`bun install`, `bun run dev:mock`, `bun test`), note Bun runtime + oven/bun image.

## Verification
- `bun test` → 22/22
- `bun run check` → 0 errors
- `bun run build`, then smoke-run `bun build/index.js` on the host against real Transmission (localhost:9091) → `/api/state` returns your torrents
- `docker compose up -d --build` → `/api/state` via `host.docker.internal` (proves the 421 DNS fix under Bun) → torrents; UI serves on 127.0.0.1:3000
- `git commit`