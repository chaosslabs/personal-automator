import type Database from 'better-sqlite3';

/**
 * Database instance type for repository classes
 */
export type DatabaseInstance = Database.Database;

/**
 * Row types - how data is stored in SQLite (snake_case, serialized JSON)
 */

export interface TemplateRow {
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

export interface TaskRow {
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

export interface ExecutionRow {
  id: number;
  task_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  output: string | null;
  error: string | null;
  duration_ms: number | null;
}

export interface CredentialRow {
  id: number;
  name: string;
  type: string;
  description: string | null;
  encrypted_value: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface MigrationRow {
  id: number;
  name: string;
  applied_at: string;
}
