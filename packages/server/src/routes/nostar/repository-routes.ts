import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../../types.js';
import {
  asRecord,
  authed,
  boundedInt,
  findReleaseRepository,
  releaseData,
  repositoryData,
  requiredBigInt,
  toLegacyRelease,
  toLegacyRepository,
} from './common.js';

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
    });
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
    await services.prisma.$transaction(async (tx) => {
      for (const release of releases) {
        const githubId = requiredBigInt(release.id, 'release id');
        const repository = await findReleaseRepository(tx, user.id, release);
        if (!repository) continue;
        const data = releaseData(release, repository.id);
        await tx.noStarRelease.upsert({
          where: { userId_githubId: { userId: user.id, githubId } },
          update: data,
          create: { userId: user.id, githubId, ...data },
        });
      }
    });
    return { synced: releases.length };
  });

  app.post('/api/nostar/releases/mark-all-read', async (request, reply) => {
    const user = await authed(request, reply, services);
    if (!user) return;
    const result = await services.prisma.noStarRelease.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return { updated: result.count };
  });
}
