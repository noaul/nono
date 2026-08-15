-- Clipper module: full-text clips, tags, highlights.
--
-- The table statements are Prisma-generated. Everything after them is hand-written because Prisma
-- cannot express a generated column or a trigram index.

-- CreateTable

CREATE TABLE "Clip" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "linkId" INTEGER,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "siteName" TEXT,
    "domain" TEXT NOT NULL,
    "description" TEXT,
    "excerpt" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL,
    "contentTruncated" BOOLEAN NOT NULL DEFAULT false,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "lang" TEXT,
    "favicon" TEXT,
    "image" TEXT,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'unread',
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "extractor" TEXT NOT NULL,
    "sourceMeta" JSONB,
    "clippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClipTag" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClipTagOnClip" (
    "clipId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ClipTagOnClip_pkey" PRIMARY KEY ("clipId","tagId")
);

CREATE TABLE "ClipHighlight" (
    "id" SERIAL NOT NULL,
    "clipId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "anchor" JSONB NOT NULL,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clip_linkId_key" ON "Clip"("linkId");
CREATE INDEX "Clip_userId_clippedAt_idx" ON "Clip"("userId", "clippedAt");
CREATE INDEX "Clip_userId_status_clippedAt_idx" ON "Clip"("userId", "status", "clippedAt");
CREATE UNIQUE INDEX "Clip_userId_canonicalUrl_key" ON "Clip"("userId", "canonicalUrl");
CREATE INDEX "ClipTag_userId_name_idx" ON "ClipTag"("userId", "name");
CREATE UNIQUE INDEX "ClipTag_userId_normalizedName_key" ON "ClipTag"("userId", "normalizedName");
CREATE INDEX "ClipTagOnClip_tagId_idx" ON "ClipTagOnClip"("tagId");
CREATE INDEX "ClipTagOnClip_userId_idx" ON "ClipTagOnClip"("userId");
CREATE INDEX "ClipHighlight_clipId_createdAt_idx" ON "ClipHighlight"("clipId", "createdAt");
CREATE INDEX "ClipHighlight_userId_idx" ON "ClipHighlight"("userId");

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClipTag" ADD CONSTRAINT "ClipTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipTagOnClip" ADD CONSTRAINT "ClipTagOnClip_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipTagOnClip" ADD CONSTRAINT "ClipTagOnClip_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ClipTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipTagOnClip" ADD CONSTRAINT "ClipTagOnClip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipHighlight" ADD CONSTRAINT "ClipHighlight_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipHighlight" ADD CONSTRAINT "ClipHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Search storage.
--
-- PostgreSQL ships no Chinese parser, so a tsvector over the built-in configurations would treat
-- CJK text as one undifferentiated block. Trigrams match substrings in any script instead, which
-- is the behaviour this content needs. The cost is real and accepted: the STORED column duplicates
-- contentMd, and queries shorter than three characters cannot use the index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Clip"
ADD COLUMN "searchText" TEXT
GENERATED ALWAYS AS (
  coalesce("title", '') || E'\n' || coalesce("contentMd", '')
) STORED;

CREATE INDEX "Clip_search_trgm_idx"
ON "Clip" USING GIN ("searchText" gin_trgm_ops);
