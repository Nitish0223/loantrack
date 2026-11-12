# ---- Stage 1: install production dependencies -------------------------------
# Exact base tag (never "latest") so every build uses the same node + alpine.
FROM node:22.12.0-alpine3.21 AS deps
WORKDIR /app

# Copy only the dependency manifests first. This layer (and the npm ci below)
# is reused from cache as long as package*.json do not change, so editing
# source code does not trigger a full reinstall.
COPY package.json package-lock.json ./

# npm ci installs exactly what package-lock.json pins; --omit=dev skips dev
# dependencies. The npm cache stays in this stage and never reaches the image.
RUN npm ci --omit=dev

# ---- Stage 2: runtime image --------------------------------------------------
FROM node:22.12.0-alpine3.21 AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app

# Only the installed node_modules come over from stage 1, owned by the
# unprivileged "node" user that ships with the base image.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Run as non-root (uid 1000). A compromised process cannot modify the image
# filesystem or bind privileged ports.
USER node
EXPOSE 8080

# Docker marks the container unhealthy if /healthz stops answering.
# busybox wget is already in alpine, so no extra package (curl) is installed.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# Exec form, node as PID 1: SIGTERM reaches node directly, so the graceful
# shutdown handler in server.js runs (npm start would swallow the signal).
CMD ["node", "src/server.js"]
