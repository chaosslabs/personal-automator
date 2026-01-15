import type { Execution, ExecutionFilters, ExecutionStatus } from '../../../shared/types.js';
import type { DatabaseInstance, ExecutionRow } from '../types.js';

/**
 * Repository for execution CRUD operations
 */
export class ExecutionRepository {
  constructor(private db: DatabaseInstance) {}

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
  getAll(filters?: ExecutionFilters): { executions: Execution[]; total: number } {
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
    const rows = stmt.all(...params);

    return {
      executions: rows.map((row) => this.rowToExecution(row)),
      total,
    };
  }

  /**
   * Get a single execution by ID
   */
  getById(id: number): Execution | null {
    const row = this.db
      .prepare<[number], ExecutionRow>('SELECT * FROM executions WHERE id = ?')
      .get(id);
    return row ? this.rowToExecution(row) : null;
  }

  /**
   * Create a new execution (when task starts)
   */
  create(taskId: number): Execution {
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
  update(
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

    return this.getById(id);
  }

  /**
   * Delete old executions (cleanup)
   */
  deleteOld(olderThanDays: number): number {
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
  getPendingCount(): number {
    const row = this.db
      .prepare<[], { count: number }>(
        "SELECT COUNT(*) as count FROM executions WHERE status = 'running'"
      )
      .get();
    return row?.count ?? 0;
  }
}
