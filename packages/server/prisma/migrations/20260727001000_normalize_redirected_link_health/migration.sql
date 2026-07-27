UPDATE "Link"
SET
  "healthStatus" = 'ok',
  "healthReason" = NULL,
  "healthFinalUrl" = NULL
WHERE "healthStatus" = 'redirected';
