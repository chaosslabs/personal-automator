// Application constants
export const APP_NAME = 'Personal Automator';

// Server
export const DEFAULT_PORT = 3000;

// Execution limits
export const DEFAULT_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_CONSOLE_OUTPUT_SIZE = 1024 * 1024; // 1MB

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

// Database
export const DATABASE_FILENAME = 'personal-automator.db';

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

// API routes
export const API_ROUTES = {
  status: '/api/status',
  templates: {
    list: '/api/templates',
    get: (id: string) => `/api/templates/${id}`,
    create: '/api/templates',
    update: (id: string) => `/api/templates/${id}`,
    delete: (id: string) => `/api/templates/${id}`,
  },
  tasks: {
    list: '/api/tasks',
    get: (id: number) => `/api/tasks/${id}`,
    create: '/api/tasks',
    update: (id: number) => `/api/tasks/${id}`,
    delete: (id: number) => `/api/tasks/${id}`,
    toggle: (id: number) => `/api/tasks/${id}/toggle`,
    execute: (id: number) => `/api/tasks/${id}/execute`,
  },
  executions: {
    list: '/api/executions',
    get: (id: number) => `/api/executions/${id}`,
  },
  credentials: {
    list: '/api/credentials',
    create: '/api/credentials',
    delete: (id: number) => `/api/credentials/${id}`,
    updateValue: (name: string) => `/api/credentials/${name}/value`,
    clearValue: (name: string) => `/api/credentials/${name}/value`,
  },
} as const;
