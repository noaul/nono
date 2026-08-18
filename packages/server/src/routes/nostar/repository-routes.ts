import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import {
  type AnyRecord,
  asRecord,
  authed,
  boundedInt,
  releaseData,
  repositoryData,
  requiredBigInt,
  text,
  toLegacyRelease,
  toLegacyRepository,
} from './common.js';

// 两个同步接口都接受 50 MB 请求体，读接口上限也是 10000 行，所以单次同步几千行是设计内的用法。
// Prisma 交互式事务默认 5s，几千次往返必然超时并抛 P2028（整个同步回滚），这里显式放宽。
const SYNC_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 };

export function registerNoStarRepositoryRoutes(app: FastifyInstance, services: AppServices) {
  app.get('/api/nostar/repositories', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const query = asRecord(request.query);
    const limit = boundedInt(query.limit, 10000, 1, 10000);
    const [rows, total] = await Promise.all([
      services.prisma.noStarRepository.findMany({ where: { userId: user.id }, orderBy: [{ starredAt: 'desc' }, { id: 'asc' }], take: limit }),
      services.prisma.noStarRepository.count({ where: { userId: user.id } }),
    ]);
    return { repositories: rows.map(toLegacyRepository), total };
  });

  app.put('/api/nostar/repositories', { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const body = asRecord(request.body);
    const repositories = Array.isArray(body.repositories) ? body.repositories.map(asRecord) : [];
    const githubIds = repositories.map((repo) => requiredBigInt(repo.id, 'repository id'));
    await services.prisma.$transaction(async (tx) => {
      for (const repository of repositories) {
        const data = repositoryData(repository);
        await tx.noStarRepository.upsert({
          where: { userId_githubId: { userId: user.id, githubId: data.githubId } },
          update: data,
          create: { userId: user.id, ...data },
        });
      }
      if (body.isFullSync === true) {
        await tx.noStarRepository.deleteMany({ where: { userId: user.id, githubId: { notIn: githubIds } } });
      }
    }, SYNC_TRANSACTION_OPTIONS);
    return { synced: repositories.length };
  });

  app.get('/api/nostar/releases', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const query = asRecord(request.query);
    const limit = boundedInt(query.limit, 10000, 1, 10000);
    const [rows, total] = await Promise.all([
      services.prisma.noStarRelease.findMany({ where: { userId: user.id }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: limit }),
      services.prisma.noStarRelease.count({ where: { userId: user.id } }),
    ]);
    return { releases: rows.map(toLegacyRelease), total };
  });

  app.put('/api/nostar/releases', { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const body = asRecord(request.body);
    const releases = Array.isArray(body.releases) ? body.releases.map(asRecord) : [];
    const githubIds = releases.map((release) => requiredBigInt(release.id, 'release id'));
    await services.prisma.$transaction(async (tx) => {
      // 事务内一次性载入仓库索引，替代逐条 release 的 findUnique（原本每行 2 次往返）。
      // 键同时按 githubId 和 fullName 建，对齐 findReleaseRepository 的两种匹配方式。
      const owned = await tx.noStarRepository.findMany({
        where: { userId: user.id },
        select: { id: true, githubId: true, fullName: true },
      });
      const byGithubId = new Map(owned.map((repo) => [repo.githubId.toString(), repo.id]));
      const byFullName = new Map(owned.map((repo) => [repo.fullName, repo.id]));
      for (let index = 0; index < releases.length; index += 1) {
        const release = releases[index];
        const githubId = githubIds[index];
        const repositoryId = resolveRepositoryId(release, byGithubId, byFullName);
        if (repositoryId === undefined) continue;
        const data = releaseData(release, repositoryId);
        await tx.noStarRelease.upsert({
          where: { userId_githubId: { userId: user.id, githubId } },
          update: data,
          create: { userId: user.id, githubId, ...data },
        });
      }
      if (body.isFullSync === true) {
        await tx.noStarRelease.deleteMany({ where: { userId: user.id, githubId: { notIn: githubIds } } });
      }
    }, SYNC_TRANSACTION_OPTIONS);
    return { synced: releases.length };
  });

  app.post('/api/nostar/releases/mark-all-read', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const result = await services.prisma.noStarRelease.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return { updated: result.count };
  });
}

// 与 findReleaseRepository 同样的匹配顺序：给了 repo_id 就只按 id 匹配，不回退到 fullName。
function resolveRepositoryId(release: AnyRecord, byGithubId: Map<string, number>, byFullName: Map<string, number>) {
  const repoGithubId = release.repo_id ?? release.repoId;
  if (repoGithubId !== undefined && repoGithubId !== null) {
    return byGithubId.get(requiredBigInt(repoGithubId, 'repository id').toString());
  }
  const fullName = text(release.repo_full_name ?? release.repoFullName);
  return fullName ? byFullName.get(fullName) : undefined;
}
