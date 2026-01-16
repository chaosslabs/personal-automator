// Template types
export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  code: string;
  paramsSchema: ParamDefinition[];
  requiredCredentials: string[];
  suggestedSchedule: string | null;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParamDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  default?: string | number | boolean;
  description?: string;
}

// Task types
export interface Task {
  id: number;
  templateId: string;
  name: string;
  description: string | null;
  params: Record<string, unknown>;
  scheduleType: ScheduleType;
  scheduleValue: string;
  credentials: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export type ScheduleType = 'cron' | 'once' | 'interval';

export interface Schedule {
  type: ScheduleType;
  value: string;
}

// Execution types
export interface Execution {
  id: number;
  taskId: number;
  startedAt: string;
  finishedAt: string | null;
  status: ExecutionStatus;
  output: ExecutionOutput | null;
  error: string | null;
  durationMs: number | null;
}

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface ExecutionOutput {
  console: string[];
  result: unknown;
}

// Credential types
export interface Credential {
  id: number;
  name: string;
  type: CredentialType;
  description: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export type CredentialType = 'api_key' | 'oauth_token' | 'env_var' | 'secret';

// System types
export interface SystemStatus {
  status: string;
  version: string;
  uptime: number;
  schedulerRunning: boolean;
  scheduledJobs: number;
  databaseConnected: boolean;
  tasksCount: number;
  enabledTasksCount: number;
  pendingExecutions: number;
  recentErrors: number;
}

// Filter types for queries
export interface ExecutionFilters {
  taskId?: number;
  status?: ExecutionStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface TaskFilters {
  enabled?: boolean;
  hasErrors?: boolean;
  templateId?: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
