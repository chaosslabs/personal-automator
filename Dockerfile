# Personal Automator - Docker Image
# Multi-stage build for minimal image size

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Build client and server
RUN npm run build

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app

# Install wget for health checks (node:20-slim doesn't include curl)
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create data directory for database and vault
RUN mkdir -p /data/.personal-automator

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/data
ENV DATA_DIR=/data/.personal-automator

# Expose port
EXPOSE 3000

# Health check using wget (more reliable than inline Node.js fetch)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/status || exit 1

# Run as non-root user
RUN groupadd -r automator && useradd -r -g automator -d /data automator
RUN chown -R automator:automator /app /data
USER automator

# Start server
CMD ["node", "dist/server/index.js"]
