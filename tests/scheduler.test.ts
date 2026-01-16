import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor } from '../src/server/executor/index.js';
import { Scheduler } from '../src/server/scheduler/index.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-scheduler');

describe('Scheduler', () => {
  let db: DatabaseService;
  let vault: VaultService;
  let executor: TaskExecutor;
  let scheduler: Scheduler;

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
    scheduler = new Scheduler(db, executor);
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

  describe('validateCron', () => {
    it('should validate standard 5-field cron expressions', () => {
      // Valid expressions
      expect(Scheduler.validateCron('* * * * *').valid).toBe(true);
      expect(Scheduler.validateCron('0 * * * *').valid).toBe(true);
      expect(Scheduler.validateCron('*/5 * * * *').valid).toBe(true);
      expect(Scheduler.validateCron('0 0 * * *').valid).toBe(true);
      expect(Scheduler.validateCron('30 9 * * 1-5').valid).toBe(true);
      expect(Scheduler.validateCron('0 0 1 * *').valid).toBe(true);
      expect(Scheduler.validateCron('0 0 1 1 *').valid).toBe(true);
    });

    it('should validate 6-field cron expressions with seconds', () => {
      expect(Scheduler.validateCron('0 * * * * *').valid).toBe(true);
      expect(Scheduler.validateCron('*/10 * * * * *').valid).toBe(true);
      expect(Scheduler.validateCron('0 30 9 * * 1-5').valid).toBe(true);
    });

    it('should reject invalid cron expressions', () => {
      expect(Scheduler.validateCron('invalid').valid).toBe(false);
      expect(Scheduler.validateCron('').valid).toBe(false);
      expect(Scheduler.validateCron('* * *').valid).toBe(false);
      // node-cron validates minute values (0-59)
      expect(Scheduler.validateCron('60 * * * *').valid).toBe(false);
      // node-cron validates hour values (0-23)
      expect(Scheduler.validateCron('* 25 * * *').valid).toBe(false);
    });

    it('should return error message for invalid expressions', () => {
      const result = Scheduler.validateCron('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid cron expression');
    });
  });

  describe('validateSchedule', () => {
    it('should validate cron schedule type', () => {
      expect(Scheduler.validateSchedule('cron', '*/5 * * * *').valid).toBe(true);
      expect(Scheduler.validateSchedule('cron', 'invalid').valid).toBe(false);
    });

    it('should validate once schedule type with ISO datetime', () => {
      expect(Scheduler.validateSchedule('once', '2025-12-31T23:59:59Z').valid).toBe(true);
      expect(Scheduler.validateSchedule('once', '2025-06-15T10:30:00.000Z').valid).toBe(true);
      expect(Scheduler.validateSchedule('once', new Date().toISOString()).valid).toBe(true);
    });

    it('should reject invalid datetime for once schedule', () => {
      const result = Scheduler.validateSchedule('once', 'not-a-date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid datetime');
    });

    it('should validate interval schedule type', () => {
      expect(Scheduler.validateSchedule('interval', '5').valid).toBe(true);
      expect(Scheduler.validateSchedule('interval', '60').valid).toBe(true);
      expect(Scheduler.validateSchedule('interval', '1440').valid).toBe(true);
    });

    it('should reject invalid interval values', () => {
      expect(Scheduler.validateSchedule('interval', '0').valid).toBe(false);
      expect(Scheduler.validateSchedule('interval', '-5').valid).toBe(false);
      expect(Scheduler.validateSchedule('interval', 'abc').valid).toBe(false);

      const result = Scheduler.validateSchedule('interval', '0');
      expect(result.error).toContain('positive integer');
    });

    it('should reject unknown schedule types', () => {
      const result = Scheduler.validateSchedule('unknown' as 'cron', 'value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown schedule type');
    });
  });

  describe('calculateNextRun', () => {
    it('should calculate next cron run time', () => {
      const baseDate = new Date('2025-06-15T10:30:00Z');
      const nextRun = Scheduler.calculateNextRun('cron', '0 * * * *', baseDate);

      expect(nextRun).not.toBeNull();
      if (nextRun) {
        expect(nextRun.getTime()).toBeGreaterThan(baseDate.getTime());
        // Should be at minute 0 of some hour
        expect(nextRun.getMinutes()).toBe(0);
      }
    });

    it('should calculate next run for once schedule', () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      const baseDate = new Date();
      const nextRun = Scheduler.calculateNextRun('once', futureDate, baseDate);

      expect(nextRun).not.toBeNull();
      if (nextRun) {
        expect(nextRun.toISOString()).toBe(futureDate);
      }
    });

    it('should return null for past once schedule', () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      const baseDate = new Date();
      const nextRun = Scheduler.calculateNextRun('once', pastDate, baseDate);

      expect(nextRun).toBeNull();
    });

    it('should calculate next interval run time', () => {
      const baseDate = new Date('2025-06-15T10:30:00Z');
      const nextRun = Scheduler.calculateNextRun('interval', '5', baseDate);

      expect(nextRun).not.toBeNull();
      if (nextRun) {
        // Should be 5 minutes after base date
        const expectedTime = baseDate.getTime() + 5 * 60 * 1000;
        expect(nextRun.getTime()).toBe(expectedTime);
      }
    });

    it('should handle different cron patterns', () => {
      const baseDate = new Date('2025-06-15T10:30:00Z'); // Sunday

      // Every 5 minutes
      const every5 = Scheduler.calculateNextRun('cron', '*/5 * * * *', baseDate);
      expect(every5).not.toBeNull();
      if (every5) {
        expect(every5.getMinutes() % 5).toBe(0);
      }

      // Daily at midnight
      const midnight = Scheduler.calculateNextRun('cron', '0 0 * * *', baseDate);
      expect(midnight).not.toBeNull();
      if (midnight) {
        expect(midnight.getHours()).toBe(0);
        expect(midnight.getMinutes()).toBe(0);
      }
    });
  });

  describe('calculateNextRunISO', () => {
    it('should return ISO string for next run time', () => {
      const baseDate = new Date();
      const nextRunISO = Scheduler.calculateNextRunISO('interval', '10', baseDate);

      expect(nextRunISO).not.toBeNull();
      expect(typeof nextRunISO).toBe('string');
      // Should be valid ISO date
      if (nextRunISO) {
        expect(new Date(nextRunISO).toISOString()).toBe(nextRunISO);
      }
    });

    it('should return null for past one-time schedules', () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      const nextRunISO = Scheduler.calculateNextRunISO('once', pastDate);

      expect(nextRunISO).toBeNull();
    });
  });

  describe('start and stop', () => {
    it('should start the scheduler', () => {
      expect(scheduler.isRunning()).toBe(false);
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should stop the scheduler', () => {
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      scheduler.start();
      scheduler.start(); // Should not throw
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should not stop if not running', () => {
      scheduler.stop(); // Should not throw
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('registerTask and unregisterTask', () => {
    it('should register an enabled task', () => {
      // Create template and task
      db.createTemplate({
        id: 'test-register',
        name: 'Test Register',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'test-register',
        name: 'Register Test Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);
      expect(scheduler.getJobCount()).toBe(1);
    });

    it('should not register a disabled task', () => {
      db.createTemplate({
        id: 'test-disabled',
        name: 'Test Disabled',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'test-disabled',
        name: 'Disabled Test Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: false,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(false);
      expect(scheduler.getJobCount()).toBe(0);
    });

    it('should unregister a task', () => {
      db.createTemplate({
        id: 'test-unregister',
        name: 'Test Unregister',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'test-unregister',
        name: 'Unregister Test Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);

      scheduler.unregisterTask(task.id);
      expect(scheduler.isTaskRegistered(task.id)).toBe(false);
      expect(scheduler.getJobCount()).toBe(0);
    });

    it('should update next_run_at when registering', () => {
      db.createTemplate({
        id: 'test-nextrun',
        name: 'Test Next Run',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'test-nextrun',
        name: 'Next Run Test Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '30', // 30 minutes
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);

      // Check that next_run_at was updated
      const updatedTask = db.getTask(task.id);
      expect(updatedTask).not.toBeNull();
      expect(updatedTask?.nextRunAt).not.toBeNull();

      if (updatedTask && updatedTask.nextRunAt) {
        // Should be ~30 minutes in the future
        const nextRun = new Date(updatedTask.nextRunAt);
        const now = new Date();
        const diffMinutes = (nextRun.getTime() - now.getTime()) / (60 * 1000);
        expect(diffMinutes).toBeGreaterThan(29);
        expect(diffMinutes).toBeLessThan(31);
      }
    });
  });

  describe('updateTaskSchedule', () => {
    it('should re-register task when schedule changes', () => {
      db.createTemplate({
        id: 'test-update',
        name: 'Test Update',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'test-update',
        name: 'Update Test Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '30',
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);

      // Update the task
      db.updateTask(task.id, { scheduleValue: '60' });

      // Update scheduler
      scheduler.updateTaskSchedule(task.id);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);

      // Check new next_run_at
      const updatedTask = db.getTask(task.id);
      expect(updatedTask).not.toBeNull();
      expect(updatedTask?.nextRunAt).not.toBeNull();

      if (updatedTask && updatedTask.nextRunAt) {
        const nextRun = new Date(updatedTask.nextRunAt);
        const now = new Date();
        const diffMinutes = (nextRun.getTime() - now.getTime()) / (60 * 1000);
        expect(diffMinutes).toBeGreaterThan(59);
        expect(diffMinutes).toBeLessThan(61);
      }
    });

    it('should unregister task when disabled', () => {
      db.createTemplate({
        id: 'test-disable',
        name: 'Test Disable',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'test-disable',
        name: 'Disable Test Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '30',
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);

      // Disable the task
      db.updateTask(task.id, { enabled: false });

      // Update scheduler
      scheduler.updateTaskSchedule(task.id);
      expect(scheduler.isTaskRegistered(task.id)).toBe(false);
    });
  });

  describe('rescheduleAllTasks', () => {
    it('should schedule all enabled tasks on startup', () => {
      // Create template
      db.createTemplate({
        id: 'test-reschedule',
        name: 'Test Reschedule',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      // Create multiple tasks
      db.createTask({
        templateId: 'test-reschedule',
        name: 'Enabled Task 1',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '30',
        credentials: [],
        enabled: true,
      });

      db.createTask({
        templateId: 'test-reschedule',
        name: 'Enabled Task 2',
        description: null,
        params: {},
        scheduleType: 'cron',
        scheduleValue: '*/5 * * * *',
        credentials: [],
        enabled: true,
      });

      db.createTask({
        templateId: 'test-reschedule',
        name: 'Disabled Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: false,
      });

      // Start scheduler (which calls rescheduleAllTasks)
      scheduler.start();

      // Should have 2 jobs (only enabled tasks)
      expect(scheduler.getJobCount()).toBe(2);
    });

    it('should clear existing jobs before rescheduling', () => {
      db.createTemplate({
        id: 'test-clear',
        name: 'Test Clear',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'test-clear',
        name: 'Clear Test Task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '30',
        credentials: [],
        enabled: true,
      });

      // Register manually
      scheduler.registerTask(task);
      expect(scheduler.getJobCount()).toBe(1);

      // Reschedule all (should still have 1)
      scheduler.rescheduleAllTasks();
      expect(scheduler.getJobCount()).toBe(1);
    });
  });

  describe('one-time task scheduling', () => {
    it('should schedule a future one-time task', () => {
      db.createTemplate({
        id: 'test-once',
        name: 'Test Once',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const futureDate = new Date(Date.now() + 60000).toISOString();
      const task = db.createTask({
        templateId: 'test-once',
        name: 'Once Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: futureDate,
        credentials: [],
        enabled: true,
      });

      scheduler.registerTask(task);
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);

      // Check next_run_at was set
      const updatedTask = db.getTask(task.id);
      expect(updatedTask?.nextRunAt).toBe(futureDate);
    });

    it('should handle past one-time tasks', () => {
      db.createTemplate({
        id: 'test-past-once',
        name: 'Test Past Once',
        description: null,
        category: 'custom',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const pastDate = new Date(Date.now() - 60000).toISOString();
      const task = db.createTask({
        templateId: 'test-past-once',
        name: 'Past Once Test Task',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: pastDate,
        credentials: [],
        enabled: true,
      });

      // Should still register (for immediate execution handling)
      scheduler.registerTask(task);

      // The next_run_at should be null since it's past
      const updatedTask = db.getTask(task.id);
      expect(updatedTask?.nextRunAt).toBeNull();
    });
  });

  describe('cron pattern matching', () => {
    it('should match specific minute', () => {
      const baseDate = new Date('2025-06-15T10:25:00Z');
      const nextRun = Scheduler.calculateNextRun('cron', '30 * * * *', baseDate);

      expect(nextRun).not.toBeNull();
      if (nextRun) {
        expect(nextRun.getMinutes()).toBe(30);
      }
    });

    it('should match range pattern', () => {
      const baseDate = new Date('2025-06-15T10:25:00Z');
      const nextRun = Scheduler.calculateNextRun('cron', '0 9-17 * * *', baseDate);

      expect(nextRun).not.toBeNull();
      if (nextRun) {
        expect(nextRun.getHours()).toBeGreaterThanOrEqual(9);
        expect(nextRun.getHours()).toBeLessThanOrEqual(17);
      }
    });

    it('should match step pattern', () => {
      const baseDate = new Date('2025-06-15T10:00:00Z');
      const nextRun = Scheduler.calculateNextRun('cron', '*/15 * * * *', baseDate);

      expect(nextRun).not.toBeNull();
      if (nextRun) {
        expect(nextRun.getMinutes() % 15).toBe(0);
      }
    });

    it('should match list pattern', () => {
      const baseDate = new Date('2025-06-15T10:00:00Z');
      const nextRun = Scheduler.calculateNextRun('cron', '0 0 1,15 * *', baseDate);

      expect(nextRun).not.toBeNull();
      if (nextRun) {
        expect([1, 15]).toContain(nextRun.getDate());
      }
    });
  });

  describe('task execution integration', () => {
    it('should schedule tasks on start and update nextRunAt', () => {
      db.createTemplate({
        id: 'test-exec-integration',
        name: 'Test Exec Integration',
        description: null,
        category: 'custom',
        code: 'console.log("executed"); return "done";',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      // Create task with interval
      const task = db.createTask({
        templateId: 'test-exec-integration',
        name: 'Exec Integration Test',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60', // 60 minutes
        credentials: [],
        enabled: true,
      });

      // Start scheduler - this should register the task
      scheduler.start();

      // Verify task is registered
      expect(scheduler.isTaskRegistered(task.id)).toBe(true);
      expect(scheduler.isRunning()).toBe(true);

      // Check that nextRunAt was set
      const updatedTask = db.getTask(task.id);
      expect(updatedTask).not.toBeNull();
      expect(updatedTask?.nextRunAt).not.toBeNull();
    });
  });
});
