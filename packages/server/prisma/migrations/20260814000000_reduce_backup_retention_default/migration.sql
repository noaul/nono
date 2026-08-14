ALTER TABLE "BackupAutomation"
ALTER COLUMN "maxBackups" SET DEFAULT 7;

UPDATE "BackupAutomation"
SET "maxBackups" = 7
WHERE "maxBackups" = 14;
