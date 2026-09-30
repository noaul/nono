import { defineConfig } from 'prisma/config';

// Prisma 7 reads the connection string from this file instead of schema.prisma and no longer loads .env files.
// Migrations stay next to the schema, so `--schema` still selects the matching migrations directory.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
