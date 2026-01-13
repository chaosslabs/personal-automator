import { describe, it, expect } from 'vitest';
import {
  APP_NAME,
  DEFAULT_PORT,
  CREDENTIAL_TYPES,
  SCHEDULE_TYPES,
  EXECUTION_STATUSES,
  API_ROUTES,
} from './constants';

describe('constants', () => {
  it('should have correct app name', () => {
    expect(APP_NAME).toBe('Personal Automator');
  });

  it('should have default port', () => {
    expect(DEFAULT_PORT).toBe(3000);
  });

  it('should have credential types', () => {
    expect(CREDENTIAL_TYPES).toContain('api_key');
    expect(CREDENTIAL_TYPES).toContain('oauth_token');
    expect(CREDENTIAL_TYPES).toContain('env_var');
    expect(CREDENTIAL_TYPES).toContain('secret');
  });

  it('should have schedule types', () => {
    expect(SCHEDULE_TYPES).toContain('cron');
    expect(SCHEDULE_TYPES).toContain('once');
    expect(SCHEDULE_TYPES).toContain('interval');
  });

  it('should have execution statuses', () => {
    expect(EXECUTION_STATUSES).toContain('running');
    expect(EXECUTION_STATUSES).toContain('success');
    expect(EXECUTION_STATUSES).toContain('failed');
    expect(EXECUTION_STATUSES).toContain('timeout');
  });

  it('should have API routes', () => {
    expect(API_ROUTES.status).toBe('/api/status');
    expect(API_ROUTES.templates.list).toBe('/api/templates');
    expect(API_ROUTES.tasks.list).toBe('/api/tasks');
    expect(API_ROUTES.executions.list).toBe('/api/executions');
    expect(API_ROUTES.credentials.list).toBe('/api/credentials');
  });

  it('should generate dynamic API routes', () => {
    expect(API_ROUTES.templates.get('test-id')).toBe('/api/templates/test-id');
    expect(API_ROUTES.tasks.get(123)).toBe('/api/tasks/123');
    expect(API_ROUTES.tasks.execute(456)).toBe('/api/tasks/456/execute');
  });
});
