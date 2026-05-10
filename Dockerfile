# syntax=docker/dockerfile:1.7

# Build stage: native modules (erlpack, sodium-native, @discordjs/opus) need a
# toolchain. Keep them out of the runtime image.
FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Runtime stage.
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        imagemagick \
        file \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Run as non-root. /data is the conventional dataRoot mount point.
RUN useradd --system --create-home --uid 1001 botnek \
    && mkdir -p /data \
    && chown -R botnek:botnek /app /data
USER botnek

ENV NODE_ENV=production
VOLUME ["/data"]

ENTRYPOINT ["node", "--loader", "ts-node/esm", "src/index.ts"]
