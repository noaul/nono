-- Server-side bookmark search.
--
-- As with the retired clipper search, trigrams match substrings in any script; PostgreSQL has no
-- Chinese parser for tsvector. The STORED column keeps the lower-cased haystack next to the row so
-- the GIN index serves ILIKE and similarity queries of three or more characters.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Link"
ADD COLUMN "searchText" TEXT
GENERATED ALWAYS AS (
  lower(coalesce("name", '') || E'\n' || coalesce("url", '') || E'\n' || coalesce("description", ''))
) STORED;

CREATE INDEX "Link_search_trgm_idx"
ON "Link" USING GIN ("searchText" gin_trgm_ops);
