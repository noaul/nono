-- AlterTable
ALTER TABLE "NoStarAiProfile" ADD COLUMN     "legacyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "NoStarAssetFilter" ADD COLUMN     "legacyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "NoStarEmbeddingConfig" ADD COLUMN     "legacyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "NoStarWebDavConfig" ADD COLUMN     "legacyId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NoStarAiProfile_userId_legacyId_key" ON "NoStarAiProfile"("userId", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarAssetFilter_userId_legacyId_key" ON "NoStarAssetFilter"("userId", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarEmbeddingConfig_userId_legacyId_key" ON "NoStarEmbeddingConfig"("userId", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarWebDavConfig_userId_legacyId_key" ON "NoStarWebDavConfig"("userId", "legacyId");
