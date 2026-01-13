// Application constants
export const APP_NAME = 'Personal Automator';

// Execution limits
export const DEFAULT_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_CONSOLE_OUTPUT_SIZE = 1024 * 1024; // 1MB

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

// Database
export const DATABASE_FILENAME = 'personal-automator.db';

// Keychain
export const KEYCHAIN_SERVICE = 'personal-automator';
export const KEYCHAIN_ACCOUNT_PREFIX = 'credential:';
export const MASTER_KEY_ACCOUNT = 'master-key';

// Credential types
export const CREDENTIAL_TYPES = ['api_key', 'oauth_token', 'env_var', 'secret'] as const;

// Schedule types
export const SCHEDULE_TYPES = ['cron', 'once', 'interval'] as const;

// Template categories
export const TEMPLATE_CATEGORIES = [
  'monitoring',
  'notifications',
  'github',
  'automation',
  'data',
  'custom',
] as const;

// Execution statuses
export const EXECUTION_STATUSES = ['running', 'success', 'failed', 'timeout'] as const;

// IPC channels - keep in sync with types.ts
export const IPC_CHANNELS = {
  templates: {
    list: 'templates:list',
    get: 'templates:get',
    create: 'templates:create',
    update: 'templates:update',
    delete: 'templates:delete',
  },
  tasks: {
    list: 'tasks:list',
    get: 'tasks:get',
    create: 'tasks:create',
    update: 'tasks:update',
    delete: 'tasks:delete',
    toggle: 'tasks:toggle',
    execute: 'tasks:execute',
  },
  executions: {
    list: 'executions:list',
    get: 'executions:get',
  },
  credentials: {
    list: 'credentials:list',
    add: 'credentials:add',
    delete: 'credentials:delete',
  },
  system: {
    status: 'system:status',
    version: 'system:version',
  },
} as const;

// Event channels
export const EVENT_CHANNELS = {
  execution: {
    started: 'execution:started',
    completed: 'execution:completed',
    failed: 'execution:failed',
  },
  task: {
    scheduled: 'task:scheduled',
    unscheduled: 'task:unscheduled',
  },
} as const;
