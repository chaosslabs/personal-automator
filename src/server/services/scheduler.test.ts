import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SchedulerService,
  createSchedulerService,
  type TaskExecutionCallback,
} from './scheduler';
import type { Task } from '../../shared/types';

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    validate: vi.fn((expr: string) => {
      // Basic validation for common patterns
      const parts = expr.trim().split(/\s+/);
      if (parts.length < 5 || parts.length > 6) return false;
      // Accept *, numbers, ranges, step values
      const validPart = /^(\*|(\d+(-\d+)?)(,\d+(-\d+)?)*)(\/((\d+)))?$/;
      return parts.every(
        (part) => part === '*' || validPart.test(part) || /^\*\/\d+$/.test(part)
      );
    }),
    schedule: vi.fn(() => ({
      stop: vi.fn(),
    })),
  },
}));

describe('SchedulerService', () => {
  let scheduler: SchedulerService;
  let mockExecuteCallback: TaskExecutionCallback;
  let mockNextRunUpdate: (taskId: number, nextRunAt: Date | null) => Promise<void>;

  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 1,
    templateId: 'test-template',
    name: 'Test Task',
    description: null,
    params: {},
    scheduleType: 'cron',
    scheduleValue: '*/5 * * * *',
    credentials: [],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRunAt: null,
    nextRunAt: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z'));

    mockExecuteCallback = vi.fn().mockResolvedValue(undefined);
    mockNextRunUpdate = vi.fn().mockResolvedValue(undefined);

    scheduler = createSchedulerService({
      onTaskExecute: mockExecuteCallback,
      onNextRunUpdate: mockNextRunUpdate,
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('lifecycle management', () => {
    it('should start and stop correctly', () => {
      expect(scheduler.isRunning()).toBe(false);

      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      scheduler.start();
      scheduler.start(); // Should be idempotent
      expect(scheduler.isRunning()).toBe(true);
    });

    it('should not stop if not running', () => {
      scheduler.stop(); // Should not throw
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('job registration', () => {
    beforeEach(() => {
      scheduler.start();
    });

    it('should register a task', async () => {
      const task = createMockTask();
      await scheduler.registerTask(task);

      expect(scheduler.getJobCount()).toBe(1);
      expect(scheduler.getJob(task.id)).toBeDefined();
    });

    it('should throw if scheduler is not running', async () => {
      scheduler.stop();
      const task = createMockTask();

      await expect(scheduler.registerTask(task)).rejects.toThrow(
        'Scheduler is not running'
      );
    });

    it('should unregister a task', async () => {
      const task = createMockTask();
      await scheduler.registerTask(task);
      scheduler.unregisterTask(task.id);

      expect(scheduler.getJobCount()).toBe(0);
      expect(scheduler.getJob(task.id)).toBeUndefined();
    });

    it('should replace existing job when registering with same id', async () => {
      const task1 = createMockTask({ name: 'Task v1' });
      const task2 = createMockTask({ name: 'Task v2' });

      await scheduler.registerTask(task1);
      await scheduler.registerTask(task2);

      expect(scheduler.getJobCount()).toBe(1);
      expect(scheduler.getJob(task1.id)?.taskName).toBe('Task v2');
    });

    it('should track active job count', async () => {
      const enabledTask = createMockTask({ id: 1, enabled: true });
      const disabledTask = createMockTask({ id: 2, enabled: false });

      await scheduler.registerTask(enabledTask);
      await scheduler.registerTask(disabledTask);

      expect(scheduler.getJobCount()).toBe(2);
      expect(scheduler.getActiveJobCount()).toBe(1);
    });
  });

  describe('pause and resume', () => {
    beforeEach(() => {
      scheduler.start();
    });

    it('should pause a task', async () => {
      const task = createMockTask();
      await scheduler.registerTask(task);
      await scheduler.pauseTask(task.id);

      const job = scheduler.getJob(task.id);
      expect(job?.isActive).toBe(false);
      expect(job?.nextRunAt).toBeNull();
      expect(mockNextRunUpdate).toHaveBeenCalledWith(task.id, null);
    });

    it('should resume a paused task', async () => {
      const task = createMockTask();
      await scheduler.registerTask(task);
      await scheduler.pauseTask(task.id);
      await scheduler.resumeTask(task.id);

      const job = scheduler.getJob(task.id);
      expect(job?.isActive).toBe(true);
    });

    it('should not pause an already paused task', async () => {
      const task = createMockTask();
      await scheduler.registerTask(task);
      await scheduler.pauseTask(task.id);
      vi.clearAllMocks();
      await scheduler.pauseTask(task.id);

      expect(mockNextRunUpdate).not.toHaveBeenCalled();
    });
  });

  describe('cron expression validation', () => {
    it('should validate valid cron expressions', () => {
      const validExpressions = [
        '* * * * *',
        '*/5 * * * *',
        '0 0 * * *',
        '0 9 * * 1-5',
        '30 4 1,15 * *',
      ];

      for (const expr of validExpressions) {
        const result = SchedulerService.validateCron(expr);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('should reject invalid cron expressions', () => {
      const invalidExpressions = ['invalid', '* * *', '', '* *'];

      for (const expr of invalidExpressions) {
        const result = SchedulerService.validateCron(expr);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('schedule validation', () => {
    it('should validate cron schedules', () => {
      const result = SchedulerService.validateSchedule('cron', '*/5 * * * *');
      expect(result.valid).toBe(true);
    });

    it('should validate one-time schedules', () => {
      const futureDate = new Date('2025-02-01T10:00:00.000Z');
      const result = SchedulerService.validateSchedule('once', futureDate.toISOString());
      expect(result.valid).toBe(true);
      expect(result.nextRun).toEqual(futureDate);
    });

    it('should reject past one-time schedules', () => {
      const pastDate = new Date('2024-01-01T10:00:00.000Z');
      const result = SchedulerService.validateSchedule('once', pastDate.toISOString());
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should reject invalid date formats', () => {
      const result = SchedulerService.validateSchedule('once', 'not-a-date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid date format');
    });

    it('should validate interval schedules', () => {
      const result = SchedulerService.validateSchedule('interval', '30');
      expect(result.valid).toBe(true);
      expect(result.nextRun).toBeDefined();
    });

    it('should reject invalid interval values', () => {
      const invalidValues = ['0', '-5', 'abc', ''];
      for (const value of invalidValues) {
        const result = SchedulerService.validateSchedule('interval', value);
        expect(result.valid).toBe(false);
      }
    });

    it('should reject intervals exceeding 1 year', () => {
      const result = SchedulerService.validateSchedule('interval', '600000');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('525600');
    });

    it('should reject unknown schedule types', () => {
      const result = SchedulerService.validateSchedule('unknown' as never, 'value');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown schedule type');
    });
  });

  describe('next run calculation', () => {
    it('should calculate next cron run', () => {
      const nextRun = SchedulerService.calculateNextRun('cron', '0 12 * * *');
      expect(nextRun).toBeDefined();
      expect(nextRun!.getHours()).toBe(12);
      expect(nextRun!.getMinutes()).toBe(0);
    });

    it('should calculate next one-time run', () => {
      const futureDate = new Date('2025-02-01T10:00:00.000Z');
      const nextRun = SchedulerService.calculateNextRun('once', futureDate.toISOString());
      expect(nextRun).toEqual(futureDate);
    });

    it('should return null for past one-time schedules', () => {
      const pastDate = new Date('2024-01-01T10:00:00.000Z');
      const nextRun = SchedulerService.calculateNextRun('once', pastDate.toISOString());
      expect(nextRun).toBeNull();
    });

    it('should calculate next interval run', () => {
      const nextRun = SchedulerService.calculateNextRun('interval', '60');
      expect(nextRun).toBeDefined();
      // Should be 60 minutes from now
      expect(nextRun!.getTime()).toBe(
        new Date('2025-01-15T10:00:00.000Z').getTime() + 60 * 60 * 1000
      );
    });

    it('should return null for invalid schedules', () => {
      expect(SchedulerService.calculateNextRun('interval', 'invalid')).toBeNull();
      expect(SchedulerService.calculateNextRun('once', 'invalid')).toBeNull();
    });
  });

  describe('getNextCronRuns', () => {
    it('should return multiple next run times', () => {
      const runs = SchedulerService.getNextCronRuns('0 * * * *', 3);
      expect(runs.length).toBe(3);

      // Each run should be 1 hour apart
      for (let i = 1; i < runs.length; i++) {
        const diff = runs[i]!.getTime() - runs[i - 1]!.getTime();
        expect(diff).toBe(60 * 60 * 1000); // 1 hour
      }
    });

    it('should return empty array for invalid cron', () => {
      const runs = SchedulerService.getNextCronRuns('invalid', 3);
      expect(runs).toEqual([]);
    });
  });

  describe('getAllJobs', () => {
    beforeEach(() => {
      scheduler.start();
    });

    it('should return all registered jobs', async () => {
      const task1 = createMockTask({ id: 1 });
      const task2 = createMockTask({ id: 2 });

      await scheduler.registerTask(task1);
      await scheduler.registerTask(task2);

      const jobs = scheduler.getAllJobs();
      expect(jobs.length).toBe(2);
      expect(jobs.map((j) => j.taskId)).toEqual([1, 2]);
    });
  });

  describe('reschedule all tasks', () => {
    beforeEach(() => {
      scheduler.start();
    });

    it('should reschedule multiple tasks', async () => {
      const tasks = [
        createMockTask({ id: 1, name: 'Task 1' }),
        createMockTask({ id: 2, name: 'Task 2' }),
        createMockTask({ id: 3, name: 'Task 3' }),
      ];

      await scheduler.rescheduleAllTasks(tasks);

      expect(scheduler.getJobCount()).toBe(3);
      expect(scheduler.getActiveJobCount()).toBe(3);
    });

    it('should handle errors during rescheduling gracefully', async () => {
      const tasks = [createMockTask({ id: 1 })];

      // Mock to make one task fail
      const originalRegister = scheduler.registerTask.bind(scheduler);
      let firstCall = true;
      vi.spyOn(scheduler, 'registerTask').mockImplementation(async (task) => {
        if (firstCall) {
          firstCall = false;
          throw new Error('Registration failed');
        }
        return originalRegister(task);
      });

      // Should not throw
      await scheduler.rescheduleAllTasks(tasks);
    });
  });

  describe('one-time scheduling', () => {
    beforeEach(() => {
      scheduler.start();
    });

    it('should execute one-time task at scheduled time', async () => {
      const futureDate = new Date('2025-01-15T11:00:00.000Z');
      const task = createMockTask({
        scheduleType: 'once',
        scheduleValue: futureDate.toISOString(),
      });

      await scheduler.registerTask(task);

      // Advance time to trigger execution
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // 1 hour

      expect(mockExecuteCallback).toHaveBeenCalledWith(task.id);
    });

    it('should skip past one-time tasks', async () => {
      const pastDate = new Date('2025-01-15T09:00:00.000Z');
      const task = createMockTask({
        scheduleType: 'once',
        scheduleValue: pastDate.toISOString(),
      });

      await scheduler.registerTask(task);

      const job = scheduler.getJob(task.id);
      expect(job?.isActive).toBe(false);
      expect(job?.nextRunAt).toBeNull();
    });
  });

  describe('interval scheduling', () => {
    beforeEach(() => {
      scheduler.start();
    });

    it('should execute interval task repeatedly', async () => {
      const task = createMockTask({
        scheduleType: 'interval',
        scheduleValue: '30', // 30 minutes
      });

      await scheduler.registerTask(task);

      // First execution after 30 minutes
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
      expect(mockExecuteCallback).toHaveBeenCalledTimes(1);

      // Second execution after another 30 minutes
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
      expect(mockExecuteCallback).toHaveBeenCalledTimes(2);
    });

    it('should stop interval when paused', async () => {
      const task = createMockTask({
        scheduleType: 'interval',
        scheduleValue: '30',
      });

      await scheduler.registerTask(task);
      await scheduler.pauseTask(task.id);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(mockExecuteCallback).not.toHaveBeenCalled();
    });
  });

  describe('createSchedulerService factory', () => {
    it('should create a scheduler instance', () => {
      const instance = createSchedulerService({
        onTaskExecute: vi.fn(),
      });

      expect(instance).toBeInstanceOf(SchedulerService);
    });
  });
});
