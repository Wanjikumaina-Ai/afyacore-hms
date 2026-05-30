import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// ESM __dirname shim (not available in ES modules natively)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// ─── Constants ────────────────────────────────────────────────────────────────
const DB_VERSION = '1.0.0';
const SAVE_INTERVAL_MS = 5_000; // flush WAL to disk every 5s
const DB_FILENAME = 'afyacore.db';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface TransactionCallback {
  (db: AfyaDatabase): void | Promise<void>;
}

// ─── AfyaDatabase ─────────────────────────────────────────────────────────────
export class AfyaDatabase {
  private static instance: AfyaDatabase | null = null;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private dbPath: string = '';
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private isDirty = false;
  private isInitialized = false;

  // Singleton
  static getInstance(): AfyaDatabase {
    if (!AfyaDatabase.instance) {
      AfyaDatabase.instance = new AfyaDatabase();
    }
    return AfyaDatabase.instance;
  }

  // ─── Initialization ──────────────────────────────────────────────────────
  async initialize(dbPathOverride?: string): Promise<void> {
    if (this.isInitialized) return;

    this.SQL = await initSqlJs({
      // In Electron, load the wasm from app resources
      locateFile: (file: string) => {
        if (process.type === 'renderer') {
          return `sql-wasm/${file}`;
        }
        return join(process.resourcesPath ?? __dirname, 'sql-wasm', file);
      },
    });

    const userDataPath =
      dbPathOverride ??
      (typeof app !== 'undefined'
        ? join(app.getPath('userData'), 'data')
        : join(process.cwd(), '.afyadata'));

    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true });

    this.dbPath = join(userDataPath, DB_FILENAME);

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.applyPragmas();
    await this.runMigrations();
    this.startAutoSave();
    this.isInitialized = true;
    console.log('[AfyaDB] Initialized at:', this.dbPath);
  }

  private applyPragmas(): void {
    this.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
    `);
  }

  // ─── Migrations ──────────────────────────────────────────────────────────
  private async runMigrations(): Promise<void> {
    this.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const applied = this.query<{ version: string }>(
      `SELECT version FROM _migrations`,
    ).rows.map((r) => r.version);

    const migrations = getMigrations();
    for (const migration of migrations) {
      if (!applied.includes(migration.version)) {
        console.log(`[AfyaDB] Applying migration ${migration.version}`);
        this.exec(migration.sql);
        this.run(`INSERT INTO _migrations(version) VALUES(?)`, [
          migration.version,
        ]);
        this.isDirty = true;
      }
    }
  }

  // ─── Core Query Methods ──────────────────────────────────────────────────
  query<T = Record<string, unknown>>(
    sql: string,
    params: (string | number | null | Uint8Array)[] = [],
  ): QueryResult<T> {
    if (!this.db) throw new Error('[AfyaDB] Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return { rows, changes: this.db.getRowsModified(), lastInsertRowid: 0 };
  }

  run(
    sql: string,
    params: (string | number | null | Uint8Array)[] = [],
  ): QueryResult {
    if (!this.db) throw new Error('[AfyaDB] Database not initialized');
    this.db.run(sql, params);
    this.isDirty = true;
    return {
      rows: [],
      changes: this.db.getRowsModified(),
      lastInsertRowid: 0,
    };
  }

  exec(sql: string): void {
    if (!this.db) throw new Error('[AfyaDB] Database not initialized');
    this.db.run(sql);
    this.isDirty = true;
  }

  // ─── Transaction Support ─────────────────────────────────────────────────
  transaction<T>(fn: () => T): T {
    this.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.exec('COMMIT');
      return result;
    } catch (err) {
      this.exec('ROLLBACK');
      throw err;
    }
  }

  async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      this.exec('COMMIT');
      return result;
    } catch (err) {
      this.exec('ROLLBACK');
      throw err;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  findOne<T = Record<string, unknown>>(
    sql: string,
    params: (string | number | null)[] = [],
  ): T | null {
    const { rows } = this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  exists(table: string, where: string, params: (string | number | null)[] = []): boolean {
    const result = this.query(
      `SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`,
      params,
    );
    return result.rows.length > 0;
  }

  count(table: string, where = '1=1', params: (string | number | null)[] = []): number {
    const result = this.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM ${table} WHERE ${where}`,
      params,
    );
    return result.rows[0]?.cnt ?? 0;
  }

  // Generic insert helper
  insert(table: string, data: Record<string, unknown>): string {
    const id = data.id as string ?? generateId();
    const record = { ...data, id };
    const keys = Object.keys(record);
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(record).map((v) =>
      v === undefined ? null : (v as string | number | null),
    );
    this.run(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    return id;
  }

  // Generic update helper
  update(
    table: string,
    id: string,
    data: Record<string, unknown>,
  ): void {
    const fields = Object.keys(data)
      .filter((k) => k !== 'id')
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(
      Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'id')),
    ).map((v) => (v === undefined ? null : (v as string | number | null)));
    this.run(`UPDATE ${table} SET ${fields}, updated_at = datetime('now') WHERE id = ?`, [
      ...values,
      id,
    ]);
  }

  // Paginated query helper
  paginate<T = Record<string, unknown>>(
    sql: string,
    countSql: string,
    params: (string | number | null)[] = [],
    page = 1,
    pageSize = 25,
  ): { rows: T[]; total: number; page: number; pageSize: number; totalPages: number } {
    const offset = (page - 1) * pageSize;
    const { rows } = this.query<T>(`${sql} LIMIT ? OFFSET ?`, [
      ...params,
      pageSize,
      offset,
    ]);
    const countResult = this.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;
    return {
      rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ─── Persistence ─────────────────────────────────────────────────────────
  flush(): void {
    if (!this.db || !this.isDirty) return;
    try {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
      this.isDirty = false;
    } catch (err) {
      console.error('[AfyaDB] Failed to flush to disk:', err);
    }
  }

  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      this.flush();
    }, SAVE_INTERVAL_MS);
  }

  // ─── Backup ──────────────────────────────────────────────────────────────
  backup(destPath: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.flush();
    const data = this.db.export();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(destPath, `afyacore_backup_${timestamp}.db`);
    writeFileSync(backupPath, Buffer.from(data));
    console.log('[AfyaDB] Backup written to:', backupPath);
  }

  restore(backupPath: string): void {
    if (!this.SQL) throw new Error('SQL.js not loaded');
    const buffer = readFileSync(backupPath);
    this.db = new this.SQL.Database(buffer);
    this.applyPragmas();
    this.isDirty = true;
    this.flush();
    console.log('[AfyaDB] Restored from:', backupPath);
  }

  // ─── Teardown ────────────────────────────────────────────────────────────
  close(): void {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.flush();
    this.db?.close();
    this.db = null;
    this.isInitialized = false;
    AfyaDatabase.instance = null;
  }

  get ready(): boolean {
    return this.isInitialized && this.db !== null;
  }
}

// ─── Migrations Registry ──────────────────────────────────────────────────────
function getMigrations(): Array<{ version: string; sql: string }> {
  return [
    {
      version: DB_VERSION,
      sql: readFileSync(
        join(__dirname, 'schema.sql'),
        'utf-8',
      ),
    },
  ];
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : 
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
}

export function generateSequentialNumber(
  db: AfyaDatabase,
  prefix: string,
  table: string,
  column: string,
): string {
  const result = db.query<{ max_num: string }>(
    `SELECT MAX(CAST(SUBSTR(${column}, LENGTH(?) + 2) AS INTEGER)) as max_num FROM ${table} WHERE ${column} LIKE ?`,
    [prefix, `${prefix}-%`],
  );
  const next = (result.rows[0]?.max_num ?? 0) + 1;
  return `${prefix}-${String(next).padStart(6, '0')}`;
}

// ─── Export singleton accessor ────────────────────────────────────────────────
export const db = AfyaDatabase.getInstance();
