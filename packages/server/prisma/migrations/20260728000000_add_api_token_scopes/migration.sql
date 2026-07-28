ALTER TABLE "ApiToken"
ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['bookmarks:read', 'bookmarks:write', 'ai:analyze']::TEXT[];
