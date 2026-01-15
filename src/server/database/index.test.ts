import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseService } from './index.js';

describe('DatabaseService', () => {
  let db: DatabaseService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'personal-automator-test-'));
    db = new DatabaseService(join(tempDir, 'test.db'));
    db.initialize();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should create database and run migrations', () => {
      expect(db.isConnected()).toBe(true);
    });

    it('should seed built-in templates', () => {
      const templates = db.getTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some((t) => t.isBuiltin)).toBe(true);
    });

    it('should not duplicate built-in templates on re-initialization', () => {
      const countBefore = db.getTemplates().length;

      // Close and reopen
      db.close();
      db = new DatabaseService(join(tempDir, 'test.db'));
      db.initialize();

      const countAfter = db.getTemplates().length;
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('templates', () => {
    const testTemplate = {
      id: 'test-template',
      name: 'Test Template',
      description: 'A test template',
      category: 'custom',
      code: 'console.log("test");',
      paramsSchema: [{ name: 'message', type: 'string' as const, required: true }],
      requiredCredentials: ['API_KEY'],
      suggestedSchedule: '*/5 * * * *',
      isBuiltin: false,
    };

    it('should create a template', () => {
      const created = db.createTemplate(testTemplate);

      expect(created.id).toBe(testTemplate.id);
      expect(created.name).toBe(testTemplate.name);
      expect(created.code).toBe(testTemplate.code);
      expect(created.paramsSchema).toEqual(testTemplate.paramsSchema);
      expect(created.createdAt).toBeDefined();
    });

    it('should get a template by id', () => {
      db.createTemplate(testTemplate);
      const template = db.getTemplate(testTemplate.id);

      expect(template).toBeDefined();
      expect(template?.id).toBe(testTemplate.id);
    });

    it('should return null for non-existent template', () => {
      const template = db.getTemplate('non-existent');
      expect(template).toBeNull();
    });

    it('should get all templates', () => {
      const initialCount = db.getTemplates().length;
      db.createTemplate(testTemplate);
      const templates = db.getTemplates();

      expect(templates.length).toBe(initialCount + 1);
    });

    it('should filter templates by category', () => {
      db.createTemplate(testTemplate);
      const customTemplates = db.getTemplates('custom');
      const monitoringTemplates = db.getTemplates('monitoring');

      expect(customTemplates.some((t) => t.id === testTemplate.id)).toBe(true);
      expect(monitoringTemplates.some((t) => t.id === testTemplate.id)).toBe(false);
    });

    it('should update a template', () => {
      db.createTemplate(testTemplate);
      const updated = db.updateTemplate(testTemplate.id, { name: 'Updated Name' });

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.code).toBe(testTemplate.code);
    });

    it('should delete a template', () => {
      db.createTemplate(testTemplate);
      const deleted = db.deleteTemplate(testTemplate.id);

      expect(deleted).toBe(true);
      expect(db.getTemplate(testTemplate.id)).toBeNull();
    });

    it('should check if template exists', () => {
      expect(db.templateExists(testTemplate.id)).toBe(false);
      db.createTemplate(testTemplate);
      expect(db.templateExists(testTemplate.id)).toBe(true);
    });
  });

  describe('tasks', () => {
    const testTemplate = {
      id: 'task-test-template',
      name: 'Task Test Template',
      description: null,
      category: 'custom',
      code: 'console.log("test");',
      paramsSchema: [],
      requiredCredentials: [],
      suggestedSchedule: null,
      isBuiltin: false,
    };

    beforeEach(() => {
      db.createTemplate(testTemplate);
    });

    const testTask = {
      templateId: 'task-test-template',
      name: 'Test Task',
      description: 'A test task',
      params: { key: 'value' },
      scheduleType: 'cron' as const,
      scheduleValue: '*/5 * * * *',
      credentials: ['API_KEY'],
      enabled: true,
    };

    it('should create a task', () => {
      const created = db.createTask(testTask);

      expect(created.id).toBeDefined();
      expect(created.name).toBe(testTask.name);
      expect(created.templateId).toBe(testTask.templateId);
      expect(created.params).toEqual(testTask.params);
      expect(created.enabled).toBe(true);
    });

    it('should get a task by id', () => {
      const created = db.createTask(testTask);
      const task = db.getTask(created.id);

      expect(task).toBeDefined();
      expect(task?.name).toBe(testTask.name);
    });

    it('should get a task by name', () => {
      db.createTask(testTask);
      const task = db.getTaskByName(testTask.name);

      expect(task).toBeDefined();
      expect(task?.name).toBe(testTask.name);
    });

    it('should get all tasks', () => {
      db.createTask(testTask);
      db.createTask({ ...testTask, name: 'Task 2' });

      const tasks = db.getTasks();
      expect(tasks.length).toBe(2);
    });

    it('should filter tasks by enabled status', () => {
      db.createTask(testTask);
      db.createTask({ ...testTask, name: 'Disabled Task', enabled: false });

      const enabledTasks = db.getTasks({ enabled: true });
      const disabledTasks = db.getTasks({ enabled: false });

      expect(enabledTasks.length).toBe(1);
      expect(disabledTasks.length).toBe(1);
    });

    it('should filter tasks by template id', () => {
      db.createTask(testTask);
      const tasks = db.getTasks({ templateId: 'task-test-template' });
      const noTasks = db.getTasks({ templateId: 'non-existent' });

      expect(tasks.length).toBe(1);
      expect(noTasks.length).toBe(0);
    });

    it('should update a task', () => {
      const created = db.createTask(testTask);
      const updated = db.updateTask(created.id, {
        name: 'Updated Task',
        params: { newKey: 'newValue' },
      });

      expect(updated?.name).toBe('Updated Task');
      expect(updated?.params).toEqual({ newKey: 'newValue' });
    });

    it('should toggle task enabled status', () => {
      const created = db.createTask(testTask);
      expect(created.enabled).toBe(true);

      const toggled = db.toggleTask(created.id);
      expect(toggled?.enabled).toBe(false);

      const toggledAgain = db.toggleTask(created.id);
      expect(toggledAgain?.enabled).toBe(true);
    });

    it('should delete a task', () => {
      const created = db.createTask(testTask);
      const deleted = db.deleteTask(created.id);

      expect(deleted).toBe(true);
      expect(db.getTask(created.id)).toBeNull();
    });

    it('should update task last run time', () => {
      const created = db.createTask(testTask);
      const lastRun = new Date().toISOString();
      const nextRun = new Date(Date.now() + 60000).toISOString();

      db.updateTaskLastRun(created.id, lastRun, nextRun);

      const task = db.getTask(created.id);
      expect(task?.lastRunAt).toBe(lastRun);
      expect(task?.nextRunAt).toBe(nextRun);
    });

    it('should get tasks count', () => {
      db.createTask(testTask);
      db.createTask({ ...testTask, name: 'Task 2', enabled: false });

      expect(db.getTasksCount()).toBe(2);
      expect(db.getTasksCount(true)).toBe(1);
      expect(db.getTasksCount(false)).toBe(1);
    });
  });

  describe('executions', () => {
    let taskId: number;

    beforeEach(() => {
      db.createTemplate({
        id: 'exec-test-template',
        name: 'Exec Test Template',
        description: null,
        category: 'custom',
        code: 'console.log("test");',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'exec-test-template',
        name: 'Execution Test Task',
        description: null,
        params: {},
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });
      taskId = task.id;
    });

    it('should create an execution', () => {
      const execution = db.createExecution(taskId);

      expect(execution.id).toBeDefined();
      expect(execution.taskId).toBe(taskId);
      expect(execution.status).toBe('running');
      expect(execution.startedAt).toBeDefined();
    });

    it('should update an execution', () => {
      const execution = db.createExecution(taskId);
      const updated = db.updateExecution(execution.id, {
        status: 'success',
        output: { console: ['test output'], result: { success: true } },
      });

      expect(updated?.status).toBe('success');
      expect(updated?.output).toEqual({ console: ['test output'], result: { success: true } });
      expect(updated?.finishedAt).toBeDefined();
      expect(updated?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should update an execution with error', () => {
      const execution = db.createExecution(taskId);
      const updated = db.updateExecution(execution.id, {
        status: 'failed',
        error: 'Something went wrong',
      });

      expect(updated?.status).toBe('failed');
      expect(updated?.error).toBe('Something went wrong');
    });

    it('should get an execution by id', () => {
      const created = db.createExecution(taskId);
      const execution = db.getExecution(created.id);

      expect(execution).toBeDefined();
      expect(execution?.id).toBe(created.id);
    });

    it('should get executions with pagination', () => {
      // Create multiple executions
      for (let i = 0; i < 5; i++) {
        db.createExecution(taskId);
      }

      const result = db.getExecutions({ limit: 2, offset: 0 });
      expect(result.executions.length).toBe(2);
      expect(result.total).toBe(5);

      const page2 = db.getExecutions({ limit: 2, offset: 2 });
      expect(page2.executions.length).toBe(2);
    });

    it('should filter executions by task id', () => {
      db.createExecution(taskId);

      const result = db.getExecutions({ taskId });
      expect(result.executions.length).toBe(1);
      expect(result.executions[0]?.taskId).toBe(taskId);
    });

    it('should filter executions by status', () => {
      const exec1 = db.createExecution(taskId);
      db.createExecution(taskId);

      db.updateExecution(exec1.id, { status: 'success' });

      const successExecs = db.getExecutions({ status: 'success' });
      const runningExecs = db.getExecutions({ status: 'running' });

      expect(successExecs.executions.length).toBe(1);
      expect(runningExecs.executions.length).toBe(1);
    });

    it('should cascade delete executions when task is deleted', () => {
      db.createExecution(taskId);
      db.createExecution(taskId);

      expect(db.getExecutions({ taskId }).total).toBe(2);

      db.deleteTask(taskId);

      expect(db.getExecutions({ taskId }).total).toBe(0);
    });

    it('should get pending executions count', () => {
      db.createExecution(taskId);
      db.createExecution(taskId);

      expect(db.getPendingExecutionsCount()).toBe(2);

      const execs = db.getExecutions({ taskId });
      const firstExec = execs.executions[0];
      if (firstExec) {
        db.updateExecution(firstExec.id, { status: 'success' });
      }

      expect(db.getPendingExecutionsCount()).toBe(1);
    });
  });

  describe('credentials', () => {
    const testCredential = {
      name: 'TEST_API_KEY',
      type: 'api_key' as const,
      description: 'Test API key',
    };

    it('should create a credential', () => {
      const created = db.createCredential(testCredential);

      expect(created.id).toBeDefined();
      expect(created.name).toBe(testCredential.name);
      expect(created.type).toBe(testCredential.type);
    });

    it('should get a credential by id', () => {
      const created = db.createCredential(testCredential);
      const credential = db.getCredential(created.id);

      expect(credential).toBeDefined();
      expect(credential?.name).toBe(testCredential.name);
    });

    it('should get a credential by name', () => {
      db.createCredential(testCredential);
      const credential = db.getCredentialByName(testCredential.name);

      expect(credential).toBeDefined();
      expect(credential?.name).toBe(testCredential.name);
    });

    it('should get all credentials', () => {
      db.createCredential(testCredential);
      db.createCredential({ ...testCredential, name: 'ANOTHER_KEY' });

      const credentials = db.getCredentials();
      expect(credentials.length).toBe(2);
    });

    it('should update a credential', () => {
      const created = db.createCredential(testCredential);
      const updated = db.updateCredential(created.id, {
        description: 'Updated description',
      });

      expect(updated?.description).toBe('Updated description');
    });

    it('should delete a credential', () => {
      const created = db.createCredential(testCredential);
      const deleted = db.deleteCredential(created.id);

      expect(deleted).toBe(true);
      expect(db.getCredential(created.id)).toBeNull();
    });

    it('should check if credential exists', () => {
      expect(db.credentialExists(testCredential.name)).toBe(false);
      db.createCredential(testCredential);
      expect(db.credentialExists(testCredential.name)).toBe(true);
    });

    it('should update credential last used time', () => {
      const created = db.createCredential(testCredential);
      expect(db.getCredential(created.id)?.lastUsedAt).toBeNull();

      db.updateCredentialLastUsed(testCredential.name);

      expect(db.getCredential(created.id)?.lastUsedAt).toBeDefined();
    });

    it('should get credentials in use by tasks', () => {
      db.createCredential(testCredential);
      db.createCredential({ name: 'UNUSED_KEY', type: 'api_key', description: null });

      db.createTemplate({
        id: 'cred-test-template',
        name: 'Cred Test Template',
        description: null,
        category: 'custom',
        code: 'console.log("test");',
        paramsSchema: [],
        requiredCredentials: ['TEST_API_KEY'],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      db.createTask({
        templateId: 'cred-test-template',
        name: 'Cred Test Task',
        description: null,
        params: {},
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      const inUse = db.getCredentialsInUse();
      expect(inUse).toContain('TEST_API_KEY');
      expect(inUse).not.toContain('UNUSED_KEY');
    });
  });

  describe('statistics', () => {
    it('should get database stats', () => {
      const stats = db.getStats();

      expect(stats.templatesCount).toBeGreaterThan(0); // Built-in templates
      expect(stats.tasksCount).toBe(0);
      expect(stats.enabledTasksCount).toBe(0);
      expect(stats.executionsCount).toBe(0);
      expect(stats.credentialsCount).toBe(0);
      expect(stats.pendingExecutions).toBe(0);
      expect(stats.recentErrors).toBe(0);
    });
  });

  describe('transactions', () => {
    it('should run code in a transaction', () => {
      const result = db.transaction(() => {
        db.createTemplate({
          id: 'tx-test-1',
          name: 'Transaction Test 1',
          description: null,
          category: 'custom',
          code: 'console.log("1");',
          paramsSchema: [],
          requiredCredentials: [],
          suggestedSchedule: null,
          isBuiltin: false,
        });

        db.createTemplate({
          id: 'tx-test-2',
          name: 'Transaction Test 2',
          description: null,
          category: 'custom',
          code: 'console.log("2");',
          paramsSchema: [],
          requiredCredentials: [],
          suggestedSchedule: null,
          isBuiltin: false,
        });

        return 'completed';
      });

      expect(result).toBe('completed');
      expect(db.templateExists('tx-test-1')).toBe(true);
      expect(db.templateExists('tx-test-2')).toBe(true);
    });
  });
});
