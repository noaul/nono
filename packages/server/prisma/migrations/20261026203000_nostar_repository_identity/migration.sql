-- Names can be reused after a rename. GitHub id remains the user-owned identity.
DROP INDEX "NoStarRepository_userId_fullName_key";
CREATE INDEX "NoStarRepository_userId_fullName_idx" ON "NoStarRepository"("userId", "fullName");
