import type { Task, TaskFilters } from '../../../shared/types.js';
import type { DatabaseInstance, TaskRow } from '../types.js';

/**
 * Repository for task CRUD operations
 */
export class TaskRepository {
  constructor(private db: DatabaseInstance) {}

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
  getAll(filters?: TaskFilters): Task[] {
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
  getById(id: number): Task | null {
    const row = this.db.prepare<[number], TaskRow>('SELECT * FROM tasks WHERE id = ?').get(id);
    return row ? this.rowToTask(row) : null;
  }

  /**
   * Get a task by name
   */
  getByName(name: string): Task | null {
    const row = this.db.prepare<[string], TaskRow>('SELECT * FROM tasks WHERE name = ?').get(name);
    return row ? this.rowToTask(row) : null;
  }

  /**
   * Create a new task
   */
  create(
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
  update(id: number, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Task | null {
    const existing = this.getById(id);
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
  delete(id: number): boolean {
    const result = this.db.prepare<[number]>('DELETE FROM tasks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Toggle task enabled status
   */
  toggle(id: number): Task | null {
    const task = this.getById(id);
    if (!task) return null;
    return this.update(id, { enabled: !task.enabled });
  }

  /**
   * Update task last run time
   */
  updateLastRun(id: number, lastRunAt: string, nextRunAt: string | null): void {
    this.db
      .prepare<[string, string | null, number]>(
        `UPDATE tasks SET last_run_at = ?, next_run_at = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(lastRunAt, nextRunAt, id);
  }

  /**
   * Get tasks that are due to run
   */
  getDueToRun(): Task[] {
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
  getCount(enabled?: boolean): number {
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
}
