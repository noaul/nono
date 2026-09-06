-- Approved removal of live clipping data. Preserve historical migrations and pg_trgm.
-- Deploy only after verifying a full pre-upgrade backup, with writers stopped.
BEGIN;
DROP TABLE "ClipHighlight";
DROP TABLE "ClipTagOnClip";
DROP TABLE "ClipTag";
DROP TABLE "Clip";

DELETE FROM "TrashItem" WHERE "kind" = 'clip';
UPDATE "TrashItem"
SET "payload" = "payload" - 'linkedClipIds' - 'linkedClips'
WHERE "payload" ?| ARRAY['linkedClipIds', 'linkedClips'];

UPDATE "ApiToken"
SET "scopes" = array_remove(array_remove("scopes", 'clips:read'), 'clips:write')
WHERE "scopes" && ARRAY['clips:read', 'clips:write'];

UPDATE "AppConfig"
SET "settings" = jsonb_set("settings", '{navigationEntries}', COALESCE((
  SELECT jsonb_agg(entry ORDER BY position)
  FROM jsonb_array_elements("settings"->'navigationEntries') WITH ORDINALITY AS entries(entry, position)
  WHERE lower(COALESCE(entry->>'id', '')) <> 'clipper'
    AND COALESCE(entry->>'url', '') !~* '^/clipper([/?#]|$)'
), '[]'::jsonb))
WHERE jsonb_typeof("settings"->'navigationEntries') = 'array';

UPDATE "Site"
SET "settings" = jsonb_set("settings", '{navigationEntries}', COALESCE((
  SELECT jsonb_agg(entry ORDER BY position)
  FROM jsonb_array_elements("settings"->'navigationEntries') WITH ORDINALITY AS entries(entry, position)
  WHERE lower(COALESCE(entry->>'id', '')) <> 'clipper'
    AND COALESCE(entry->>'url', '') !~* '^/clipper([/?#]|$)'
), '[]'::jsonb))
WHERE jsonb_typeof("settings"->'navigationEntries') = 'array';
COMMIT;
