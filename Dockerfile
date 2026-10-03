FROM node:24-alpine AS nono-deps
WORKDIR /app/nono
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/extension/package.json ./packages/extension/package.json
RUN npm ci

FROM nono-deps AS nono-build
WORKDIR /app/nono
ARG VITE_NODESK_URL
ENV VITE_NODESK_URL=$VITE_NODESK_URL
# 只复制 nono 构建真正需要的目录：package.json / package-lock.json 已由 nono-deps 阶段带入。
# 用 `COPY . .` 会把 apps/、docs/、tests/、scripts/ 一并算进这一层，
# 任何无关改动都会让 prisma generate + 前后端构建整层失效。
COPY packages ./packages
RUN npm run prisma:generate
RUN npm run build

# Unit and contract tests run inside the image build. A failing suite fails
# `docker compose build`, so a deploy stops before the running release is touched.
# The runtime stage copies each stage's marker, which makes BuildKit run them.
FROM nono-build AS nono-test
WORKDIR /app/nono
# Some server/web tests read files from the rest of the repository.
COPY apps/nodesk/src ./apps/nodesk/src
COPY playwright.config.ts ./
COPY docs/quality/ui-performance-baseline.md ./docs/quality/
COPY tests/e2e/public-navigation.smoke.spec.ts ./tests/e2e/
RUN npm test && touch /tmp/tests-passed

FROM node:24-alpine AS nodesk-deps
WORKDIR /app/nodesk
RUN corepack enable
COPY apps/nodesk/package.json apps/nodesk/pnpm-lock.yaml apps/nodesk/pnpm-workspace.yaml apps/nodesk/.npmrc ./
RUN pnpm install --frozen-lockfile

FROM nodesk-deps AS nodesk-build
WORKDIR /app/nodesk
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_NONO_URL
ARG NEXT_PUBLIC_BASE_PATH=/nodesk
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_NONO_URL=$NEXT_PUBLIC_NONO_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY apps/nodesk/ ./
RUN pnpm build

FROM nodesk-build AS nodesk-test
# quality-gates reads repository files three levels above apps/nodesk/tests, which is / here.
COPY package.json docker-compose.yml /
COPY docker/gateway.mjs docker/gateway-routing.mjs /docker/
RUN pnpm test && touch /tmp/tests-passed

FROM node:24-alpine AS nomoney-deps
WORKDIR /app/nomoney
COPY apps/nomoney/package.json apps/nomoney/package-lock.json ./
COPY apps/nomoney/backend/package.json ./backend/package.json
COPY apps/nomoney/frontend/package.json ./frontend/package.json
RUN npm ci

FROM nomoney-deps AS nomoney-build
WORKDIR /app/nomoney
COPY apps/nomoney/ ./
RUN npm run build

FROM nomoney-build AS nomoney-test
RUN npm test && touch /tmp/tests-passed

FROM node:24-alpine AS nostar-deps
WORKDIR /app/nostar
COPY apps/nostar/package.json apps/nostar/package-lock.json ./
RUN npm ci

FROM nostar-deps AS nostar-build
WORKDIR /app/nostar
COPY apps/nostar/ ./
RUN npm run build

FROM nostar-build AS nostar-test
RUN npm test -- --run && touch /tmp/tests-passed

# Gateway, deployment and contract tests read files from across the repository.
FROM node:24-alpine AS repo-test
WORKDIR /repo
COPY . .
RUN npm run test:gateway && touch /tmp/tests-passed

FROM node:24-alpine AS nomoney-runtime-deps
WORKDIR /app/nomoney
COPY apps/nomoney/package.json apps/nomoney/package-lock.json ./
COPY apps/nomoney/backend/package.json ./backend/package.json
COPY apps/nomoney/frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace backend --include-workspace-root && npm cache clean --force

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=nono-test /tmp/tests-passed /opt/checks/nono
COPY --from=nodesk-test /tmp/tests-passed /opt/checks/nodesk
COPY --from=nomoney-test /tmp/tests-passed /opt/checks/nomoney
COPY --from=nostar-test /tmp/tests-passed /opt/checks/nostar
COPY --from=repo-test /tmp/tests-passed /opt/checks/repo
RUN apk add --no-cache postgresql18-client sqlite su-exec tzdata \
  && addgroup -S nono \
  && adduser -S -D -G nono nono
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV PORT=3000
ENV NONO_INTERNAL_PORT=3001
ENV NODESK_INTERNAL_PORT=2025
ENV NOMONEY_INTERNAL_PORT=2030
ENV YUMI_INTERNAL_PORT=2040
ENV HOSTNAME=0.0.0.0
COPY --from=nono-build /app/nono/package.json ./nono/package.json
COPY --from=nono-build /app/nono/node_modules ./nono/node_modules
COPY --from=nono-build /app/nono/packages/server/package.json ./nono/packages/server/package.json
COPY --from=nono-build /app/nono/packages/server/dist ./nono/packages/server/dist
COPY --from=nono-build /app/nono/packages/server/prisma ./nono/packages/server/prisma
COPY --from=nono-build /app/nono/packages/server/prisma.config.ts ./nono/packages/server/prisma.config.ts
COPY --from=nono-build /app/nono/packages/web/dist ./nono/packages/web/dist
COPY --from=nostar-build /app/nostar/dist ./nono/packages/web/dist/nostar
COPY --from=nodesk-build /app/nodesk/public ./nodesk/public
COPY --from=nodesk-build /app/nodesk/public ./nodesk-seed/public
COPY --from=nodesk-build /app/nodesk/src ./nodesk-seed/src
COPY --from=nodesk-build /app/nodesk/.next/standalone ./nodesk
COPY --from=nodesk-build /app/nodesk/.next/static ./nodesk/.next/static
RUN test -s /app/nodesk-seed/public/images/nodesk-ambient-wallpaper.png
COPY --from=nomoney-build /app/nomoney/package.json ./nomoney/package.json
COPY --from=nomoney-build /app/nomoney/backend/package.json ./nomoney/backend/package.json
COPY --from=nomoney-runtime-deps /app/nomoney/node_modules ./nomoney/node_modules
COPY --from=nomoney-build /app/nomoney/backend/dist ./nomoney/backend/dist
COPY --from=nomoney-build /app/nomoney/backend/public ./nomoney/backend/public
COPY --from=nomoney-build /app/nomoney/backend/public-yumi ./nomoney/backend/public-yumi
COPY docker/gateway.mjs ./gateway.mjs
COPY docker/migrate-nodesk-content.mjs ./migrate-nodesk-content.mjs
COPY docker/gateway-headers.mjs ./gateway-headers.mjs
COPY docker/gateway-routing.mjs ./gateway-routing.mjs
COPY docker/gateway-maintenance.mjs ./gateway-maintenance.mjs
EXPOSE 3000
CMD ["sh", "-c", "set -eu; mkdir -p /app/nodesk-content /app/nomoney-data /app/yumi-data /app/backups; if [ ! -e /app/nodesk-content/.nodesk-initialized ]; then if [ -z \"$(ls -A /app/nodesk-content 2>/dev/null)\" ]; then cp -a /app/nodesk-seed/. /app/nodesk-content/; fi; touch /app/nodesk-content/.nodesk-initialized; fi; mkdir -p /app/nodesk-content/public/images; cp /app/nodesk-seed/public/images/nodesk-ambient-wallpaper.png /app/nodesk-content/public/images/.nodesk-ambient-wallpaper.png.tmp; mv /app/nodesk-content/public/images/.nodesk-ambient-wallpaper.png.tmp /app/nodesk-content/public/images/nodesk-ambient-wallpaper.png; rm -rf /app/nodesk/public; ln -s /app/nodesk-content/public /app/nodesk/public; chown -R nono:nono /app/nodesk-content /app/nomoney-data /app/yumi-data /app/backups; su-exec nono:nono ./nono/node_modules/.bin/prisma migrate deploy --config ./nono/packages/server/prisma.config.ts --schema ./nono/packages/server/prisma/schema.prisma; exec su-exec nono:nono node ./gateway.mjs"]
