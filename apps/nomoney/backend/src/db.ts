import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import type { DbClient, DbValue, ProductMode } from './types.js';
import { calculateDomainRarity, inferDomainExtension } from './domainProviders.js';

type SqlStatement = {
  bind(params: DbValue[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
  run(params?: DbValue[]): void;
};

type SqlDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  export(): Uint8Array;
};

export interface DatabaseOptions {
  filePath?: string;
  persist: boolean;
  product?: ProductMode;
}

export async function createDatabase(options: DatabaseOptions): Promise<DbClient> {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const initialData =
    options.persist && options.filePath && fs.existsSync(options.filePath)
      ? fs.readFileSync(options.filePath)
      : undefined;
  const sql = initialData ? new SQL.Database(initialData) : new SQL.Database();
  const client = new SqlJsClient(sql as SqlDatabase, options.filePath, options.persist);
  migrate(client, options.product ?? 'nomoney');
  return client;
}

class SqlJsClient implements DbClient {
  private transactionDepth = 0;

  constructor(
    private readonly sql: SqlDatabase,
    private readonly filePath: string | undefined,
    private readonly persist: boolean
  ) {}

  exec(sql: string): void {
    const statement = sql.trim().toUpperCase();
    this.sql.exec(sql);
    if (/^BEGIN\b/.test(statement)) {
      this.transactionDepth += 1;
      return;
    }
    if (/^(COMMIT|END)\b/.test(statement)) {
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      this.save();
      return;
    }
    if (/^ROLLBACK\b/.test(statement)) {
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      return;
    }
    this.saveIfOutsideTransaction();
  }

  run(sql: string, params: DbValue[] = []): void {
    const stmt = this.sql.prepare(sql);
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
    this.saveIfOutsideTransaction();
  }

  get<T extends Record<string, unknown>>(sql: string, params: DbValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  all<T extends Record<string, unknown>>(sql: string, params: DbValue[] = []): T[] {
    const stmt = this.sql.prepare(sql);
    const rows: T[] = [];
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  insert(sql: string, params: DbValue[] = []): number {
    const stmt = this.sql.prepare(sql);
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
    const row = this.get<{ id: number }>('SELECT last_insert_rowid() as id');
    this.saveIfOutsideTransaction();
    return Number(row?.id);
  }

  save(): void {
    if (!this.persist || !this.filePath) {
      return;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    let fileDescriptor: number | undefined;
    try {
      fileDescriptor = fs.openSync(tempPath, 'wx', 0o600);
      fs.writeFileSync(fileDescriptor, Buffer.from(this.sql.export()));
      fs.fsyncSync(fileDescriptor);
      fs.closeSync(fileDescriptor);
      fileDescriptor = undefined;
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
      fs.rmSync(tempPath, { force: true });
      throw error;
    }
  }

  private saveIfOutsideTransaction(): void {
    if (this.transactionDepth === 0) {
      this.save();
    }
  }
}

function migrate(db: DbClient, product: ProductMode): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_type TEXT NOT NULL DEFAULT 'domestic',
      is_esim INTEGER NOT NULL DEFAULT 0,
      card_number TEXT NOT NULL,
      po_phone_number TEXT,
      carrier TEXT,
      plan_name TEXT,
      real_name_person TEXT,
      user_name TEXT,
      is_secondary_card INTEGER NOT NULL DEFAULT 0,
      data_allowance_gb REAL,
      voice_minutes INTEGER,
      monthly_rent_minor_units INTEGER,
      attached_services TEXT,
      attached_services_minor_units INTEGER,
      discount_minor_units INTEGER,
      cashback_minor_units INTEGER,
      country_code TEXT,
      home_location TEXT,
      a_phone_number TEXT,
      mainland_number TEXT,
      real_name_method TEXT,
      balance_minor_units INTEGER,
      total_keepalive_until TEXT,
      keepalive_method TEXT,
      minimum_keepalive_amount_minor_units INTEGER,
      keepalive_days INTEGER,
      amount_minor_units INTEGER NOT NULL,
      currency TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      billing_day INTEGER,
      activate_date TEXT,
      next_due_date TEXT,
      expire_date TEXT,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT,
      renewal_url TEXT,
      status TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS vps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      vps_type TEXT,
      provider TEXT,
      ip_address TEXT,
      location TEXT,
      cpu TEXT,
      memory TEXT,
      storage TEXT,
      bandwidth TEXT,
      os TEXT,
      ssh_host TEXT,
      ssh_port INTEGER,
      ssh_user TEXT,
      ssh_auth_type TEXT,
      ssh_password TEXT,
      ssh_private_key TEXT,
      ssh_private_key_passphrase TEXT,
      ssh_host_fingerprint TEXT,
      ssh_command TEXT,
      probe_url TEXT,
      probe_port INTEGER,
      probe_api_key TEXT,
      probe_install_status TEXT,
      probe_install_message TEXT,
      probe_installed_at TEXT,
      ssh_last_test_status TEXT,
      ssh_last_test_message TEXT,
      ssh_last_tested_at TEXT,
      monitor_status TEXT,
      monitor_cpu_percent REAL,
      monitor_memory_percent REAL,
      monitor_disk_percent REAL,
      monitor_net_in_bps INTEGER,
      monitor_net_out_bps INTEGER,
      monitor_net_total_in_bytes INTEGER,
      monitor_net_total_out_bytes INTEGER,
      monitor_load1 REAL,
      monitor_uptime_seconds INTEGER,
      monitor_updated_at TEXT,
      amount_minor_units INTEGER NOT NULL,
      currency TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      start_date TEXT,
      next_due_date TEXT,
      expire_date TEXT,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT,
      renewal_url TEXT,
      status TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_name TEXT NOT NULL,
      registrar TEXT,
      registrar_account TEXT,
      registrar_url TEXT,
      dns_provider TEXT,
      purpose TEXT,
      register_date TEXT,
      last_renew_date TEXT,
      domain_extension TEXT,
      rarity_score INTEGER NOT NULL DEFAULT 0,
      next_due_date TEXT,
      expire_date TEXT,
      amount_minor_units INTEGER NOT NULL,
      currency TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT,
      renewal_url TEXT,
      status TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      purchase_type TEXT NOT NULL DEFAULT 'subscription',
      provider TEXT,
      account TEXT,
      category TEXT,
      email TEXT,
      phone_number TEXT,
      license_key TEXT,
      device_limit INTEGER,
      content TEXT,
      amount_minor_units INTEGER NOT NULL,
      currency TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      next_due_date TEXT,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT,
      renewal_url TEXT,
      status TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_type TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      phone_key TEXT NOT NULL,
      country_calling_code TEXT NOT NULL,
      country_iso TEXT NOT NULL,
      bound_email TEXT NOT NULL,
      login_device TEXT,
      display_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      UNIQUE(account_type, country_calling_code, phone_key)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type TEXT NOT NULL,
      asset_id INTEGER NOT NULL,
      amount_minor_units INTEGER NOT NULL,
      currency TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      category TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS renewal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      asset_type TEXT NOT NULL,
      asset_id INTEGER NOT NULL,
      previous_expire_date TEXT NOT NULL,
      previous_next_due_date TEXT,
      renewed_expire_date TEXT NOT NULL,
      expense_id INTEGER,
      amount_minor_units INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undone_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_renewal_events_asset
      ON renewal_events(asset_type, asset_id, status);

    CREATE TABLE IF NOT EXISTS reminder_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      asset_id INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      days_before INTEGER NOT NULL,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      UNIQUE(asset_type, asset_id, due_date, days_before, status)
    );

    CREATE TABLE IF NOT EXISTS vps_status_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL,
      sampled_at TEXT NOT NULL,
      state TEXT NOT NULL,
      latency_ms INTEGER,
      detail TEXT,
      UNIQUE(vps_id, sampled_at)
    );

    CREATE INDEX IF NOT EXISTS idx_vps_status_samples_vps_time
      ON vps_status_samples(vps_id, sampled_at);

    CREATE TABLE IF NOT EXISTS vps_status_daily (
      vps_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      state TEXT NOT NULL,
      uptime_percent REAL,
      sample_count INTEGER NOT NULL,
      up_count INTEGER NOT NULL,
      degraded_count INTEGER NOT NULL,
      down_count INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(vps_id, day)
    );
  `);

  seedSetting(db, 'reminderDays', [30, 14, 7, 3, 1, 0]);
  seedSetting(db, 'reminderEnabled', true);
  seedSetting(db, 'defaultCurrency', 'CNY');
  seedSetting(db, 'timezone', 'Asia/Shanghai');
  seedSetting(db, 'language', 'zh');
  seedSetting(db, 'smtpHost', '');
  seedSetting(db, 'smtpPort', 587);
  seedSetting(db, 'smtpUser', '');
  seedSetting(db, 'smtpFrom', '');
  seedSetting(db, 'smtpTo', '');
  seedSetting(db, 'webdavUrl', '');
  seedSetting(db, 'webdavUsername', '');
  seedSetting(db, 'webdavPassword', '');
  seedSetting(db, 'webdavPath', product === 'yumi' ? 'yumi-backup.json.enc' : 'nomoney-backup.json.enc');
  seedSetting(db, 'webdavFolderPath', '');
  seedSetting(db, 'webdavBackupFilename', '');
  seedSetting(db, 'webdavEncryptionKey', '');
  seedSetting(db, 'productMode', product);
  seedSetting(db, 'statusSampleMinutes', 5);
  seedSetting(db, 'statusRetentionDays', 365);
  ensureColumn(db, 'users', 'session_version', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'accounts', 'login_device', 'TEXT');
  ensureColumn(db, 'accounts', 'archived_at', 'TEXT');
  ensureColumn(db, 'phones', 'phone_type', "TEXT NOT NULL DEFAULT 'domestic'");
  ensureColumn(db, 'phones', 'is_esim', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'phones', 'po_phone_number', 'TEXT');
  ensureColumn(db, 'phones', 'real_name_person', 'TEXT');
  ensureColumn(db, 'phones', 'user_name', 'TEXT');
  ensureColumn(db, 'phones', 'is_secondary_card', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'phones', 'data_allowance_gb', 'REAL');
  ensureColumn(db, 'phones', 'voice_minutes', 'INTEGER');
  ensureColumn(db, 'phones', 'monthly_rent_minor_units', 'INTEGER');
  ensureColumn(db, 'phones', 'attached_services', 'TEXT');
  ensureColumn(db, 'phones', 'attached_services_minor_units', 'INTEGER');
  ensureColumn(db, 'phones', 'discount_minor_units', 'INTEGER');
  ensureColumn(db, 'phones', 'cashback_minor_units', 'INTEGER');
  ensureColumn(db, 'phones', 'country_code', 'TEXT');
  ensureColumn(db, 'phones', 'home_location', 'TEXT');
  ensureColumn(db, 'phones', 'a_phone_number', 'TEXT');
  ensureColumn(db, 'phones', 'mainland_number', 'TEXT');
  ensureColumn(db, 'phones', 'real_name_method', 'TEXT');
  ensureColumn(db, 'phones', 'balance_minor_units', 'INTEGER');
  ensureColumn(db, 'phones', 'total_keepalive_until', 'TEXT');
  ensureColumn(db, 'phones', 'keepalive_method', 'TEXT');
  ensureColumn(db, 'phones', 'minimum_keepalive_amount_minor_units', 'INTEGER');
  ensureColumn(db, 'phones', 'keepalive_days', 'INTEGER');
  ensureColumn(db, 'domains', 'registrar_account', 'TEXT');
  ensureColumn(db, 'domains', 'registrar_url', 'TEXT');
  ensureColumn(db, 'domains', 'domain_extension', 'TEXT');
  ensureColumn(db, 'domains', 'rarity_score', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'domains', 'last_renew_date', 'TEXT');
  ensureColumn(db, 'subscriptions', 'purchase_type', "TEXT NOT NULL DEFAULT 'subscription'");
  ensureColumn(db, 'subscriptions', 'email', 'TEXT');
  ensureColumn(db, 'subscriptions', 'phone_number', 'TEXT');
  ensureColumn(db, 'subscriptions', 'license_key', 'TEXT');
  ensureColumn(db, 'subscriptions', 'device_limit', 'INTEGER');
  ensureColumn(db, 'subscriptions', 'content', 'TEXT');
  ensureColumn(db, 'vps', 'vps_type', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_host', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_port', 'INTEGER');
  ensureColumn(db, 'vps', 'ssh_user', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_auth_type', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_password', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_private_key', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_private_key_passphrase', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_host_fingerprint', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_command', 'TEXT');
  ensureColumn(db, 'vps', 'probe_url', 'TEXT');
  ensureColumn(db, 'vps', 'probe_port', 'INTEGER');
  ensureColumn(db, 'vps', 'probe_api_key', 'TEXT');
  ensureColumn(db, 'vps', 'probe_install_status', 'TEXT');
  ensureColumn(db, 'vps', 'probe_install_message', 'TEXT');
  ensureColumn(db, 'vps', 'probe_installed_at', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_last_test_status', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_last_test_message', 'TEXT');
  ensureColumn(db, 'vps', 'ssh_last_tested_at', 'TEXT');
  ensureColumn(db, 'vps', 'monitor_status', 'TEXT');
  ensureColumn(db, 'vps', 'monitor_cpu_percent', 'REAL');
  ensureColumn(db, 'vps', 'monitor_memory_percent', 'REAL');
  ensureColumn(db, 'vps', 'monitor_disk_percent', 'REAL');
  ensureColumn(db, 'vps', 'monitor_net_in_bps', 'INTEGER');
  ensureColumn(db, 'vps', 'monitor_net_out_bps', 'INTEGER');
  ensureColumn(db, 'vps', 'monitor_net_total_in_bytes', 'INTEGER');
  ensureColumn(db, 'vps', 'monitor_net_total_out_bytes', 'INTEGER');
  ensureColumn(db, 'vps', 'monitor_load1', 'REAL');
  ensureColumn(db, 'vps', 'monitor_uptime_seconds', 'INTEGER');
  ensureColumn(db, 'vps', 'monitor_updated_at', 'TEXT');
  backfillDomainMetadata(db);
  backfillDomainRenewalDates(db);
}

function seedSetting(db: DbClient, key: string, value: unknown): void {
  db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [
    key,
    JSON.stringify(value)
  ]);
}

function ensureColumn(db: DbClient, table: string, column: string, definition: string): void {
  const columns = db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((item) => item.name === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function backfillDomainMetadata(db: DbClient): void {
  const rows = db.all<{ id: number; domain_name: string; domain_extension: string | null; rarity_score: number | null }>(
    'SELECT id, domain_name, domain_extension, rarity_score FROM domains'
  );
  for (const row of rows) {
    const extension = row.domain_extension || inferDomainExtension(row.domain_name);
    const rarityScore = row.rarity_score && row.rarity_score > 0
      ? row.rarity_score
      : calculateDomainRarity(row.domain_name, extension);
    db.run('UPDATE domains SET domain_extension = ?, rarity_score = ? WHERE id = ?', [
      extension,
      rarityScore,
      row.id
    ]);
  }
}

function backfillDomainRenewalDates(db: DbClient): void {
  db.run(`
    UPDATE domains
    SET last_renew_date = register_date
    WHERE (last_renew_date IS NULL OR last_renew_date = '')
      AND register_date IS NOT NULL
      AND register_date != ''
  `);
  db.run(`
    UPDATE domains
    SET next_due_date = expire_date
    WHERE (next_due_date IS NULL OR next_due_date = '')
      AND expire_date IS NOT NULL
      AND expire_date != ''
  `);
}
