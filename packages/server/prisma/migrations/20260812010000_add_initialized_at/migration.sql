ALTER TABLE "AppConfig" ADD COLUMN "initializedAt" TIMESTAMP(3);

UPDATE "AppConfig"
SET "initializedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "User" WHERE "role" = 'admin' AND "passwordHash" IS NOT NULL
);
