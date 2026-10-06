ALTER TABLE "Link" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Link_tags_idx" ON "Link" USING GIN ("tags");
