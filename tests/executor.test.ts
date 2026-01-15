import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor, ExecutionError } from '../src/server/executor/index.js';
import type { Task, Template } from '../src/shared/types.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-executor');

describe('TaskExecutor', () => {
  let db: DatabaseService;
  let vault: VaultService;
  let executor: TaskExecutor;

  beforeEach(() => {
    // Clean up test directory if it exists
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Initialize test database and vault
    const dbPath = join(TEST_DIR, 'test.db');
    db = new DatabaseService(dbPath);
    db.initialize();

    vault = new VaultService(TEST_DIR);
    vault.initialize();

    executor = new TaskExecutor(db, vault);
  });

  afterEach(() => {
    // Clean up
    db.close();
    vault.clearKey();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('execute', () => {
    it('should execute a simple task successfully', async () => {
      // Create a simple template
      const template = db.createTemplate({
        id: 'test-simple',
        name: 'Test Simple',
        description: 'A simple test template',
        category: 'custom',
        code: `
          console.log('Hello from test!');
          return { success: true, value: 42 };
        `,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      // Create a task
      const task = db.createTask({
        templateId: template.id,
        name: 'Test Task',
        description: 'A test task',
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      // Execute the task
      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect(result.execution.status).toBe('success');
      expect(result.output.result).toEqual({ success: true, value: 42 });
      expect(result.output.console.some((line) => line.includes('Hello from test!'))).toBe(true);
    });

    it('should capture console output', async () => {
      const template = db.createTemplate({
        id: 'test-console',
        name: 'Test Console',
        description: 'Test console output capture',
        category: 'custom',
        code: `
          console.log('Log message');
          console.warn('Warning message');
          console.error('Error message');
          console.info('Info message');
          console.debug('Debug message');
          return 'done';
        `,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Console Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect(result.output.console.length).toBe(5);
      expect(result.output.console[0]).toContain('[LOG] Log message');
      expect(result.output.console[1]).toContain('[WARN] Warning message');
      expect(result.output.console[2]).toContain('[ERROR] Error message');
      expect(result.output.console[3]).toContain('[INFO] Info message');
      expect(result.output.console[4]).toContain('[DEBUG] Debug message');
    });

    it('should pass parameters to template', async () => {
      const template = db.createTemplate({
        id: 'test-params',
        name: 'Test Params',
        description: 'Test parameter passing',
        category: 'custom',
        code: `
          return {
            name: params.name,
            count: params.count,
            enabled: params.enabled
          };
        `,
        paramsSchema: [
          { name: 'name', type: 'string', required: true },
          { name: 'count', type: 'number', required: true },
          { name: 'enabled', type: 'boolean', required: false, default: true },
        ],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Params Test Task',
        description: null,
        params: { name: 'TestName', count: 10, enabled: false },
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect(result.output.result).toEqual({
        name: 'TestName',
        count: 10,
        enabled: false,
      });
    });

    it('should inject credentials', async () => {
      // Create credential
      db.createCredential({
        name: 'TEST_API_KEY',
        type: 'api_key',
        description: 'Test API key',
      });
      const encryptedValue = vault.encrypt('secret-key-12345');
      db.credentials.updateValue('TEST_API_KEY', encryptedValue);

      const template = db.createTemplate({
        id: 'test-creds',
        name: 'Test Credentials',
        description: 'Test credential injection',
        category: 'custom',
        code: `
          return {
            hasKey: !!credentials.TEST_API_KEY,
            keyLength: credentials.TEST_API_KEY.length
          };
        `,
        paramsSchema: [],
        requiredCredentials: ['TEST_API_KEY'],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Credentials Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect(result.output.result).toEqual({
        hasKey: true,
        keyLength: 16, // 'secret-key-12345'.length
      });
    });

    it('should handle errors in template code', async () => {
      const template = db.createTemplate({
        id: 'test-error',
        name: 'Test Error',
        description: 'Test error handling',
        category: 'custom',
        code: `
          console.log('Before error');
          throw new Error('Something went wrong');
          console.log('After error');
        `,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Error Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(false);
      expect(result.execution.status).toBe('failed');
      expect(result.error).toContain('Something went wrong');
      // Should capture console output before error
      expect(result.output.console[0]).toContain('Before error');
    });

    it('should handle timeout', async () => {
      const template = db.createTemplate({
        id: 'test-timeout',
        name: 'Test Timeout',
        description: 'Test timeout handling',
        category: 'custom',
        code: `
          console.log('Starting long operation');
          // Create a long-running operation
          await new Promise(resolve => setTimeout(resolve, 10000));
          return 'done';
        `,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Timeout Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      // Execute with short timeout
      const result = await executor.execute(task.id, { timeoutMs: 100 });

      expect(result.success).toBe(false);
      expect(result.execution.status).toBe('timeout');
      expect(result.error).toContain('timed out');
    }, 5000);

    it('should fail for missing task', async () => {
      await expect(executor.execute(99999)).rejects.toThrow(ExecutionError);
      await expect(executor.execute(99999)).rejects.toThrow('not found');
    });

    it('should fail for missing credentials', async () => {
      const template = db.createTemplate({
        id: 'test-missing-cred',
        name: 'Test Missing Cred',
        description: 'Test missing credential handling',
        category: 'custom',
        code: `return credentials.MISSING_KEY;`,
        paramsSchema: [],
        requiredCredentials: ['MISSING_KEY'],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Missing Cred Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(false);
      expect(result.execution.status).toBe('failed');
      expect(result.error).toContain('MISSING_KEY');
    });

    it('should update execution record in database', async () => {
      const template = db.createTemplate({
        id: 'test-record',
        name: 'Test Record',
        description: 'Test execution record',
        category: 'custom',
        code: `return 'recorded';`,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Record Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      // Check execution in database
      const execution = db.getExecution(result.execution.id);
      expect(execution).not.toBeNull();
      expect(execution?.status).toBe('success');
      expect(execution?.taskId).toBe(task.id);
      expect(execution?.finishedAt).not.toBeNull();
      expect(execution?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should support async operations in templates', async () => {
      const template = db.createTemplate({
        id: 'test-async',
        name: 'Test Async',
        description: 'Test async operations',
        category: 'custom',
        code: `
          const start = Date.now();
          await new Promise(resolve => setTimeout(resolve, 50));
          const elapsed = Date.now() - start;
          return { elapsed };
        `,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Async Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect((result.output.result as { elapsed: number }).elapsed).toBeGreaterThanOrEqual(50);
    });

    it('should allow using built-in Node.js modules', async () => {
      const template = db.createTemplate({
        id: 'test-require',
        name: 'Test Require',
        description: 'Test require functionality',
        category: 'custom',
        code: `
          const path = require('path');
          const os = require('os');
          return {
            pathSep: path.sep,
            platform: os.platform()
          };
        `,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Require Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      const res = result.output.result as { pathSep: string; platform: string };
      expect(res.pathSep).toBeDefined();
      expect(res.platform).toBeDefined();
    });

    it('should block non-whitelisted modules', async () => {
      const template = db.createTemplate({
        id: 'test-blocked-module',
        name: 'Test Blocked Module',
        description: 'Test blocked module',
        category: 'custom',
        code: `
          const notAllowed = require('vm');
          return notAllowed;
        `,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Blocked Module Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('validateParams', () => {
    it('should validate required parameters', () => {
      const template: Template = {
        id: 'test-validate',
        name: 'Test Validate',
        description: null,
        category: null,
        code: '',
        paramsSchema: [
          { name: 'required1', type: 'string', required: true },
          { name: 'required2', type: 'number', required: true },
        ],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
        createdAt: '',
        updatedAt: '',
      };

      const task: Task = {
        id: 1,
        templateId: 'test-validate',
        name: 'Test Task',
        description: null,
        params: { required1: 'value' }, // missing required2
        scheduleType: 'once',
        scheduleValue: '',
        credentials: [],
        enabled: true,
        createdAt: '',
        updatedAt: '',
        lastRunAt: null,
        nextRunAt: null,
      };

      const result = executor.validateParams(task, template);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required parameter 'required2' is missing");
    });

    it('should validate parameter types', () => {
      const template: Template = {
        id: 'test-validate-types',
        name: 'Test Validate Types',
        description: null,
        category: null,
        code: '',
        paramsSchema: [
          { name: 'stringParam', type: 'string', required: true },
          { name: 'numberParam', type: 'number', required: true },
        ],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
        createdAt: '',
        updatedAt: '',
      };

      const task: Task = {
        id: 1,
        templateId: 'test-validate-types',
        name: 'Test Task',
        description: null,
        params: { stringParam: 123, numberParam: 'not a number' }, // wrong types
        scheduleType: 'once',
        scheduleValue: '',
        credentials: [],
        enabled: true,
        createdAt: '',
        updatedAt: '',
        lastRunAt: null,
        nextRunAt: null,
      };

      const result = executor.validateParams(task, template);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('should accept valid parameters', () => {
      const template: Template = {
        id: 'test-validate-valid',
        name: 'Test Validate Valid',
        description: null,
        category: null,
        code: '',
        paramsSchema: [
          { name: 'stringParam', type: 'string', required: true },
          { name: 'numberParam', type: 'number', required: true },
          { name: 'optionalParam', type: 'boolean', required: false },
        ],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
        createdAt: '',
        updatedAt: '',
      };

      const task: Task = {
        id: 1,
        templateId: 'test-validate-valid',
        name: 'Test Task',
        description: null,
        params: { stringParam: 'hello', numberParam: 42 },
        scheduleType: 'once',
        scheduleValue: '',
        credentials: [],
        enabled: true,
        createdAt: '',
        updatedAt: '',
        lastRunAt: null,
        nextRunAt: null,
      };

      const result = executor.validateParams(task, template);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('preflight', () => {
    it('should return valid preflight for valid task', () => {
      const template = db.createTemplate({
        id: 'test-preflight',
        name: 'Test Preflight',
        description: 'Test preflight check',
        category: 'custom',
        code: `return true;`,
        paramsSchema: [{ name: 'message', type: 'string', required: true }],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Preflight Test Task',
        description: null,
        params: { message: 'hello' },
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = executor.preflight(task.id);

      expect(result.valid).toBe(true);
      expect(result.task).not.toBeNull();
      expect(result.template).not.toBeNull();
      expect(result.errors.length).toBe(0);
    });

    it('should detect missing task', () => {
      const result = executor.preflight(99999);

      expect(result.valid).toBe(false);
      expect(result.task).toBeNull();
      expect(result.errors).toContain('Task with ID 99999 not found');
    });

    it('should detect missing credentials', () => {
      const template = db.createTemplate({
        id: 'test-preflight-creds',
        name: 'Test Preflight Creds',
        description: null,
        category: 'custom',
        code: `return credentials.MISSING_CRED;`,
        paramsSchema: [],
        requiredCredentials: ['MISSING_CRED'],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Preflight Creds Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const result = executor.preflight(task.id);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('MISSING_CRED'))).toBe(true);
    });

    it('should warn for disabled task', () => {
      const template = db.createTemplate({
        id: 'test-preflight-disabled',
        name: 'Test Preflight Disabled',
        description: null,
        category: 'custom',
        code: `return true;`,
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: template.id,
        name: 'Disabled Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: false, // disabled
      });

      const result = executor.preflight(task.id);

      expect(result.valid).toBe(true); // still valid
      expect(result.warnings.some((w) => w.includes('disabled'))).toBe(true);
    });
  });
});
