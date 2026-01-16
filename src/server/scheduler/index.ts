import cron, { type ScheduledTask } from 'node-cron';
import type { DatabaseService } from '../database/index.js';
import type { TaskExecutor } from '../executor/index.js';
import type { Task, ScheduleType } from '../../shared/types.js';

/**
 * Represents a registered job in the scheduler
 */
interface RegisteredJob {
  taskId: number;
  scheduleType: ScheduleType;
  scheduleValue: string;
  cronTask?: ScheduledTask | undefined;
  timeoutId?: NodeJS.Timeout | undefined;
}

/**
 * Result of cron expression validation
 */
export interface CronValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Scheduler service for managing task execution schedules.
 * Supports three schedule types:
 * - cron: Standard cron expressions (5 or 6 fields)
 * - once: One-time execution at a specific ISO datetime
 * - interval: Recurring execution at fixed intervals (in minutes)
 */
export class Scheduler {
  private db: DatabaseService;
  private executor: TaskExecutor;
  private jobs: Map<number, RegisteredJob> = new Map();
  private running = false;
  private checkInterval: NodeJS.Timeout | null = null;

  // How often to check for tasks that might have been missed (in ms)
  private static readonly CHECK_INTERVAL_MS = 60_000; // 1 minute

  constructor(db: DatabaseService, executor: TaskExecutor) {
    this.db = db;
    this.executor = executor;
  }

  /**
   * Validate a cron expression
   */
  static validateCron(expression: string): CronValidationResult {
    // node-cron supports 5 or 6 field cron expressions
    // 5 fields: minute hour day month weekday
    // 6 fields: second minute hour day month weekday
    const isValid = cron.validate(expression);
    if (isValid) {
      return { valid: true };
    }
    return {
      valid: false,
      error: `Invalid cron expression: "${expression}". Expected 5 fields (minute hour day month weekday) or 6 fields (second minute hour day month weekday).`,
    };
  }

  /**
   * Validate a schedule value based on its type
   */
  static validateSchedule(type: ScheduleType, value: string): { valid: boolean; error?: string } {
    switch (type) {
      case 'cron':
        return Scheduler.validateCron(value);

      case 'once': {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return {
            valid: false,
            error: `Invalid datetime: "${value}". Expected ISO 8601 format (e.g., "2024-12-31T23:59:59Z").`,
          };
        }
        return { valid: true };
      }

      case 'interval': {
        const minutes = parseInt(value, 10);
        if (isNaN(minutes) || minutes <= 0) {
          return {
            valid: false,
            error: `Invalid interval: "${value}". Expected a positive integer representing minutes.`,
          };
        }
        return { valid: true };
      }

      default:
        return {
          valid: false,
          error: `Unknown schedule type: "${type as string}". Expected "cron", "once", or "interval".`,
        };
    }
  }

  /**
   * Calculate the next run time for a task based on its schedule
   */
  static calculateNextRun(
    type: ScheduleType,
    value: string,
    fromDate: Date = new Date()
  ): Date | null {
    switch (type) {
      case 'cron':
        return Scheduler.calculateNextCronRun(value, fromDate);

      case 'once': {
        const scheduledDate = new Date(value);
        // Only return if the scheduled time is in the future
        return scheduledDate > fromDate ? scheduledDate : null;
      }

      case 'interval': {
        const minutes = parseInt(value, 10);
        if (isNaN(minutes) || minutes <= 0) return null;
        const nextRun = new Date(fromDate.getTime() + minutes * 60 * 1000);
        return nextRun;
      }

      default:
        return null;
    }
  }

  /**
   * Calculate the next cron run time
   * Uses a simple approach: iterate minute by minute until we find a match
   */
  private static calculateNextCronRun(expression: string, fromDate: Date): Date | null {
    if (!cron.validate(expression)) {
      return null;
    }

    // Parse the cron expression
    const parts = expression.trim().split(/\s+/);
    const hasSeconds = parts.length === 6;

    // Extract fields based on format
    let secondPattern: string;
    let minutePattern: string;
    let hourPattern: string;
    let dayPattern: string;
    let monthPattern: string;
    let weekdayPattern: string;

    if (hasSeconds) {
      secondPattern = parts[0] ?? '*';
      minutePattern = parts[1] ?? '*';
      hourPattern = parts[2] ?? '*';
      dayPattern = parts[3] ?? '*';
      monthPattern = parts[4] ?? '*';
      weekdayPattern = parts[5] ?? '*';
    } else {
      secondPattern = '0';
      minutePattern = parts[0] ?? '*';
      hourPattern = parts[1] ?? '*';
      dayPattern = parts[2] ?? '*';
      monthPattern = parts[3] ?? '*';
      weekdayPattern = parts[4] ?? '*';
    }

    // Start from the next second/minute
    const startDate = new Date(fromDate.getTime() + 1000);

    // Search for the next matching time (limit to 2 years to avoid infinite loops)
    const maxIterations = 2 * 365 * 24 * 60; // ~2 years of minutes
    const candidate = new Date(startDate);
    candidate.setMilliseconds(0);

    for (let i = 0; i < maxIterations; i++) {
      if (
        Scheduler.matchesCronField(candidate.getMonth() + 1, monthPattern) &&
        Scheduler.matchesCronField(candidate.getDate(), dayPattern) &&
        Scheduler.matchesCronField(candidate.getDay(), weekdayPattern) &&
        Scheduler.matchesCronField(candidate.getHours(), hourPattern) &&
        Scheduler.matchesCronField(candidate.getMinutes(), minutePattern) &&
        Scheduler.matchesCronField(candidate.getSeconds(), secondPattern)
      ) {
        return candidate;
      }

      // Increment by 1 second if cron has seconds field, otherwise by 1 minute
      if (hasSeconds) {
        candidate.setSeconds(candidate.getSeconds() + 1);
      } else {
        candidate.setMinutes(candidate.getMinutes() + 1);
        candidate.setSeconds(0);
      }
    }

    return null; // No match found within the search window
  }

  /**
   * Check if a value matches a cron field pattern
   */
  private static matchesCronField(value: number, pattern: string): boolean {
    // Handle wildcard
    if (pattern === '*') return true;

    // Handle lists (e.g., "1,3,5")
    if (pattern.includes(',')) {
      const values = pattern.split(',');
      return values.some((v) => Scheduler.matchesCronField(value, v.trim()));
    }

    // Handle ranges (e.g., "1-5")
    if (pattern.includes('-') && !pattern.startsWith('-')) {
      const rangeParts = pattern.split('-').map((n) => parseInt(n, 10));
      const start = rangeParts[0];
      const end = rangeParts[1];
      if (start !== undefined && end !== undefined && !isNaN(start) && !isNaN(end)) {
        return value >= start && value <= end;
      }
    }

    // Handle step values (e.g., "*/5" or "10-20/2")
    if (pattern.includes('/')) {
      const stepParts = pattern.split('/');
      const range = stepParts[0];
      const step = stepParts[1];
      if (!step) return false;
      const stepNum = parseInt(step, 10);
      if (isNaN(stepNum) || stepNum <= 0) return false;

      if (range === '*') {
        return value % stepNum === 0;
      }

      if (range && range.includes('-')) {
        const rangeParts = range.split('-').map((n) => parseInt(n, 10));
        const start = rangeParts[0];
        const end = rangeParts[1];
        if (start !== undefined && end !== undefined && !isNaN(start) && !isNaN(end)) {
          if (value < start || value > end) return false;
          return (value - start) % stepNum === 0;
        }
      }
    }

    // Handle simple numeric value
    const numericValue = parseInt(pattern, 10);
    return !isNaN(numericValue) && value === numericValue;
  }

  /**
   * Get the next run time as an ISO string, or null if not applicable
   */
  static calculateNextRunISO(
    type: ScheduleType,
    value: string,
    fromDate: Date = new Date()
  ): string | null {
    const nextRun = Scheduler.calculateNextRun(type, value, fromDate);
    return nextRun ? nextRun.toISOString() : null;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      console.log('Scheduler already running');
      return;
    }

    console.log('Starting scheduler...');
    this.running = true;

    // Load and schedule all enabled tasks from the database
    this.rescheduleAllTasks();

    // Start periodic check for missed tasks
    this.checkInterval = setInterval(() => {
      this.checkDueTasks().catch((err: unknown) => {
        console.error('Error checking due tasks:', err);
      });
    }, Scheduler.CHECK_INTERVAL_MS);

    console.log('Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) {
      console.log('Scheduler not running');
      return;
    }

    console.log('Stopping scheduler...');

    // Clear the periodic check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Unregister all jobs
    for (const [taskId] of this.jobs) {
      this.unregisterJob(taskId);
    }

    this.running = false;
    console.log('Scheduler stopped');
  }

  /**
   * Check if the scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the number of registered jobs
   */
  getJobCount(): number {
    return this.jobs.size;
  }

  /**
   * Reschedule all enabled tasks from the database
   * Called on startup and when tasks are updated
   */
  rescheduleAllTasks(): void {
    console.log('Rescheduling all tasks...');

    // Clear all existing jobs
    for (const [taskId] of this.jobs) {
      this.unregisterJob(taskId);
    }

    // Load enabled tasks
    const tasks = this.db.getTasks({ enabled: true });
    console.log(`Found ${tasks.length} enabled tasks`);

    for (const task of tasks) {
      this.registerTask(task);
    }

    console.log(`Registered ${this.jobs.size} jobs`);
  }

  /**
   * Register a task with the scheduler
   */
  registerTask(task: Task): void {
    if (!task.enabled) {
      console.log(`Skipping disabled task: ${task.name} (${task.id})`);
      return;
    }

    // Validate schedule
    const validation = Scheduler.validateSchedule(task.scheduleType, task.scheduleValue);
    if (!validation.valid) {
      console.error(`Invalid schedule for task ${task.name}: ${validation.error}`);
      return;
    }

    // Unregister if already registered
    if (this.jobs.has(task.id)) {
      this.unregisterJob(task.id);
    }

    // Calculate and update next run time
    const nextRunAt = Scheduler.calculateNextRunISO(task.scheduleType, task.scheduleValue);

    // Update the task's next_run_at in the database
    if (nextRunAt !== task.nextRunAt) {
      this.db.updateTask(task.id, { nextRunAt });
    }

    // Register the job based on schedule type
    const job: RegisteredJob = {
      taskId: task.id,
      scheduleType: task.scheduleType,
      scheduleValue: task.scheduleValue,
    };

    switch (task.scheduleType) {
      case 'cron':
        job.cronTask = this.registerCronJob(task);
        break;

      case 'once':
        job.timeoutId = this.registerOneTimeJob(task);
        break;

      case 'interval':
        job.timeoutId = this.registerIntervalJob(task);
        break;
    }

    this.jobs.set(task.id, job);
    console.log(
      `Registered ${task.scheduleType} job for task: ${task.name} (${task.id}), next run: ${nextRunAt ?? 'none'}`
    );
  }

  /**
   * Unregister a task from the scheduler
   */
  unregisterTask(taskId: number): void {
    this.unregisterJob(taskId);
  }

  /**
   * Register a cron job for a task
   */
  private registerCronJob(task: Task): ScheduledTask {
    return cron.schedule(task.scheduleValue, () => {
      this.executeTask(task.id).catch((err: unknown) => {
        console.error(`Error executing cron task ${task.name}:`, err);
      });
    });
  }

  /**
   * Register a one-time job for a task
   */
  private registerOneTimeJob(task: Task): NodeJS.Timeout | undefined {
    const scheduledDate = new Date(task.scheduleValue);
    const now = new Date();

    if (scheduledDate <= now) {
      console.log(
        `One-time task ${task.name} (${task.id}) is past due, scheduling for immediate execution`
      );
      // Execute immediately if past due
      setImmediate(() => {
        this.executeTask(task.id).catch((err: unknown) => {
          console.error(`Error executing one-time task ${task.name}:`, err);
        });
      });
      return undefined;
    }

    const delay = scheduledDate.getTime() - now.getTime();
    console.log(`Scheduling one-time task ${task.name} (${task.id}) in ${delay}ms`);

    return setTimeout(() => {
      this.executeTask(task.id).catch((err: unknown) => {
        console.error(`Error executing one-time task ${task.name}:`, err);
      });
    }, delay);
  }

  /**
   * Register an interval job for a task
   */
  private registerIntervalJob(task: Task): NodeJS.Timeout {
    const minutes = parseInt(task.scheduleValue, 10);
    const intervalMs = minutes * 60 * 1000;

    // Calculate delay until next run
    let delay: number;
    if (task.nextRunAt) {
      const nextRun = new Date(task.nextRunAt);
      const now = new Date();
      delay = Math.max(0, nextRun.getTime() - now.getTime());
    } else {
      // If no next run time, start after one interval
      delay = intervalMs;
    }

    console.log(
      `Scheduling interval task ${task.name} (${task.id}) with initial delay ${delay}ms, interval ${intervalMs}ms`
    );

    // Set up the first execution, then recurring
    const executeAndReschedule = (): void => {
      this.executeTask(task.id)
        .then(() => {
          // Re-register to continue the interval
          const job = this.jobs.get(task.id);
          if (job && this.running) {
            // Update task to get current state
            const updatedTask = this.db.getTask(task.id);
            if (updatedTask && updatedTask.enabled) {
              job.timeoutId = setTimeout(executeAndReschedule, intervalMs);
            }
          }
        })
        .catch((err: unknown) => {
          console.error(`Error executing interval task ${task.name}:`, err);
          // Still reschedule even on error
          const job = this.jobs.get(task.id);
          if (job && this.running) {
            job.timeoutId = setTimeout(executeAndReschedule, intervalMs);
          }
        });
    };

    return setTimeout(executeAndReschedule, delay);
  }

  /**
   * Unregister a job by task ID
   */
  private unregisterJob(taskId: number): void {
    const job = this.jobs.get(taskId);
    if (!job) return;

    if (job.cronTask) {
      job.cronTask.stop();
    }

    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
    }

    this.jobs.delete(taskId);
    console.log(`Unregistered job for task ${taskId}`);
  }

  /**
   * Execute a task and handle the result
   */
  private async executeTask(taskId: number): Promise<void> {
    console.log(`Executing task ${taskId}...`);

    try {
      // Get latest task state
      const task = this.db.getTask(taskId);
      if (!task) {
        console.error(`Task ${taskId} not found, unregistering`);
        this.unregisterJob(taskId);
        return;
      }

      if (!task.enabled) {
        console.log(`Task ${task.name} is disabled, skipping execution`);
        return;
      }

      // Execute the task
      const result = await this.executor.execute(taskId);

      // Log result
      if (result.success) {
        console.log(`Task ${task.name} completed successfully (execution ${result.execution.id})`);
      } else {
        console.error(
          `Task ${task.name} failed: ${result.error} (execution ${result.execution.id})`
        );
      }

      // Calculate and update next run time
      const nextRunAt = Scheduler.calculateNextRunISO(task.scheduleType, task.scheduleValue);

      // Update task with new next run time
      this.db.updateTaskLastRun(taskId, new Date().toISOString(), nextRunAt);

      // For one-time tasks, disable after execution
      if (task.scheduleType === 'once') {
        console.log(`One-time task ${task.name} executed, disabling`);
        this.db.updateTask(taskId, { enabled: false, nextRunAt: null });
        this.unregisterJob(taskId);
      }
    } catch (error) {
      console.error(`Failed to execute task ${taskId}:`, error);
    }
  }

  /**
   * Check for tasks that are due and might have been missed
   */
  private async checkDueTasks(): Promise<void> {
    if (!this.running) return;

    const dueTasks = this.db.getTasksDueToRun();
    if (dueTasks.length === 0) return;

    console.log(`Found ${dueTasks.length} tasks due to run`);

    for (const task of dueTasks) {
      // Check if task is already registered (might be executing)
      const job = this.jobs.get(task.id);
      if (job && task.scheduleType === 'cron') {
        // Cron jobs handle their own scheduling, skip
        continue;
      }

      // Execute missed tasks
      try {
        await this.executeTask(task.id);
      } catch (error) {
        console.error(`Error executing due task ${task.name}:`, error);
      }
    }
  }

  /**
   * Update a task's schedule (call when task is modified)
   */
  updateTaskSchedule(taskId: number): void {
    const task = this.db.getTask(taskId);
    if (!task) {
      this.unregisterJob(taskId);
      return;
    }

    if (task.enabled) {
      this.registerTask(task);
    } else {
      this.unregisterJob(taskId);
    }
  }

  /**
   * Check if a task is registered with the scheduler
   */
  isTaskRegistered(taskId: number): boolean {
    return this.jobs.has(taskId);
  }
}

// Singleton instance
let schedulerInstance: Scheduler | null = null;

/**
 * Get the scheduler instance
 */
export function getScheduler(db: DatabaseService, executor: TaskExecutor): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler(db, executor);
  }
  return schedulerInstance;
}

/**
 * Close/clear the scheduler (for testing/cleanup)
 */
export function closeScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}

export default Scheduler;
