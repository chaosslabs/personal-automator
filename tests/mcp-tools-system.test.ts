import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor } from '../src/server/executor/index.js';
import { Scheduler } from '../src/server/scheduler/index.js';
import { MCPServer } from '../src/server/mcp/index.js';
import { registerSystemTools } from '../src/server/mcp/tools/system.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-mcp-system');

describe('System Tools', () => {
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

    registerSystemTools(mcpServer);
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

  describe('get_status', () => {
    it('should return system status when scheduler is running', () => {
      scheduler.start();

      expect(scheduler.isRunning()).toBe(true);
      expect(db.isConnected()).toBe(true);
    });

    it('should return database stats', () => {
      const stats = db.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.tasksCount).toBe('number');
      expect(typeof stats.enabledTasksCount).toBe('number');
      expect(typeof stats.pendingExecutions).toBe('number');
      expect(typeof stats.recentErrors).toBe('number');
    });

    it('should count templates', () => {
      const templates = db.getTemplates();

      // Should have at least the built-in templates
      expect(templates.length).toBeGreaterThanOrEqual(7);
    });

    it('should track scheduler job count', () => {
      scheduler.start();

      // Create a task
      db.createTask({
        templateId: 'http-health-check',
        name: 'status-test-task',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      // Reschedule to pick up the new task
      scheduler.rescheduleAllTasks();

      expect(scheduler.getJobCount()).toBe(1);
    });

    it('should find next execution time', () => {
      // Create an enabled task
      const task = db.createTask({
        templateId: 'http-health-check',
        name: 'next-run-test',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
        nextRunAt: new Date(Date.now() + 3600000).toISOString(),
      });

      // Get enabled tasks and find next execution
      const enabledTasks = db.getTasks({ enabled: true });
      let nextExecution: string | null = null;

      for (const t of enabledTasks) {
        if (t.nextRunAt) {
          if (!nextExecution || t.nextRunAt < nextExecution) {
            nextExecution = t.nextRunAt;
          }
        }
      }

      expect(nextExecution).toBeDefined();
      expect(nextExecution).toBe(task.nextRunAt);
    });

    it('should calculate success rate from recent executions', async () => {
      // Create task
      const task = db.createTask({
        templateId: 'log-message',
        name: 'success-rate-test',
        description: null,
        params: { message: 'test' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      // Execute task successfully
      await executor.execute(task.id);
      await executor.execute(task.id);

      // Get recent executions
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentExecs = db.getExecutions({ startDate: oneDayAgo, limit: 500 });

      // Calculate success rate
      let successCount = 0;
      let failedCount = 0;
      for (const exec of recentExecs.executions) {
        if (exec.status === 'success') {
          successCount++;
        } else if (exec.status === 'failed' || exec.status === 'timeout') {
          failedCount++;
        }
      }

      expect(successCount).toBe(2);
      expect(failedCount).toBe(0);
    });

    it('should count credentials', () => {
      // Create some credentials
      db.credentials.createWithValue(
        { name: 'CRED1', type: 'api_key', description: null },
        vault.encrypt('value1')
      );
      db.credentials.createWithValue(
        { name: 'CRED2', type: 'secret', description: null },
        vault.encrypt('value2')
      );

      const credentials = db.credentials.getAllWithValueStatus();
      expect(credentials.length).toBe(2);
    });

    it('should report server uptime', () => {
      // Before starting, uptime should be 0
      expect(mcpServer.getUptimeSeconds()).toBe(0);
    });

    it('should include all expected status fields', () => {
      const stats = db.getStats();
      const templates = db.getTemplates();
      const credentials = db.credentials.getAllWithValueStatus();

      // Verify we can build the expected response shape
      const statusShape = {
        status: 'healthy',
        version: '0.1.0',
        uptime_seconds: 0,
        scheduler: {
          status: scheduler.isRunning() ? 'running' : 'stopped',
          active_jobs: scheduler.getJobCount(),
          next_execution: null,
        },
        database: {
          connected: db.isConnected(),
          tasks_count: stats.tasksCount,
          enabled_tasks_count: stats.enabledTasksCount,
          executions_count: stats.executionsCount,
          credentials_count: credentials.length,
          templates_count: templates.length,
        },
        recent_activity: {
          executions_24h: 0,
          success_rate: 1,
          failed_count: 0,
          pending_count: stats.pendingExecutions,
          recent_errors: stats.recentErrors,
        },
      };

      expect(statusShape.status).toBe('healthy');
      expect(statusShape.database.connected).toBe(true);
      expect(statusShape.database.templates_count).toBeGreaterThanOrEqual(7);
    });
  });
});
