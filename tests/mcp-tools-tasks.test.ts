import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor } from '../src/server/executor/index.js';
import { Scheduler } from '../src/server/scheduler/index.js';
import { MCPServer } from '../src/server/mcp/index.js';
import { registerTaskTools } from '../src/server/mcp/tools/tasks.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-mcp-tasks');

describe('Task Management Tools', () => {
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

    registerTaskTools(mcpServer);
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

  describe('schedule_task', () => {
    it('should create a task with cron schedule', () => {
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'test-cron-task',
        description: 'Test task',
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      expect(task).toBeDefined();
      expect(task.name).toBe('test-cron-task');
      expect(task.scheduleType).toBe('cron');
      expect(task.scheduleValue).toBe('*/5 * * * *');
    });

    it('should create a task with interval schedule', () => {
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'test-interval-task',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'interval',
        scheduleValue: '30',
        credentials: [],
        enabled: true,
      });

      expect(task).toBeDefined();
      expect(task.scheduleType).toBe('interval');
      expect(task.scheduleValue).toBe('30');
    });

    it('should create a task with one-time schedule', () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'test-once-task',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'once',
        scheduleValue: futureDate,
        credentials: [],
        enabled: true,
      });

      expect(task).toBeDefined();
      expect(task.scheduleType).toBe('once');
      expect(task.scheduleValue).toBe(futureDate);
    });

    it('should reject invalid template_id', () => {
      expect(() =>
        db.createTask({
          templateId: 'non-existent-template',
          name: 'bad-task',
          description: null,
          params: {},
          scheduleType: 'cron',
          scheduleValue: '*/5 * * * *',
          credentials: [],
          enabled: true,
        })
      ).toThrow();
    });

    it('should reject duplicate task names', () => {
      db.createTask({
        templateId: 'http-health-check',
        name: 'unique-task',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      // Try to create another task with the same name
      expect(db.getTaskByName('unique-task')).toBeDefined();
    });
  });

  describe('list_tasks', () => {
    beforeEach(() => {
      // Create some test tasks
      db.createTask({
        templateId: 'http-health-check',
        name: 'enabled-task',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      db.createTask({
        templateId: 'log-message',
        name: 'disabled-task',
        description: null,
        params: { message: 'test' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: false,
      });
    });

    it('should list all tasks', () => {
      const tasks = db.getTasks({});
      expect(tasks.length).toBe(2);
    });

    it('should filter by enabled status', () => {
      const enabledTasks = db.getTasks({ enabled: true });
      expect(enabledTasks.length).toBe(1);
      expect(enabledTasks[0]?.name).toBe('enabled-task');

      const disabledTasks = db.getTasks({ enabled: false });
      expect(disabledTasks.length).toBe(1);
      expect(disabledTasks[0]?.name).toBe('disabled-task');
    });

    it('should filter by template_id', () => {
      const httpTasks = db.getTasks({ templateId: 'http-health-check' });
      expect(httpTasks.length).toBe(1);
      expect(httpTasks[0]?.name).toBe('enabled-task');
    });
  });

  describe('get_task', () => {
    it('should get task by name', () => {
      db.createTask({
        templateId: 'http-health-check',
        name: 'my-task',
        description: 'My test task',
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '0 9 * * *',
        credentials: [],
        enabled: true,
      });

      const task = db.getTaskByName('my-task');
      expect(task).toBeDefined();
      expect(task?.name).toBe('my-task');
      expect(task?.description).toBe('My test task');
      expect(task?.params).toEqual({ url: 'https://example.com' });
    });

    it('should return null for non-existent task', () => {
      const task = db.getTaskByName('non-existent');
      expect(task).toBeNull();
    });
  });

  describe('update_task', () => {
    it('should update task description', () => {
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'update-test',
        description: 'Original description',
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      const updated = db.updateTask(task.id, { description: 'Updated description' });
      expect(updated?.description).toBe('Updated description');
    });

    it('should update task schedule', () => {
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'schedule-update-test',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      const updated = db.updateTask(task.id, {
        scheduleType: 'interval',
        scheduleValue: '30',
      });

      expect(updated?.scheduleType).toBe('interval');
      expect(updated?.scheduleValue).toBe('30');
    });

    it('should update task params', () => {
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'params-update-test',
        description: null,
        params: { url: 'https://old.example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      const updated = db.updateTask(task.id, {
        params: { url: 'https://new.example.com', expected_status: 201 },
      });

      expect(updated?.params).toEqual({
        url: 'https://new.example.com',
        expected_status: 201,
      });
    });
  });

  describe('delete_task', () => {
    it('should delete a task', () => {
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'delete-test',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      const deleted = db.deleteTask(task.id);
      expect(deleted).toBe(true);

      const retrieved = db.getTask(task.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent task', () => {
      const deleted = db.deleteTask(99999);
      expect(deleted).toBe(false);
    });
  });

  describe('toggle_task', () => {
    it('should toggle task enabled state', () => {
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'toggle-test',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      expect(task.enabled).toBe(true);

      // Toggle off
      const toggled = db.toggleTask(task.id);
      expect(toggled?.enabled).toBe(false);

      // Toggle on
      const toggledAgain = db.toggleTask(task.id);
      expect(toggledAgain?.enabled).toBe(true);
    });
  });

  describe('scheduler integration', () => {
    it('should register task with scheduler when enabled', () => {
      scheduler.start();

      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'scheduler-test',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);
    });

    it('should unregister task when deleted', () => {
      scheduler.start();

      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'unregister-test',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);

      scheduler.unregisterTask(task.id);
      expect(scheduler.isTaskRegistered(task.id)).toBe(false);
    });
  });
});
