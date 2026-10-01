import type { Router } from 'express';
import { z, ZodError } from 'zod';
import { assetConfigs, createAsset, getAssetOrThrow, isSensitiveAssetField, mapAssetRow, type AssetConfig } from './assets.js';
import { asyncHandler, HttpError, parseBody } from './http.js';
import { statusSchema } from './schemas.js';
import type { AppContext, AssetType } from './types.js';
import { toIsoDate, toIsoDateTime } from './utils.js';

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(['trash', 'restore', 'status', 'addTag', 'removeTag', 'purge']),
  status: statusSchema.exclude(['archived']).optional(),
  tag: z.string().trim().min(1).max(60).optional()
});

const importSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  dryRun: z.boolean().optional().default(false)
});

// Runtime state written by monitors and checks; exporting it would only add noise.
const runtimeFieldPattern = /^(monitor|probeInstall|sshLastTest|ssl|rdap|traffic(Used|Period))|^sshHostFingerprint$|^rarityScore$/;

export function registerBulkRoutes(router: Router, context: AppContext, allowedTypes: AssetType[]): void {
  for (const config of assetConfigs.filter((item) => allowedTypes.includes(item.type))) {
    router.post(`/${config.route}/bulk`, asyncHandler(async (req, res) => {
      res.json(runBulkAction(context, config, parseBody(bulkSchema, req.body)));
    }));

    router.get(`/${config.route}/export.csv`, (req, res) => {
      const includeArchived = req.query.archived === 'true';
      const rows = context.db.all<Record<string, unknown>>(
        `SELECT * FROM ${config.table} ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY id`
      );
      const columns = exportColumns(config);
      const items = rows.map((row) => mapAssetRow(config, row, { encryptionKey: context.encryptionKey }) as Record<string, unknown>);
      sendCsv(res, `${config.route}-${toIsoDate(context.now())}.csv`, [
        columns.map((column) => column.header),
        ...items.map((item) => columns.map((column) => column.read(item)))
      ]);
    });

    router.post(`/${config.route}/import`, asyncHandler(async (req, res) => {
      const body = parseBody(importSchema, req.body);
      res.json(importCsv(context, config, body.csv, body.dryRun));
    }));
  }

  router.get('/expenses/export.csv', (_req, res) => {
    const placeholders = allowedTypes.map(() => '?').join(', ');
    const rows = context.db.all<Record<string, unknown>>(
      `SELECT * FROM expenses WHERE asset_type IN (${placeholders}) ORDER BY paid_at, id`,
      allowedTypes
    );
    const names = new Map<string, string>();
    const nameFor = (type: string, id: number) => {
      const key = `${type}:${id}`;
      if (!names.has(key)) {
        const config = assetConfigs.find((item) => item.type === type);
        const row = config ? context.db.get<{ name: string }>(`SELECT ${config.displayField} AS name FROM ${config.table} WHERE id = ?`, [id]) : undefined;
        names.set(key, row?.name ?? '');
      }
      return names.get(key)!;
    };
    sendCsv(res, `expenses-${toIsoDate(context.now())}.csv`, [
      ['paidAt', 'assetType', 'assetId', 'asset', 'amount', 'currency', 'category', 'periodStart', 'periodEnd', 'notes'],
      ...rows.map((row) => [
        String(row.paid_at ?? ''),
        String(row.asset_type ?? ''),
        String(row.asset_id ?? ''),
        nameFor(String(row.asset_type), Number(row.asset_id)),
        (Number(row.amount_minor_units ?? 0) / 100).toFixed(2),
        String(row.currency ?? ''),
        String(row.category ?? ''),
        String(row.period_start ?? ''),
        String(row.period_end ?? ''),
        String(row.notes ?? '')
      ])
    ]);
  });
}

function runBulkAction(context: AppContext, config: AssetConfig, input: z.infer<typeof bulkSchema>) {
  const now = toIsoDateTime(context.now());
  let changed = 0;
  context.db.exec('BEGIN');
  try {
    for (const id of new Set(input.ids)) {
      const row = context.db.get<{ id: number; archived_at: string | null; tags: string }>(
        `SELECT id, archived_at, tags FROM ${config.table} WHERE id = ?`, [id]
      );
      if (!row) continue;
      if (input.action === 'trash' && !row.archived_at) {
        context.db.run(`UPDATE ${config.table} SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
      } else if (input.action === 'restore' && row.archived_at) {
        context.db.run(`UPDATE ${config.table} SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?`, [now, id]);
      } else if (input.action === 'purge' && row.archived_at) {
        for (const table of ['expenses', 'renewal_events', 'reminder_logs']) {
          context.db.run(`DELETE FROM ${table} WHERE asset_type = ? AND asset_id = ?`, [config.type, id]);
        }
        context.db.run(`DELETE FROM ${config.table} WHERE id = ?`, [id]);
      } else if (input.action === 'status' && !row.archived_at) {
        if (!input.status) throw new HttpError(400, 'BULK_STATUS_REQUIRED', 'Choose a status');
        context.db.run(`UPDATE ${config.table} SET status = ?, updated_at = ? WHERE id = ?`, [input.status, now, id]);
      } else if ((input.action === 'addTag' || input.action === 'removeTag') && !row.archived_at) {
        if (!input.tag) throw new HttpError(400, 'BULK_TAG_REQUIRED', 'Enter a tag');
        const tags = new Set(parseTags(row.tags));
        if (input.action === 'addTag') tags.add(input.tag);
        else tags.delete(input.tag);
        context.db.run(`UPDATE ${config.table} SET tags = ?, updated_at = ? WHERE id = ?`, [JSON.stringify([...tags]), now, id]);
      } else {
        continue;
      }
      changed += 1;
    }
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }
  return { changed };
}

type ExportColumn = { header: string; api: string; kind: 'text' | 'money' | 'tags' | 'boolean' | 'number'; read: (item: Record<string, unknown>) => string };

function exportColumns(config: AssetConfig): ExportColumn[] {
  const shape = (config.schema as z.ZodObject).shape as Record<string, z.ZodType>;
  return config.fields
    .map((field) => field.api)
    .filter((api) => api in shape && !isSensitiveAssetField(config.type, api) && !runtimeFieldPattern.test(api))
    .map((api) => {
      const kind: ExportColumn['kind'] = api === 'tags' ? 'tags'
        : api.endsWith('MinorUnits') ? 'money'
          : api === 'autoRenew' || api.startsWith('is') ? 'boolean'
            : isNumberSchema(shape[api]) ? 'number' : 'text';
      // Money is exported as a decimal under a friendlier name: amountMinorUnits -> amount.
      const header = kind === 'money' ? api.replace(/MinorUnits$/, '') : api;
      return {
        header,
        api,
        kind,
        read: (item) => {
          const value = item[api];
          if (value === null || value === undefined) return '';
          if (kind === 'tags') return Array.isArray(value) ? value.join('; ') : '';
          if (kind === 'money') return (Number(value) / 100).toFixed(2);
          if (kind === 'boolean') return value ? 'true' : 'false';
          return String(value);
        }
      };
    });
}

function isNumberSchema(schema: z.ZodType | undefined): boolean {
  let current: unknown = schema;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const def = (current as { def?: { type?: string; innerType?: unknown } }).def;
    if (!def) return false;
    if (def.type === 'number') return true;
    current = def.innerType;
  }
  return false;
}

function importCsv(context: AppContext, config: AssetConfig, text: string, dryRun: boolean) {
  const table = parseCsv(text.replace(/^﻿/, ''));
  if (table.length < 2) throw new HttpError(400, 'CSV_EMPTY', 'The CSV needs a header row and at least one data row');
  const columns = exportColumns(config);
  const byHeader = new Map(columns.flatMap((column) => [[column.header.toLowerCase(), column], [column.api.toLowerCase(), column]]));
  const headers = table[0].map((header) => byHeader.get(header.trim().toLowerCase()) ?? null);
  const unknownHeaders = table[0].filter((_header, index) => !headers[index]).map((header) => header.trim()).filter(Boolean);
  const errors: Array<{ row: number; message: string }> = [];
  const created: number[] = [];

  context.db.exec('BEGIN');
  try {
    table.slice(1).forEach((cells, index) => {
      if (cells.every((cell) => !cell.trim())) return;
      const record: Record<string, unknown> = {};
      headers.forEach((column, cellIndex) => {
        if (!column) return;
        const raw = (cells[cellIndex] ?? '').trim();
        if (column.kind === 'tags') record[column.api] = raw ? raw.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean) : [];
        else if (!raw) record[column.api] = null;
        else if (column.kind === 'money') record[column.api] = Math.round(Number(raw.replace(/[^\d.-]/g, '')) * 100);
        else if (column.kind === 'number') record[column.api] = Number(raw);
        else if (column.kind === 'boolean') record[column.api] = ['true', '1', 'yes', 'y', '是'].includes(raw.toLowerCase());
        else record[column.api] = raw;
      });
      // Omit nulls for fields the schema requires with a default.
      for (const [key, value] of Object.entries(record)) if (value === null) delete record[key];
      try {
        created.push(createAsset(context, config, record));
      } catch (error) {
        errors.push({ row: index + 2, message: describeImportError(error) });
      }
    });
    if (dryRun || errors.length) context.db.exec('ROLLBACK');
    else context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  // All-or-nothing: a file with any bad row imports nothing, so it can be fixed and re-run.
  return {
    imported: dryRun || errors.length ? 0 : created.length,
    valid: created.length,
    errors,
    unknownHeaders,
    items: dryRun || errors.length ? [] : created.slice(0, 50).map((id) => getAssetOrThrow(context, config, id))
  };
}

function describeImportError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`).join('; ');
  }
  return error instanceof Error ? error.message : 'Invalid row';
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((raw) => {
    const cell = neutralizeFormula(raw);
    return /[",\r\n]/.test(cell) || /^\s|\s$/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  }).join(',')).join('\r\n');
}

// Spreadsheet apps execute cells starting with these characters as formulas.
function neutralizeFormula(cell: string): string {
  return /^[=+\-@\t]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell) ? `'${cell}` : cell;
}

function sendCsv(res: import('express').Response, filename: string, rows: string[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens UTF-8 (Chinese) text correctly.
  res.send(`﻿${toCsv(rows)}\r\n`);
}
