import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { DATABASE_FILENAME } from '../shared/constants.js';
import { builtinTemplates } from '../shared/builtin-templates.js';
import type {
  Template,
  Task,
  Execution,
  Credential,
  ExecutionFilters,
  TaskFilters,
  ExecutionStatus,
  CredentialType,
  ParamDefinition,
} from '../shared/types.js';

// Database row types (how data is stored in SQLite)
interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  code: string;
  params_schema: string;
  required_credentials: string;
  suggested_schedule: string | null;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: number;
  template_id: string;
  name: string;
  description: string | null;
  params: string;
  schedule_type: string;
  schedule_value: string;
  credentials: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface ExecutionRow {
  id: number;
  task_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  output: string | null;
  error: string | null;
  duration_ms: number | null;
}

interface CredentialRow {
  id: number;
  name: string;
  type: string;
  description: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface MigrationRow {
  id: number;
  name: string;
  applied_at: string;
}

// Migration definition
interface Migration {
  name: string;
  up: string;
}

// Migrations
const migrations: Migration[] = [
  {
    name: '001_initial_schema',
    up: `
      -- Templates (authored via UI)
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        code TEXT NOT NULL,
        params_schema TEXT NOT NULL DEFAULT '[]',
        required_credentials TEXT NOT NULL DEFAULT '[]',
        suggested_schedule TEXT,
        is_builtin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Tasks (instances of templates)
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id TEXT NOT NULL,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        params TEXT NOT NULL DEFAULT '{}',
        schedule_type TEXT NOT NULL,
        schedule_value TEXT NOT NULL,
        credentials TEXT DEFAULT '[]',
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_run_at TEXT,
        next_run_at TEXT,
        FOREIGN KEY (template_id) REFERENCES templates(id)
      );

      -- Execution History
      CREATE TABLE IF NOT EXISTS executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT,
        duration_ms INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Credential Metadata (values stored encrypted separately)
      CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
      CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run_at) WHERE enabled = 1;
      CREATE INDEX IF NOT EXISTS idx_tasks_template_id ON tasks(template_id);
      CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    `,
  },
];

/**
 * DatabaseService provides a typed interface for database operations
 */
export class DatabaseService {
  private db: Database.Database;
  private initialized = false;

  constructor(dbPath?: string) {
    const dataDir = dbPath ? join(dbPath, '..') : join(homedir(), '.personal-automator');
    const dbFile = dbPath ?? join(dataDir, DATABASE_FILENAME);

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbFile);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Use WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');
  }

  /**
   * Initialize the database (run migrations)
   */
  initialize(): void {
    if (this.initialized) return;

    // Create migrations table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Get applied migrations
    const appliedMigrations = this.db
      .prepare<[], MigrationRow>('SELECT * FROM _migrations ORDER BY id')
      .all()
      .map((m) => m.name);

    // Run pending migrations
    for (const migration of migrations) {
      if (!appliedMigrations.includes(migration.name)) {
        console.log(`Running migration: ${migration.name}`);
        this.db.exec(migration.up);
        this.db
          .prepare<[string], void>('INSERT INTO _migrations (name) VALUES (?)')
          .run(migration.name);
      }
    }

    // Seed built-in templates
    this.seedBuiltinTemplates();

    this.initialized = true;
  }

  /**
   * Seed built-in templates if they don't exist
   */
  private seedBuiltinTemplates(): void {
    for (const template of builtinTemplates) {
      if (!this.templateExists(template.id)) {
        console.log(`Seeding built-in template: ${template.name}`);
        this.createTemplate({
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          code: template.code,
          paramsSchema: template.paramsSchema,
          requiredCredentials: template.requiredCredentials,
          suggestedSchedule: template.suggestedSchedule ?? null,
          isBuiltin: true,
        });
      }
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if database is connected and initialized
   */
  isConnected(): boolean {
    try {
      this.db.prepare('SELECT 1').get();
      return this.initialized;
    } catch {
      return false;
    }
  }

  // ============================================
  // Template Operations
  // ============================================

  private rowToTemplate(row: TemplateRow): Template {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      code: row.code,
      paramsSchema: JSON.parse(row.params_schema) as ParamDefinition[],
      requiredCredentials: JSON.parse(row.required_credentials) as string[],
      suggestedSchedule: row.suggested_schedule,
      isBuiltin: row.is_builtin === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all templates, optionally filtered by category
   */
  getTemplates(category?: string): Template[] {
    let rows: TemplateRow[];

    if (category) {
      const query = 'SELECT * FROM templates WHERE category = ? ORDER BY name';
      rows = this.db.prepare<[string], TemplateRow>(query).all(category) as TemplateRow[];
    } else {
      const query = 'SELECT * FROM templates ORDER BY name';
      rows = this.db.prepare<[], TemplateRow>(query).all() as TemplateRow[];
    }

    return rows.map((row) => this.rowToTemplate(row));
  }

  /**
   * Get a single template by ID
   */
  getTemplate(id: string): Template | null {
    const row = this.db
      .prepare<[string], TemplateRow>('SELECT * FROM templates WHERE id = ?')
      .get(id);
    return row ? this.rowToTemplate(row) : null;
  }

  /**
   * Create a new template
   */
  createTemplate(template: Omit<Template, 'createdAt' | 'updatedAt'>): Template {
    const now = new Date().toISOString();
    this.db
      .prepare<
        [string, string, string | null, string | null, string, string, string, string | null, number]
      >(
        `INSERT INTO templates (id, name, description, category, code, params_schema, required_credentials, suggested_schedule, is_builtin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        template.id,
        template.name,
        template.description,
        template.category,
        template.code,
        JSON.stringify(template.paramsSchema),
        JSON.stringify(template.requiredCredentials),
        template.suggestedSchedule,
        template.isBuiltin ? 1 : 0
      );

    return {
      ...template,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update an existing template
   */
  updateTemplate(
    id: string,
    updates: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltin'>>
  ): Template | null {
    const existing = this.getTemplate(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = { ...existing, ...updates, updatedAt: now };

    this.db
      .prepare<[string, string | null, string | null, string, string, string, string | null, string, string]>(
        `UPDATE templates
       SET name = ?, description = ?, category = ?, code = ?,
           params_schema = ?, required_credentials = ?, suggested_schedule = ?, updated_at = ?
       WHERE id = ?`
      )
      .run(
        updated.name,
        updated.description,
        updated.category,
        updated.code,
        JSON.stringify(updated.paramsSchema),
        JSON.stringify(updated.requiredCredentials),
        updated.suggestedSchedule,
        now,
        id
      );

    return updated;
  }

  /**
   * Delete a template by ID
   */
  deleteTemplate(id: string): boolean {
    const result = this.db.prepare<[string]>('DELETE FROM templates WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Check if a template exists
   */
  templateExists(id: string): boolean {
    const row = this.db
      .prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM templates WHERE id = ?')
      .get(id);
    return (row?.count ?? 0) > 0;
  }

  // ============================================
  // Task Operations
  // ============================================

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      templateId: row.template_id,
      name: row.name,
      description: row.description,
      params: JSON.parse(row.params) as Record<string, unknown>,
      scheduleType: row.schedule_type as Task['scheduleType'],
      scheduleValue: row.schedule_value,
      credentials: JSON.parse(row.credentials) as string[],
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
    };
  }

  /**
   * Get all tasks with optional filters
   */
  getTasks(filters?: TaskFilters): Task[] {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters?.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filters.enabled ? 1 : 0);
    }

    if (filters?.templateId) {
      query += ' AND template_id = ?';
      params.push(filters.templateId);
    }

    if (filters?.hasErrors) {
      // Tasks with at least one failed execution in last 24 hours
      query += ` AND id IN (
        SELECT task_id FROM executions
        WHERE status = 'failed'
        AND started_at > datetime('now', '-1 day')
      )`;
    }

    query += ' ORDER BY name';

    const stmt = this.db.prepare<(string | number)[], TaskRow>(query);
    const rows = stmt.all(...params) as TaskRow[];
    return rows.map((row) => this.rowToTask(row));
  }

  /**
   * Get a single task by ID
   */
  getTask(id: number): Task | null {
    const row = this.db.prepare<[number], TaskRow>('SELECT * FROM tasks WHERE id = ?').get(id);
    return row ? this.rowToTask(row) : null;
  }

  /**
   * Get a task by name
   */
  getTaskByName(name: string): Task | null {
    const row = this.db.prepare<[string], TaskRow>('SELECT * FROM tasks WHERE name = ?').get(name);
    return row ? this.rowToTask(row) : null;
  }

  /**
   * Create a new task
   */
  createTask(
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt'> & {
      nextRunAt?: string | null;
    }
  ): Task {
    const now = new Date().toISOString();
    const result = this.db
      .prepare<
        [string, string, string | null, string, string, string, string, number, string | null]
      >(
        `INSERT INTO tasks (template_id, name, description, params, schedule_type, schedule_value, credentials, enabled, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.templateId,
        task.name,
        task.description,
        JSON.stringify(task.params),
        task.scheduleType,
        task.scheduleValue,
        JSON.stringify(task.credentials),
        task.enabled ? 1 : 0,
        task.nextRunAt ?? null
      );

    return {
      id: Number(result.lastInsertRowid),
      templateId: task.templateId,
      name: task.name,
      description: task.description,
      params: task.params,
      scheduleType: task.scheduleType,
      scheduleValue: task.scheduleValue,
      credentials: task.credentials,
      enabled: task.enabled,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: task.nextRunAt ?? null,
    };
  }

  /**
   * Update an existing task
   */
  updateTask(
    id: number,
    updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>
  ): Task | null {
    const existing = this.getTask(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = { ...existing, ...updates, updatedAt: now };

    this.db
      .prepare<[string, string | null, string, string, string, string, number, string | null, string | null, string, number]>(
        `UPDATE tasks
       SET name = ?, description = ?, params = ?, schedule_type = ?, schedule_value = ?,
           credentials = ?, enabled = ?, last_run_at = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`
      )
      .run(
        updated.name,
        updated.description,
        JSON.stringify(updated.params),
        updated.scheduleType,
        updated.scheduleValue,
        JSON.stringify(updated.credentials),
        updated.enabled ? 1 : 0,
        updated.lastRunAt,
        updated.nextRunAt,
        now,
        id
      );

    return updated;
  }

  /**
   * Delete a task by ID (cascades to executions)
   */
  deleteTask(id: number): boolean {
    const result = this.db.prepare<[number]>('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Toggle task enabled status
   */
  toggleTask(id: number): Task | null {
    const task = this.getTask(id);
    if (!task) return null;
    return this.updateTask(id, { enabled: !task.enabled });
  }

  /**
   * Update task last run time
   */
  updateTaskLastRun(id: number, lastRunAt: string, nextRunAt: string | null): void {
    this.db
      .prepare<[string, string | null, number]>(
        `UPDATE tasks SET last_run_at = ?, next_run_at = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(lastRunAt, nextRunAt, id);
  }

  /**
   * Get tasks that are due to run
   */
  getTasksDueToRun(): Task[] {
    const rows = this.db
      .prepare<[], TaskRow>(
        `SELECT * FROM tasks
       WHERE enabled = 1
       AND next_run_at IS NOT NULL
       AND next_run_at <= datetime('now')
       ORDER BY next_run_at`
      )
      .all() as TaskRow[];
    return rows.map((row) => this.rowToTask(row));
  }

  /**
   * Get count of tasks
   */
  getTasksCount(enabled?: boolean): number {
    if (enabled === undefined) {
      const row = this.db
        .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM tasks')
        .get();
      return row?.count ?? 0;
    }
    const row = this.db
      .prepare<[number], { count: number }>('SELECT COUNT(*) as count FROM tasks WHERE enabled = ?')
      .get(enabled ? 1 : 0);
    return row?.count ?? 0;
  }

  // ============================================
  // Execution Operations
  // ============================================

  private rowToExecution(row: ExecutionRow): Execution {
    return {
      id: row.id,
      taskId: row.task_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status as ExecutionStatus,
      output: row.output ? (JSON.parse(row.output) as Execution['output']) : null,
      error: row.error,
      durationMs: row.duration_ms,
    };
  }

  /**
   * Get executions with optional filters and pagination
   */
  getExecutions(filters?: ExecutionFilters): { executions: Execution[]; total: number } {
    let countQuery = 'SELECT COUNT(*) as count FROM executions WHERE 1=1';
    let query = 'SELECT * FROM executions WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters?.taskId !== undefined) {
      countQuery += ' AND task_id = ?';
      query += ' AND task_id = ?';
      params.push(filters.taskId);
    }

    if (filters?.status) {
      countQuery += ' AND status = ?';
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.startDate) {
      countQuery += ' AND started_at >= ?';
      query += ' AND started_at >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      countQuery += ' AND started_at <= ?';
      query += ' AND started_at <= ?';
      params.push(filters.endDate);
    }

    // Get total count
    const countStmt = this.db.prepare<(string | number)[], { count: number }>(countQuery);
    const countRow = countStmt.get(...params);
    const total = countRow?.count ?? 0;

    // Add ordering and pagination
    query += ' ORDER BY started_at DESC';

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare<(string | number)[], ExecutionRow>(query);
    const rows = stmt.all(...params) as ExecutionRow[];

    return {
      executions: rows.map((row) => this.rowToExecution(row)),
      total,
    };
  }

  /**
   * Get a single execution by ID
   */
  getExecution(id: number): Execution | null {
    const row = this.db
      .prepare<[number], ExecutionRow>('SELECT * FROM executions WHERE id = ?')
      .get(id);
    return row ? this.rowToExecution(row) : null;
  }

  /**
   * Create a new execution (when task starts)
   */
  createExecution(taskId: number): Execution {
    const now = new Date().toISOString();
    const result = this.db
      .prepare<[number, string, string]>(
        'INSERT INTO executions (task_id, started_at, status) VALUES (?, ?, ?)'
      )
      .run(taskId, now, 'running');

    return {
      id: Number(result.lastInsertRowid),
      taskId,
      startedAt: now,
      finishedAt: null,
      status: 'running',
      output: null,
      error: null,
      durationMs: null,
    };
  }

  /**
   * Update execution with result
   */
  updateExecution(
    id: number,
    updates: {
      status: ExecutionStatus;
      output?: Execution['output'];
      error?: string | null;
      finishedAt?: string;
      durationMs?: number;
    }
  ): Execution | null {
    const finishedAt = updates.finishedAt ?? new Date().toISOString();
    const startedRow = this.db
      .prepare<[number], { started_at: string }>('SELECT started_at FROM executions WHERE id = ?')
      .get(id);

    if (!startedRow) return null;

    const durationMs =
      updates.durationMs ?? new Date(finishedAt).getTime() - new Date(startedRow.started_at).getTime();

    this.db
      .prepare<[string, string, string | null, string | null, number, number]>(
        `UPDATE executions
       SET status = ?, finished_at = ?, output = ?, error = ?, duration_ms = ?
       WHERE id = ?`
      )
      .run(
        updates.status,
        finishedAt,
        updates.output ? JSON.stringify(updates.output) : null,
        updates.error ?? null,
        durationMs,
        id
      );

    return this.getExecution(id);
  }

  /**
   * Delete old executions (cleanup)
   */
  deleteOldExecutions(olderThanDays: number): number {
    const result = this.db
      .prepare<[number]>(
        `DELETE FROM executions WHERE started_at < datetime('now', '-' || ? || ' days')`
      )
      .run(olderThanDays);
    return result.changes;
  }

  /**
   * Get recent error count
   */
  getRecentErrorCount(hours = 24): number {
    const row = this.db
      .prepare<[number], { count: number }>(
        `SELECT COUNT(*) as count FROM executions
       WHERE status = 'failed'
       AND started_at > datetime('now', '-' || ? || ' hours')`
      )
      .get(hours);
    return row?.count ?? 0;
  }

  /**
   * Get pending (running) executions count
   */
  getPendingExecutionsCount(): number {
    const row = this.db
      .prepare<[], { count: number }>(
        "SELECT COUNT(*) as count FROM executions WHERE status = 'running'"
      )
      .get();
    return row?.count ?? 0;
  }

  // ============================================
  // Credential Metadata Operations
  // ============================================

  private rowToCredential(row: CredentialRow): Credential {
    return {
      id: row.id,
      name: row.name,
      type: row.type as CredentialType,
      description: row.description,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  /**
   * Get all credentials (metadata only, not values)
   */
  getCredentials(): Credential[] {
    const rows = this.db
      .prepare<[], CredentialRow>('SELECT * FROM credentials ORDER BY name')
      .all() as CredentialRow[];
    return rows.map((row) => this.rowToCredential(row));
  }

  /**
   * Get a single credential by ID
   */
  getCredential(id: number): Credential | null {
    const row = this.db
      .prepare<[number], CredentialRow>('SELECT * FROM credentials WHERE id = ?')
      .get(id);
    return row ? this.rowToCredential(row) : null;
  }

  /**
   * Get a credential by name
   */
  getCredentialByName(name: string): Credential | null {
    const row = this.db
      .prepare<[string], CredentialRow>('SELECT * FROM credentials WHERE name = ?')
      .get(name);
    return row ? this.rowToCredential(row) : null;
  }

  /**
   * Create credential metadata (value stored separately)
   */
  createCredential(credential: Omit<Credential, 'id' | 'createdAt' | 'lastUsedAt'>): Credential {
    const now = new Date().toISOString();
    const result = this.db
      .prepare<[string, string, string | null]>(
        'INSERT INTO credentials (name, type, description) VALUES (?, ?, ?)'
      )
      .run(credential.name, credential.type, credential.description);

    return {
      id: Number(result.lastInsertRowid),
      name: credential.name,
      type: credential.type,
      description: credential.description,
      createdAt: now,
      lastUsedAt: null,
    };
  }

  /**
   * Update credential metadata
   */
  updateCredential(
    id: number,
    updates: Partial<Omit<Credential, 'id' | 'createdAt'>>
  ): Credential | null {
    const existing = this.getCredential(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };

    this.db
      .prepare<[string | null, string | null, number]>(
        'UPDATE credentials SET description = ?, last_used_at = ? WHERE id = ?'
      )
      .run(updated.description, updated.lastUsedAt, id);

    return updated;
  }

  /**
   * Delete credential metadata
   */
  deleteCredential(id: number): boolean {
    const result = this.db.prepare<[number]>('DELETE FROM credentials WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Check if credential exists by name
   */
  credentialExists(name: string): boolean {
    const row = this.db
      .prepare<[string], { count: number }>(
        'SELECT COUNT(*) as count FROM credentials WHERE name = ?'
      )
      .get(name);
    return (row?.count ?? 0) > 0;
  }

  /**
   * Update credential last used time
   */
  updateCredentialLastUsed(name: string): void {
    this.db
      .prepare<[string]>("UPDATE credentials SET last_used_at = datetime('now') WHERE name = ?")
      .run(name);
  }

  /**
   * Get credentials that are in use by tasks
   */
  getCredentialsInUse(): string[] {
    const rows = this.db
      .prepare<[], { credentials: string }>("SELECT DISTINCT credentials FROM tasks WHERE credentials != '[]'")
      .all();

    const allCredentials = new Set<string>();
    for (const row of rows) {
      const creds = JSON.parse(row.credentials) as string[];
      for (const cred of creds) {
        allCredentials.add(cred);
      }
    }

    // Also check required_credentials in templates that are used by tasks
    const templateRows = this.db
      .prepare<[], { required_credentials: string }>(
        `SELECT DISTINCT t.required_credentials
         FROM templates t
         INNER JOIN tasks tk ON tk.template_id = t.id
         WHERE t.required_credentials != '[]'`
      )
      .all();

    for (const row of templateRows) {
      const creds = JSON.parse(row.required_credentials) as string[];
      for (const cred of creds) {
        allCredentials.add(cred);
      }
    }

    return Array.from(allCredentials);
  }

  // ============================================
  // Database Statistics
  // ============================================

  /**
   * Get database statistics
   */
  getStats(): {
    templatesCount: number;
    tasksCount: number;
    enabledTasksCount: number;
    executionsCount: number;
    credentialsCount: number;
    pendingExecutions: number;
    recentErrors: number;
  } {
    return {
      templatesCount: this.getTemplates().length,
      tasksCount: this.getTasksCount(),
      enabledTasksCount: this.getTasksCount(true),
      executionsCount: this.getExecutions({ limit: 1 }).total,
      credentialsCount: this.getCredentials().length,
      pendingExecutions: this.getPendingExecutionsCount(),
      recentErrors: this.getRecentErrorCount(),
    };
  }

  /**
   * Run a function in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

/**
 * Get the database service instance
 */
export function getDatabase(dbPath?: string): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService(dbPath);
    dbInstance.initialize();
  }
  return dbInstance;
}

/**
 * Close the database connection (for testing/cleanup)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export default DatabaseService;
