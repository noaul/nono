ALTER TABLE "Clip"
ADD COLUMN "clipKind" TEXT NOT NULL DEFAULT 'page',
ADD COLUMN "selectionFingerprint" TEXT NOT NULL DEFAULT '';

UPDATE "Clip"
SET
  "clipKind" = 'selection',
  "selectionFingerprint" = "contentHash"
WHERE "extractor" = 'selection';

DROP INDEX "Clip_userId_canonicalUrl_key";

CREATE UNIQUE INDEX "Clip_userId_canonicalUrl_clipKind_selectionFingerprint_key"
ON "Clip"("userId", "canonicalUrl", "clipKind", "selectionFingerprint");
