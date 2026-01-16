import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor } from '../src/server/executor/index.js';
import { Scheduler } from '../src/server/scheduler/index.js';
import { MCPServer } from '../src/server/mcp/index.js';
import { registerExecutionTools } from '../src/server/mcp/tools/executions.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-mcp-executions');

describe('Execution Tools', () => {
  let db: DatabaseService;
  let vault: VaultService;
  let executor: TaskExecutor;
  let scheduler: Scheduler;
  let mcpServer: MCPServer;

  beforeEach(() => {
    // Clean up test directory if it exists
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Initialize test services
    const dbPath = join(TEST_DIR, 'test.db');
    db = new DatabaseService(dbPath);
    db.initialize();

    vault = new VaultService(TEST_DIR);
    vault.initialize();

    executor = new TaskExecutor(db, vault);
    scheduler = new Scheduler(db, executor);

    // Create MCP server and register tools
    mcpServer = new MCPServer({
      db,
      vault,
      executor,
      scheduler,
    });

    registerExecutionTools(mcpServer);
  });

  afterEach(() => {
    // Stop scheduler
    if (scheduler.isRunning()) {
      scheduler.stop();
    }

    // Clean up
    db.close();
    vault.clearKey();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('execute_task', () => {
    it('should execute a task and return result', async () => {
      // Create a simple task
      const task = db.createTask({
        templateId: 'log-message',
        name: 'exec-test-task',
        description: null,
        params: { message: 'Hello from test!' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      // Execute the task directly using executor
      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect(result.execution.status).toBe('success');
    });

    it('should create execution record in database', async () => {
      const task = db.createTask({
        templateId: 'log-message',
        name: 'record-test-task',
        description: null,
        params: { message: 'Test message' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      await executor.execute(task.id);

      // Verify execution was recorded
      const executions = db.getExecutions({ taskId: task.id });
      expect(executions.executions.length).toBe(1);
      expect(executions.executions[0]?.status).toBe('success');
    });

    it('should capture console output', async () => {
      const task = db.createTask({
        templateId: 'log-message',
        name: 'console-test-task',
        description: null,
        params: { message: 'Console test message' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect(result.output?.console).toBeDefined();
      expect(result.output?.console.length).toBeGreaterThan(0);
    });
  });

  describe('get_executions', () => {
    beforeEach(async () => {
      // Create a task and execute it multiple times
      const task = db.createTask({
        templateId: 'log-message',
        name: 'history-test-task',
        description: null,
        params: { message: 'Test' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      // Execute multiple times
      await executor.execute(task.id);
      await executor.execute(task.id);
      await executor.execute(task.id);
    });

    it('should list all executions', () => {
      const result = db.getExecutions({});
      expect(result.executions.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('should filter by task', () => {
      const task = db.getTaskByName('history-test-task');
      expect(task).toBeDefined();
      const result = db.getExecutions({ taskId: task!.id });
      expect(result.executions.length).toBe(3);
    });

    it('should filter by status', () => {
      const result = db.getExecutions({ status: 'success' });
      expect(result.executions.length).toBe(3);

      const failedResult = db.getExecutions({ status: 'failed' });
      expect(failedResult.executions.length).toBe(0);
    });

    it('should support pagination', () => {
      const result = db.getExecutions({ limit: 2 });
      expect(result.executions.length).toBe(2);
      expect(result.total).toBe(3);

      const offsetResult = db.getExecutions({ limit: 2, offset: 2 });
      expect(offsetResult.executions.length).toBe(1);
    });
  });

  describe('get_execution', () => {
    it('should get execution details', async () => {
      const task = db.createTask({
        templateId: 'log-message',
        name: 'detail-test-task',
        description: null,
        params: { message: 'Detail test' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      const execResult = await executor.execute(task.id);

      const execution = db.getExecution(execResult.execution.id);
      expect(execution).toBeDefined();
      expect(execution?.id).toBe(execResult.execution.id);
      expect(execution?.status).toBe('success');
      expect(execution?.output).toBeDefined();
    });

    it('should return null for non-existent execution', () => {
      const execution = db.getExecution(99999);
      expect(execution).toBeNull();
    });

    it('should include full output in execution details', async () => {
      const task = db.createTask({
        templateId: 'log-message',
        name: 'output-test-task',
        description: null,
        params: { message: 'Output test message' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      const execResult = await executor.execute(task.id);
      const execution = db.getExecution(execResult.execution.id);

      expect(execution?.output).toBeDefined();
      expect(execution?.output?.console).toBeDefined();
      expect(Array.isArray(execution?.output?.console)).toBe(true);
    });
  });

  describe('execution with different statuses', () => {
    it('should record failed execution', async () => {
      // Create a template that will fail
      db.createTemplate({
        id: 'fail-template',
        name: 'Fail Template',
        description: null,
        category: 'test',
        code: 'throw new Error("Intentional failure");',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'fail-template',
        name: 'fail-test-task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id);

      expect(result.success).toBe(false);
      expect(result.execution.status).toBe('failed');
      expect(result.error).toContain('Intentional failure');

      // Verify recorded in database
      const execution = db.getExecution(result.execution.id);
      expect(execution?.status).toBe('failed');
      expect(execution?.error).toContain('Intentional failure');
    });

    it('should record timeout execution', async () => {
      // Create a template that will timeout
      db.createTemplate({
        id: 'timeout-template',
        name: 'Timeout Template',
        description: null,
        category: 'test',
        code: 'await new Promise(resolve => setTimeout(resolve, 10000));',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'timeout-template',
        name: 'timeout-test-task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      const result = await executor.execute(task.id, { timeoutMs: 100 });

      expect(result.success).toBe(false);
      expect(result.execution.status).toBe('timeout');
    });
  });
});
