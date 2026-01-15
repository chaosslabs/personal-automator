/**
 * Database migration definitions
 */

export interface Migration {
  name: string;
  up: string;
}

/**
 * All migrations in order of execution
 */
export const migrations: Migration[] = [
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
