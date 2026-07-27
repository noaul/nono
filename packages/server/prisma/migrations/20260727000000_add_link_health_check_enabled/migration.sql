ALTER TABLE "Link"
ADD COLUMN "healthCheckEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Link"
SET
  "healthCheckEnabled" = false,
  "healthStatus" = NULL,
  "healthStatusCode" = NULL,
  "healthReason" = NULL,
  "healthFinalUrl" = NULL,
  "healthCheckedAt" = NULL
WHERE "url" ~* '^https?://(localhost|[^/:]+\.localhost|127\.[0-9.]+|10\.[0-9.]+|192\.168\.[0-9.]+|169\.254\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|\[::1\]|[^/:]+\.local)(:[0-9]+)?([/?#]|$)';

CREATE INDEX "Link_healthCheckEnabled_healthCheckedAt_idx"
ON "Link"("healthCheckEnabled", "healthCheckedAt");
