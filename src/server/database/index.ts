import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { DATABASE_FILENAME } from '../../shared/constants.js';
import { builtinTemplates } from '../../shared/builtin-templates.js';
import { migrations } from './migrations.js';
import {
  TemplateRepository,
  TaskRepository,
  ExecutionRepository,
  CredentialRepository,
  UserRepository,
} from './models/index.js';
import type { MigrationRow } from './types.js';
import type {
  Template,
  Task,
  Execution,
  Credential,
  User,
  AuthProvider,
  ExecutionFilters,
  TaskFilters,
  ExecutionStatus,
} from '../../shared/types.js';

/**
 * DatabaseService provides a unified interface for all database operations.
 * It composes individual repositories for each entity type.
 */
export class DatabaseService {
  private db: Database.Database;
  private initialized = false;

  // Repositories
  public readonly templates: TemplateRepository;
  public readonly tasks: TaskRepository;
  public readonly executions: ExecutionRepository;
  public readonly credentials: CredentialRepository;
  public readonly users: UserRepository;

  constructor(dbPath?: string) {
    // Support DATA_DIR env var for container deployments (Railway, Docker, etc.)
    const defaultDataDir = process.env['DATA_DIR'] ?? join(homedir(), '.personal-automator');
    const dataDir = dbPath ? join(dbPath, '..') : defaultDataDir;
    const dbFile = dbPath ?? join(dataDir, DATABASE_FILENAME);

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbFile);

    // Enable foreign keys and WAL mode
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // Initialize repositories
    this.templates = new TemplateRepository(this.db);
    this.tasks = new TaskRepository(this.db);
    this.executions = new ExecutionRepository(this.db);
    this.credentials = new CredentialRepository(this.db);
    this.users = new UserRepository(this.db);
  }

  /**
   * Initialize the database (run migrations, seed data)
   */
  initialize(): void {
    if (this.initialized) return;

    this.runMigrations();
    this.seedBuiltinTemplates();
    this.initialized = true;
  }

  private runMigrations(): void {
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
  }

  private seedBuiltinTemplates(): void {
    for (const template of builtinTemplates) {
      if (!this.templates.exists(template.id)) {
        console.log(`Seeding built-in template: ${template.name}`);
        this.templates.create({
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
  // Convenience methods that delegate to repositories
  // These maintain backward compatibility with existing code
  // ============================================

  // Templates
  getTemplates(category?: string): Template[] {
    return this.templates.getAll(category);
  }

  getTemplate(id: string): Template | null {
    return this.templates.getById(id);
  }

  createTemplate(template: Omit<Template, 'createdAt' | 'updatedAt'>): Template {
    return this.templates.create(template);
  }

  updateTemplate(
    id: string,
    updates: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltin'>>
  ): Template | null {
    return this.templates.update(id, updates);
  }

  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  templateExists(id: string): boolean {
    return this.templates.exists(id);
  }

  // Tasks
  getTasks(filters?: TaskFilters): Task[] {
    return this.tasks.getAll(filters);
  }

  getTask(id: number): Task | null {
    return this.tasks.getById(id);
  }

  getTaskByName(name: string): Task | null {
    return this.tasks.getByName(name);
  }

  createTask(
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt'> & {
      nextRunAt?: string | null;
    }
  ): Task {
    return this.tasks.create(task);
  }

  updateTask(
    id: number,
    updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>
  ): Task | null {
    return this.tasks.update(id, updates);
  }

  deleteTask(id: number): boolean {
    return this.tasks.delete(id);
  }

  toggleTask(id: number): Task | null {
    return this.tasks.toggle(id);
  }

  updateTaskLastRun(id: number, lastRunAt: string, nextRunAt: string | null): void {
    this.tasks.updateLastRun(id, lastRunAt, nextRunAt);
  }

  getTasksDueToRun(): Task[] {
    return this.tasks.getDueToRun();
  }

  getTasksCount(enabled?: boolean): number {
    return this.tasks.getCount(enabled);
  }

  // Executions
  getExecutions(filters?: ExecutionFilters): { executions: Execution[]; total: number } {
    return this.executions.getAll(filters);
  }

  getExecution(id: number): Execution | null {
    return this.executions.getById(id);
  }

  createExecution(taskId: number): Execution {
    return this.executions.create(taskId);
  }

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
    return this.executions.update(id, updates);
  }

  deleteOldExecutions(olderThanDays: number): number {
    return this.executions.deleteOld(olderThanDays);
  }

  getRecentErrorCount(hours = 24): number {
    return this.executions.getRecentErrorCount(hours);
  }

  getPendingExecutionsCount(): number {
    return this.executions.getPendingCount();
  }

  // Credentials
  getCredentials(): Credential[] {
    return this.credentials.getAll();
  }

  getCredential(id: number): Credential | null {
    return this.credentials.getById(id);
  }

  getCredentialByName(name: string): Credential | null {
    return this.credentials.getByName(name);
  }

  createCredential(credential: Omit<Credential, 'id' | 'createdAt' | 'lastUsedAt'>): Credential {
    return this.credentials.create(credential);
  }

  updateCredential(
    id: number,
    updates: Partial<Omit<Credential, 'id' | 'createdAt'>>
  ): Credential | null {
    return this.credentials.update(id, updates);
  }

  deleteCredential(id: number): boolean {
    return this.credentials.delete(id);
  }

  credentialExists(name: string): boolean {
    return this.credentials.exists(name);
  }

  updateCredentialLastUsed(name: string): void {
    this.credentials.updateLastUsed(name);
  }

  getCredentialsInUse(): string[] {
    return this.credentials.getInUse();
  }

  // Users
  getUsers(): User[] {
    return this.users.getAll();
  }

  getUser(id: number): User | null {
    return this.users.getById(id);
  }

  getUserByProviderId(provider: AuthProvider, providerId: string): User | null {
    return this.users.getByProviderId(provider, providerId);
  }

  findOrCreateUser(profile: Omit<User, 'id' | 'createdAt' | 'lastLoginAt'>): User {
    return this.users.findOrCreate(profile);
  }

  // Statistics
  getStats(): {
    templatesCount: number;
    tasksCount: number;
    enabledTasksCount: number;
    executionsCount: number;
    credentialsCount: number;
    usersCount: number;
    pendingExecutions: number;
    recentErrors: number;
  } {
    return {
      templatesCount: this.templates.getAll().length,
      tasksCount: this.tasks.getCount(),
      enabledTasksCount: this.tasks.getCount(true),
      executionsCount: this.executions.getAll({ limit: 1 }).total,
      credentialsCount: this.credentials.getAll().length,
      usersCount: this.users.getCount(),
      pendingExecutions: this.executions.getPendingCount(),
      recentErrors: this.executions.getRecentErrorCount(),
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

// Re-export types and repositories for direct access
export {
  TemplateRepository,
  TaskRepository,
  ExecutionRepository,
  CredentialRepository,
  UserRepository,
};
export type { DatabaseInstance } from './types.js';

export default DatabaseService;
