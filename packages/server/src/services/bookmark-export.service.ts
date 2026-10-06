import type { BackupCenterService } from './backup-center.service.js';
import { scheduleWindowKey } from './backup-automation.service.js';
import { exportBookmarksHtml } from './bookmark.service.js';
import type { Repository } from './repository.js';

const SETTINGS_KEY = 'bookmarkWebdavExport';
const WEBDAV_FOLDER = 'bookmarks';
const LATEST_FILE = 'bookmarks-latest.html';
const HTML_TYPE = 'text/html; charset=utf-8';

export interface BookmarkExportSettings {
  enabled: boolean;
  cadence: 'daily' | 'weekly';
  /** Local hour (Asia/Shanghai unless TZ says otherwise), 0-23. */
  hour: number;
  /** 0 = Sunday; only used for weekly exports. */
  weekday: number;
  /** Timestamped files kept on WebDAV; older ones are deleted. bookmarks-latest.html is always kept. */
  keep: number;
}

interface StoredBookmarkExport extends BookmarkExportSettings {
  /** Whose bookmarks are exported: the administrator who last saved the settings. */
  userId: number | null;
  lastScheduledFor: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Timestamped files this feature uploaded, newest first. */
  files: string[];
}

export interface BookmarkExportSnapshot {
  settings: BookmarkExportSettings;
  status: {
    webDavConfigured: boolean;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastFile: string | null;
    files: string[];
  };
}

export interface BookmarkExportService {
  get(): Promise<BookmarkExportSnapshot>;
  update(userId: number, settings: BookmarkExportSettings): Promise<BookmarkExportSnapshot>;
  runNow(userId: number): Promise<BookmarkExportSnapshot>;
  runDue(): Promise<{ ran: boolean }>;
}

const DEFAULTS: StoredBookmarkExport = {
  enabled: false,
  cadence: 'daily',
  hour: 4,
  weekday: 1,
  keep: 14,
  userId: null,
  lastScheduledFor: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  files: [],
};

export function createBookmarkExportService(options: {
  repo: Pick<Repository, 'getConfig' | 'updateConfig' | 'listFolders' | 'listLinks'>;
  backupCenter: Pick<BackupCenterService, 'isWebDavConfigured' | 'writeWebDavFile' | 'deleteWebDavFile'>;
  now?: () => Date;
  timeZone?: string;
}): BookmarkExportService {
  const now = options.now || (() => new Date());
  const timeZone = options.timeZone || process.env.TZ || 'Asia/Shanghai';
  let running = false;

  async function read(): Promise<StoredBookmarkExport> {
    const value = (await options.repo.getConfig()).settings?.[SETTINGS_KEY];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULTS };
    const stored = { ...DEFAULTS, ...(value as Partial<StoredBookmarkExport>) };
    return { ...stored, files: Array.isArray(stored.files) ? stored.files.filter((file) => typeof file === 'string') : [] };
  }

  async function write(patch: Partial<StoredBookmarkExport>) {
    const config = await options.repo.getConfig();
    const next = { ...(await read()), ...patch };
    await options.repo.updateConfig({ settings: { ...config.settings, [SETTINGS_KEY]: next } });
    return next;
  }

  async function snapshot(stored?: StoredBookmarkExport): Promise<BookmarkExportSnapshot> {
    const record = stored || await read();
    return {
      settings: { enabled: record.enabled, cadence: record.cadence, hour: record.hour, weekday: record.weekday, keep: record.keep },
      status: {
        webDavConfigured: await options.backupCenter.isWebDavConfigured(),
        lastRunAt: record.lastRunAt,
        lastSuccessAt: record.lastSuccessAt,
        lastError: record.lastError,
        lastFile: record.files[0] || null,
        files: record.files,
      },
    };
  }

  async function execute(userId: number, scheduledFor: string | null) {
    if (running) throw Object.assign(new Error('A bookmark export is already running'), { statusCode: 409 });
    running = true;
    const startedAt = now();
    try {
      const [folders, links] = await Promise.all([options.repo.listFolders(userId), options.repo.listLinks(userId)]);
      const body = Buffer.from(exportBookmarksHtml(folders, links), 'utf8');
      const filename = `bookmarks-${fileStamp(startedAt, timeZone)}.html`;
      await options.backupCenter.writeWebDavFile(WEBDAV_FOLDER, filename, body, HTML_TYPE);
      await options.backupCenter.writeWebDavFile(WEBDAV_FOLDER, LATEST_FILE, body, HTML_TYPE);
      const current = await read();
      const files = [filename, ...current.files.filter((file) => file !== filename)];
      const kept = files.slice(0, current.keep);
      const failedDeletes: string[] = [];
      for (const file of files.slice(current.keep)) {
        try {
          await options.backupCenter.deleteWebDavFile(WEBDAV_FOLDER, file);
        } catch {
          // Try again after the next export rather than failing this one.
          failedDeletes.push(file);
        }
      }
      return await write({
        files: [...kept, ...failedDeletes],
        lastScheduledFor: scheduledFor ?? current.lastScheduledFor,
        lastRunAt: startedAt.toISOString(),
        lastSuccessAt: now().toISOString(),
        lastError: null,
      });
    } catch (error) {
      await write({
        lastScheduledFor: scheduledFor ?? (await read()).lastScheduledFor,
        lastRunAt: startedAt.toISOString(),
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      });
      throw error;
    } finally {
      running = false;
    }
  }

  return {
    get: () => snapshot(),

    async update(userId, settings) {
      return snapshot(await write({ ...normalizeSettings(settings), userId }));
    },

    async runNow(userId) {
      return snapshot(await execute(userId, null));
    },

    async runDue() {
      const stored = await read();
      if (!stored.enabled || !stored.userId || running) return { ran: false };
      const scheduledFor = scheduleWindowKey(stored, now(), timeZone);
      if (stored.lastScheduledFor === scheduledFor) return { ran: false };
      if (!await options.backupCenter.isWebDavConfigured()) return { ran: false };
      // A failed run still claims its slot (execute records it), so a broken WebDAV host is not retried every few minutes.
      await execute(stored.userId, scheduledFor).catch(() => undefined);
      return { ran: true };
    },
  };
}

export function normalizeSettings(input: BookmarkExportSettings): BookmarkExportSettings {
  const clamp = (value: number, min: number, max: number, fallback: number) => (
    Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback
  );
  return {
    enabled: Boolean(input.enabled),
    cadence: input.cadence === 'weekly' ? 'weekly' : 'daily',
    hour: clamp(input.hour, 0, 23, DEFAULTS.hour),
    weekday: clamp(input.weekday, 0, 6, DEFAULTS.weekday),
    keep: clamp(input.keep, 1, 365, DEFAULTS.keep),
  };
}

function fileStamp(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}
