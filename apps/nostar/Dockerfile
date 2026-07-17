# ===== Stage 1: Build frontend =====
FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ===== Stage 2: Build backend =====
FROM node:22-alpine AS backend-build

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build && npm prune --omit=dev

# ===== Stage 3: Production =====
FROM node:22-alpine

WORKDIR /app

# Copy backend build output and production dependencies
COPY --from=backend-build /app/server/dist ./dist
COPY --from=backend-build /app/server/node_modules ./node_modules
COPY --from=backend-build /app/server/package.json ./

# Copy frontend build output into public directory (served by Express)
COPY --from=frontend-build /app/dist ./public

# Create data directory for SQLite
RUN mkdir -p data && chown -R node:node /app

USER node
VOLUME /app/data
EXPOSE 3000

CMD ["node", "dist/index.js"]