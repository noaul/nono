-- CreateTable
CREATE TABLE "NoStarAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "githubLogin" TEXT,
    "githubName" TEXT,
    "githubAvatarUrl" TEXT,
    "githubTokenEncrypted" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarRepository" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "githubId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "htmlUrl" TEXT NOT NULL,
    "stargazersCount" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "githubCreatedAt" TIMESTAMP(3),
    "githubUpdatedAt" TIMESTAMP(3),
    "githubPushedAt" TIMESTAMP(3),
    "starredAt" TIMESTAMP(3),
    "ownerLogin" TEXT NOT NULL,
    "ownerAvatarUrl" TEXT,
    "topics" JSONB NOT NULL DEFAULT '[]',
    "aiSummary" TEXT,
    "aiTags" JSONB NOT NULL DEFAULT '[]',
    "aiPlatforms" JSONB NOT NULL DEFAULT '[]',
    "analyzedAt" TIMESTAMP(3),
    "analysisFailed" BOOLEAN NOT NULL DEFAULT false,
    "customDescription" TEXT,
    "customTags" JSONB NOT NULL DEFAULT '[]',
    "customCategory" TEXT,
    "categoryLocked" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedAt" TIMESTAMP(3),
    "subscribedToReleases" BOOLEAN NOT NULL DEFAULT false,
    "vectorIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarRelease" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "githubId" BIGINT NOT NULL,
    "repositoryId" INTEGER NOT NULL,
    "tagName" TEXT NOT NULL,
    "name" TEXT,
    "body" TEXT,
    "publishedAt" TIMESTAMP(3),
    "htmlUrl" TEXT,
    "assets" JSONB NOT NULL DEFAULT '[]',
    "zipballUrl" TEXT,
    "tarballUrl" TEXT,
    "repoFullName" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "prerelease" BOOLEAN NOT NULL DEFAULT false,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarCategory" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "legacyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'folder',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCustom" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarAiProfile" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "apiType" TEXT NOT NULL DEFAULT 'openai',
    "baseUrl" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "model" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "customPrompt" TEXT,
    "useCustomPrompt" BOOLEAN NOT NULL DEFAULT false,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "reasoningEffort" TEXT,
    "mimoPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarAiProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarWebDavConfig" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT,
    "path" TEXT NOT NULL DEFAULT '/',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarWebDavConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarAssetFilter" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "platform" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarAssetFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarSetting" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarEmbeddingConfig" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "apiType" TEXT NOT NULL DEFAULT 'openai',
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "apiKeyEncrypted" TEXT,
    "model" TEXT NOT NULL DEFAULT '',
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarEmbeddingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoStarVectorSearchConfig" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "workerUrl" TEXT NOT NULL DEFAULT '',
    "authTokenEncrypted" TEXT,
    "embeddingConfigId" TEXT,
    "indexMode" TEXT NOT NULL DEFAULT 'readme',
    "readmeMaxChars" INTEGER NOT NULL DEFAULT 6000,
    "status" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoStarVectorSearchConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoStarAccount_userId_key" ON "NoStarAccount"("userId");

-- CreateIndex
CREATE INDEX "NoStarRepository_userId_starredAt_idx" ON "NoStarRepository"("userId", "starredAt");

-- CreateIndex
CREATE INDEX "NoStarRepository_userId_customCategory_idx" ON "NoStarRepository"("userId", "customCategory");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarRepository_userId_githubId_key" ON "NoStarRepository"("userId", "githubId");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarRepository_userId_fullName_key" ON "NoStarRepository"("userId", "fullName");

-- CreateIndex
CREATE INDEX "NoStarRelease_userId_publishedAt_idx" ON "NoStarRelease"("userId", "publishedAt");

-- CreateIndex
CREATE INDEX "NoStarRelease_repositoryId_idx" ON "NoStarRelease"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarRelease_userId_githubId_key" ON "NoStarRelease"("userId", "githubId");

-- CreateIndex
CREATE INDEX "NoStarCategory_userId_sortOrder_idx" ON "NoStarCategory"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarCategory_userId_legacyId_key" ON "NoStarCategory"("userId", "legacyId");

-- CreateIndex
CREATE INDEX "NoStarAiProfile_userId_isActive_idx" ON "NoStarAiProfile"("userId", "isActive");

-- CreateIndex
CREATE INDEX "NoStarWebDavConfig_userId_isActive_idx" ON "NoStarWebDavConfig"("userId", "isActive");

-- CreateIndex
CREATE INDEX "NoStarAssetFilter_userId_sortOrder_idx" ON "NoStarAssetFilter"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarSetting_userId_key_key" ON "NoStarSetting"("userId", "key");

-- CreateIndex
CREATE INDEX "NoStarEmbeddingConfig_userId_isActive_idx" ON "NoStarEmbeddingConfig"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NoStarVectorSearchConfig_userId_key" ON "NoStarVectorSearchConfig"("userId");

-- AddForeignKey
ALTER TABLE "NoStarAccount" ADD CONSTRAINT "NoStarAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarRepository" ADD CONSTRAINT "NoStarRepository_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarRelease" ADD CONSTRAINT "NoStarRelease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarRelease" ADD CONSTRAINT "NoStarRelease_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "NoStarRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarCategory" ADD CONSTRAINT "NoStarCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarAiProfile" ADD CONSTRAINT "NoStarAiProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarWebDavConfig" ADD CONSTRAINT "NoStarWebDavConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarAssetFilter" ADD CONSTRAINT "NoStarAssetFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarSetting" ADD CONSTRAINT "NoStarSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarEmbeddingConfig" ADD CONSTRAINT "NoStarEmbeddingConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarVectorSearchConfig" ADD CONSTRAINT "NoStarVectorSearchConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoStarVectorSearchConfig" ADD CONSTRAINT "NoStarVectorSearchConfig_embeddingConfigId_fkey" FOREIGN KEY ("embeddingConfigId") REFERENCES "NoStarEmbeddingConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
