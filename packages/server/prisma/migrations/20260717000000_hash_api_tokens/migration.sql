ALTER TABLE "ApiToken" ADD COLUMN "tokenPrefix" TEXT;

UPDATE "ApiToken"
SET
  "tokenPrefix" = LEFT("token", 10),
  "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

ALTER TABLE "ApiToken" ALTER COLUMN "tokenPrefix" SET NOT NULL;
