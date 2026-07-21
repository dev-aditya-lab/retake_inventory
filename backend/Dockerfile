# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-slim

# canvas (used for barcode rendering) is a native addon. Its prebuilt binary
# may not cover every Node ABI yet, so the dep stages carry the toolchain
# needed to build it from source; the final runtime image only gets the
# shared libraries it needs at load time, not the compilers.
ARG CANVAS_BUILD_DEPS="build-essential pkg-config python3 libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev"
ARG CANVAS_RUNTIME_DEPS="libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2"

# ---- deps: install full (dev+prod) dependencies for the build step ----
FROM node:${NODE_VERSION} AS deps
ARG CANVAS_BUILD_DEPS
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ${CANVAS_BUILD_DEPS} \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript to dist/ ----
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: install production-only dependencies ----
FROM node:${NODE_VERSION} AS prod-deps
ARG CANVAS_BUILD_DEPS
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ${CANVAS_BUILD_DEPS} \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: slim image with only what's needed to run the server ----
FROM node:${NODE_VERSION} AS runtime
ARG CANVAS_RUNTIME_DEPS
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8801
RUN apt-get update \
  && apt-get install -y --no-install-recommends ${CANVAS_RUNTIME_DEPS} \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist

USER node
EXPOSE 8801

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8801)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
