FROM node:22-alpine AS nono-deps
WORKDIR /app/nono
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/extension/package.json ./packages/extension/package.json
RUN npm ci

FROM nono-deps AS nono-build
WORKDIR /app/nono
ARG VITE_BLOG_URL
ENV VITE_BLOG_URL=$VITE_BLOG_URL
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:22-alpine AS blog-deps
WORKDIR /app/blog
RUN corepack enable
COPY apps/blog/package.json apps/blog/pnpm-lock.yaml apps/blog/pnpm-workspace.yaml apps/blog/.npmrc ./
RUN pnpm install --frozen-lockfile

FROM blog-deps AS blog-build
WORKDIR /app/blog
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_NONO_URL
ARG NEXT_PUBLIC_BASE_PATH=/nodesk
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_NONO_URL=$NEXT_PUBLIC_NONO_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY apps/blog/ ./
RUN pnpm build

FROM node:22-alpine AS nomoney-deps
WORKDIR /app/nomoney
COPY apps/nomoney/package.json apps/nomoney/package-lock.json ./
COPY apps/nomoney/backend/package.json ./backend/package.json
COPY apps/nomoney/frontend/package.json ./frontend/package.json
RUN npm ci

FROM nomoney-deps AS nomoney-build
WORKDIR /app/nomoney
COPY apps/nomoney/ ./
RUN npm run build

FROM node:22-alpine AS nostar-deps
WORKDIR /app/nostar
COPY apps/nostar/package.json apps/nostar/package-lock.json ./
RUN npm ci

FROM nostar-deps AS nostar-build
WORKDIR /app/nostar
COPY apps/nostar/ ./
RUN npm run build

FROM node:22-alpine AS nomoney-runtime-deps
WORKDIR /app/nomoney
COPY apps/nomoney/package.json apps/nomoney/package-lock.json ./
COPY apps/nomoney/backend/package.json ./backend/package.json
COPY apps/nomoney/frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace backend --include-workspace-root && npm cache clean --force

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache postgresql16-client sqlite su-exec \
  && addgroup -S nono \
  && adduser -S -D -G nono nono
ENV NODE_ENV=production
ENV PORT=3000
ENV NONO_INTERNAL_PORT=3001
ENV BLOG_INTERNAL_PORT=2025
ENV NOMONEY_INTERNAL_PORT=2030
ENV HOSTNAME=0.0.0.0
COPY --from=nono-build /app/nono/package.json ./nono/package.json
COPY --from=nono-build /app/nono/node_modules ./nono/node_modules
COPY --from=nono-build /app/nono/packages/server/package.json ./nono/packages/server/package.json
COPY --from=nono-build /app/nono/packages/server/dist ./nono/packages/server/dist
COPY --from=nono-build /app/nono/packages/server/prisma ./nono/packages/server/prisma
COPY --from=nono-build /app/nono/packages/web/dist ./nono/packages/web/dist
COPY --from=nostar-build /app/nostar/dist ./nono/packages/web/dist/nostar
COPY --from=blog-build /app/blog/public ./blog/public
COPY --from=blog-build /app/blog/public ./nodesk-seed/public
COPY --from=blog-build /app/blog/src ./nodesk-seed/src
COPY --from=blog-build /app/blog/.next/standalone ./blog
COPY --from=blog-build /app/blog/.next/static ./blog/.next/static
COPY --from=nomoney-build /app/nomoney/package.json ./nomoney/package.json
COPY --from=nomoney-build /app/nomoney/backend/package.json ./nomoney/backend/package.json
COPY --from=nomoney-runtime-deps /app/nomoney/node_modules ./nomoney/node_modules
COPY --from=nomoney-build /app/nomoney/backend/dist ./nomoney/backend/dist
COPY --from=nomoney-build /app/nomoney/backend/public ./nomoney/backend/public
COPY docker/gateway.mjs ./gateway.mjs
COPY docker/gateway-headers.mjs ./gateway-headers.mjs
COPY docker/gateway-routing.mjs ./gateway-routing.mjs
EXPOSE 3000
CMD ["sh", "-c", "set -eu; mkdir -p /app/nodesk-content /app/nomoney-data /app/backups; if [ ! -e /app/nodesk-content/.nodesk-initialized ]; then if [ -z \"$(ls -A /app/nodesk-content 2>/dev/null)\" ]; then cp -a /app/nodesk-seed/. /app/nodesk-content/; fi; touch /app/nodesk-content/.nodesk-initialized; fi; mkdir -p /app/nodesk-content/public; rm -rf /app/blog/public; ln -s /app/nodesk-content/public /app/blog/public; chown -R nono:nono /app/nodesk-content /app/nomoney-data /app/backups; su-exec nono:nono ./nono/node_modules/.bin/prisma migrate deploy --schema ./nono/packages/server/prisma/schema.prisma; exec su-exec nono:nono node ./gateway.mjs"]
