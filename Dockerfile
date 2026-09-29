# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- run stage ---
# All dependencies are devDependencies and Vite bundles the server, so the
# final image only needs the adapter-node output.
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
USER node
EXPOSE 3000
CMD ["node", "build"]
