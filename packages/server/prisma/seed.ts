import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/crypto.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, allowRegistration: process.env.ALLOW_REGISTRATION === 'true', defaultRole: 'user', settings: {} },
  });

  const passwordHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD || 'Password2026!');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@nono.local',
      displayName: 'Nono Admin',
      passwordHash,
      role: 'admin',
    },
  });

  await prisma.site.upsert({
    where: { slug: 'admin' },
    update: {},
    create: {
      userId: admin.id,
      name: 'Nono',
      description: '一个可自托管的网址导航主页',
      slug: 'admin',
      backgroundImage: 'https://api.dujin.org/bing/1920.php',
      backgroundColor: '#000000',
      fontColor: '#ffffff',
      searchUrlTemplate: 'https://www.google.com/search?q={query}',
      localSearchFirst: true,
      settings: {},
    },
  });

  const folder = await prisma.folder.upsert({
    where: { id: 1 },
    update: {},
    create: { userId: admin.id, name: '常用工具', icon: 'star', description: '', sortOrder: 100 },
  });

  await prisma.link.upsert({
    where: { id: 1 },
    update: {},
    create: { folderId: folder.id, name: 'GitHub', url: 'https://github.com/', icon: 'github', description: '', sortOrder: 100 },
  });
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
