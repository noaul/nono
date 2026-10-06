-- Duplicate detection now compares normalized URLs exactly instead of ignoring case.
CREATE INDEX "Link_url_idx" ON "Link" USING HASH ("url");
