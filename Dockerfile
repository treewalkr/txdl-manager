# --- build stage ---
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# --- run stage ---
# The adapter-node output is executed by the Bun runtime (drop-in: Bun
# implements the node: APIs the server uses). --smol = memory-optimized GC
# for an always-on local container.
FROM oven/bun:1-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
USER bun
EXPOSE 3000
CMD ["bun", "--smol", "build/index.js"]
