FROM node:22-alpine AS nono-deps
WORKDIR /app/nono
COPY package.json package-lock.json* ./
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/extension/package.json ./packages/extension/package.json
RUN npm install

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
ARG NEXT_PUBLIC_GITHUB_OWNER
ARG NEXT_PUBLIC_GITHUB_REPO
ARG NEXT_PUBLIC_GITHUB_BRANCH
ARG NEXT_PUBLIC_GITHUB_APP_ID
ARG NEXT_PUBLIC_GITHUB_ROOT_PATH=apps/blog
ARG NEXT_PUBLIC_BASE_PATH=/blog
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_NONO_URL=$NEXT_PUBLIC_NONO_URL
ENV NEXT_PUBLIC_GITHUB_OWNER=$NEXT_PUBLIC_GITHUB_OWNER
ENV NEXT_PUBLIC_GITHUB_REPO=$NEXT_PUBLIC_GITHUB_REPO
ENV NEXT_PUBLIC_GITHUB_BRANCH=$NEXT_PUBLIC_GITHUB_BRANCH
ENV NEXT_PUBLIC_GITHUB_APP_ID=$NEXT_PUBLIC_GITHUB_APP_ID
ENV NEXT_PUBLIC_GITHUB_ROOT_PATH=$NEXT_PUBLIC_GITHUB_ROOT_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY apps/blog/ ./
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NONO_INTERNAL_PORT=3001
ENV BLOG_INTERNAL_PORT=2025
ENV HOSTNAME=0.0.0.0
COPY --from=nono-build /app/nono/package.json ./nono/package.json
COPY --from=nono-build /app/nono/node_modules ./nono/node_modules
COPY --from=nono-build /app/nono/packages/server/package.json ./nono/packages/server/package.json
COPY --from=nono-build /app/nono/packages/server/dist ./nono/packages/server/dist
COPY --from=nono-build /app/nono/packages/server/prisma ./nono/packages/server/prisma
COPY --from=nono-build /app/nono/packages/web/dist ./nono/packages/web/dist
COPY --from=blog-build /app/blog/public ./blog/public
COPY --from=blog-build /app/blog/.next/standalone ./blog
COPY --from=blog-build /app/blog/.next/static ./blog/.next/static
COPY docker/gateway.mjs ./gateway.mjs
EXPOSE 3000
CMD ["sh", "-c", "./nono/node_modules/.bin/prisma migrate deploy --schema ./nono/packages/server/prisma/schema.prisma && exec node ./gateway.mjs"]
