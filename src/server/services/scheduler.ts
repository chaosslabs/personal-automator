/**
 * Scheduler Service
 *
 * Handles task scheduling using node-cron for cron expressions,
 * setTimeout for one-time tasks, and interval-based scheduling.
 *
 * Features:
 * - Cron expression validation and scheduling
 * - One-time task scheduling (setTimeout-based)
 * - Interval-based scheduling
 * - Next-run calculation
 * - Job management (register, unregister, pause, resume)
 * - App restart handling (reschedule persisted tasks)
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { Task, ScheduleType } from '../../shared/types.js';

/**
 * Represents a managed scheduled job
 */
export interface ScheduledJob {
  taskId: number;
  taskName: string;
  scheduleType: ScheduleType;
  scheduleValue: string;
  nextRunAt: Date | null;
  isActive: boolean;
  cronTask?: ScheduledTask;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Callback function type for task execution
 */
export type TaskExecutionCallback = (taskId: number) => Promise<void>;

/**
 * Options for the scheduler service
 */
export interface SchedulerOptions {
  onTaskExecute: TaskExecutionCallback;
  onNextRunUpdate?: (taskId: number, nextRunAt: Date | null) => Promise<void>;
}

/**
 * Cron validation result
 */
export interface CronValidationResult {
  valid: boolean;
  error?: string;
  nextRuns?: Date[];
}

/**
 * Scheduler Service class
 */
export class SchedulerService {
  private jobs: Map<number, ScheduledJob> = new Map();
  private running: boolean = false;
  private onTaskExecute: TaskExecutionCallback;
  private onNextRunUpdate: ((taskId: number, nextRunAt: Date | null) => Promise<void>) | null;

  constructor(options: SchedulerOptions) {
    this.onTaskExecute = options.onTaskExecute;
    this.onNextRunUpdate = options.onNextRunUpdate ?? null;
  }

  /**
   * Start the scheduler service
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    console.log('[Scheduler] Service started');
  }

  /**
   * Stop the scheduler service and clean up all jobs
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    // Stop all scheduled jobs
    for (const job of this.jobs.values()) {
      this.cleanupJob(job);
    }
    this.jobs.clear();

    this.running = false;
    console.log('[Scheduler] Service stopped');
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
   * Get the number of active (not paused) jobs
   */
  getActiveJobCount(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.isActive) {
        count++;
      }
    }
    return count;
  }

  /**
   * Register a task for scheduling
   */
  async registerTask(task: Task): Promise<void> {
    if (!this.running) {
      throw new Error('Scheduler is not running');
    }

    // Remove existing job if present
    if (this.jobs.has(task.id)) {
      this.unregisterTask(task.id);
    }

    const job: ScheduledJob = {
      taskId: task.id,
      taskName: task.name,
      scheduleType: task.scheduleType,
      scheduleValue: task.scheduleValue,
      nextRunAt: null,
      isActive: task.enabled,
    };

    // Schedule based on type
    if (task.enabled) {
      await this.scheduleJob(job);
    }

    this.jobs.set(task.id, job);
    console.log(`[Scheduler] Registered task "${task.name}" (id: ${task.id})`);
  }

  /**
   * Unregister a task from scheduling
   */
  unregisterTask(taskId: number): void {
    const job = this.jobs.get(taskId);
    if (!job) {
      return;
    }

    this.cleanupJob(job);
    this.jobs.delete(taskId);
    console.log(`[Scheduler] Unregistered task "${job.taskName}" (id: ${taskId})`);
  }

  /**
   * Pause a scheduled task
   */
  async pauseTask(taskId: number): Promise<void> {
    const job = this.jobs.get(taskId);
    if (!job || !job.isActive) {
      return;
    }

    this.cleanupJob(job);
    job.isActive = false;
    job.nextRunAt = null;

    // Update next run in database
    if (this.onNextRunUpdate) {
      await this.onNextRunUpdate(taskId, null);
    }

    console.log(`[Scheduler] Paused task "${job.taskName}" (id: ${taskId})`);
  }

  /**
   * Resume a paused task
   */
  async resumeTask(taskId: number): Promise<void> {
    const job = this.jobs.get(taskId);
    if (!job || job.isActive) {
      return;
    }

    job.isActive = true;
    await this.scheduleJob(job);

    console.log(`[Scheduler] Resumed task "${job.taskName}" (id: ${taskId})`);
  }

  /**
   * Get information about a scheduled job
   */
  getJob(taskId: number): ScheduledJob | undefined {
    return this.jobs.get(taskId);
  }

  /**
   * Get all scheduled jobs
   */
  getAllJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Reschedule all tasks from database (for app restart)
   */
  async rescheduleAllTasks(tasks: Task[]): Promise<void> {
    console.log(`[Scheduler] Rescheduling ${tasks.length} tasks...`);

    for (const task of tasks) {
      try {
        await this.registerTask(task);
      } catch (error) {
        console.error(
          `[Scheduler] Failed to reschedule task "${task.name}":`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(`[Scheduler] Rescheduling complete. ${this.getActiveJobCount()} active jobs.`);
  }

  /**
   * Validate a cron expression
   */
  static validateCron(expression: string): CronValidationResult {
    // Check if the expression is valid using node-cron
    if (!cron.validate(expression)) {
      return {
        valid: false,
        error: `Invalid cron expression: "${expression}"`,
      };
    }

    // Calculate next few run times
    const nextRuns = SchedulerService.getNextCronRuns(expression, 3);

    return {
      valid: true,
      nextRuns,
    };
  }

  /**
   * Validate a schedule (any type)
   */
  static validateSchedule(
    type: ScheduleType,
    value: string
  ): { valid: boolean; error?: string; nextRun?: Date } {
    switch (type) {
      case 'cron': {
        const result = SchedulerService.validateCron(value);
        if (!result.valid) {
          return {
            valid: false,
            error: result.error ?? 'Invalid cron expression',
          };
        }
        const nextRun = result.nextRuns?.[0];
        if (nextRun) {
          return { valid: true, nextRun };
        }
        return { valid: true };
      }

      case 'once': {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return {
            valid: false,
            error: `Invalid date format: "${value}". Use ISO 8601 format.`,
          };
        }
        if (date.getTime() <= Date.now()) {
          return {
            valid: false,
            error: 'One-time schedule must be in the future',
          };
        }
        return { valid: true, nextRun: date };
      }

      case 'interval': {
        const minutes = parseInt(value, 10);
        if (isNaN(minutes) || minutes <= 0) {
          return {
            valid: false,
            error: `Invalid interval: "${value}". Must be a positive number of minutes.`,
          };
        }
        if (minutes > 525600) {
          // Max 1 year in minutes
          return {
            valid: false,
            error: 'Interval cannot exceed 525600 minutes (1 year)',
          };
        }
        return {
          valid: true,
          nextRun: new Date(Date.now() + minutes * 60 * 1000),
        };
      }

      default: {
        const unknownType: string = type as string;
        return {
          valid: false,
          error: `Unknown schedule type: "${unknownType}"`,
        };
      }
    }
  }

  /**
   * Calculate next run time for a schedule
   */
  static calculateNextRun(type: ScheduleType, value: string, fromDate?: Date): Date | null {
    const baseDate = fromDate ?? new Date();

    switch (type) {
      case 'cron': {
        const nextRuns = SchedulerService.getNextCronRuns(value, 1, baseDate);
        return nextRuns[0] ?? null;
      }

      case 'once': {
        const date = new Date(value);
        if (isNaN(date.getTime()) || date.getTime() <= baseDate.getTime()) {
          return null;
        }
        return date;
      }

      case 'interval': {
        const minutes = parseInt(value, 10);
        if (isNaN(minutes) || minutes <= 0) {
          return null;
        }
        return new Date(baseDate.getTime() + minutes * 60 * 1000);
      }

      default:
        return null;
    }
  }

  /**
   * Get the next N cron run times
   */
  static getNextCronRuns(expression: string, count: number, fromDate?: Date): Date[] {
    if (!cron.validate(expression)) {
      return [];
    }

    const runs: Date[] = [];
    let currentDate = fromDate ?? new Date();

    // Parse cron expression parts
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      return [];
    }

    // Use a simple iterative approach to find next run times
    for (let i = 0; i < count; i++) {
      const nextRun = SchedulerService.findNextCronRun(expression, currentDate);
      if (nextRun) {
        runs.push(nextRun);
        // Move forward by 1 minute to find the next occurrence
        currentDate = new Date(nextRun.getTime() + 60000);
      } else {
        break;
      }
    }

    return runs;
  }

  /**
   * Find the next cron run time after a given date
   * This is a simplified implementation that handles common cron patterns
   */
  private static findNextCronRun(expression: string, fromDate: Date): Date | null {
    const parts = expression.trim().split(/\s+/);

    // Handle 5-field (minute-based) or 6-field (second-based) cron
    const hasSeconds = parts.length === 6;
    const [
      secondsOrMinutes,
      minutesOrHours,
      hoursOrDayOfMonth,
      dayOfMonthOrMonth,
      monthOrDayOfWeek,
      dayOfWeekOptional,
    ] = parts;

    const minute = hasSeconds ? minutesOrHours : secondsOrMinutes;
    const hour = hasSeconds ? hoursOrDayOfMonth : minutesOrHours;
    const dayOfMonth = hasSeconds ? dayOfMonthOrMonth : hoursOrDayOfMonth;
    const month = hasSeconds ? monthOrDayOfWeek : dayOfMonthOrMonth;
    const dayOfWeek = hasSeconds ? dayOfWeekOptional : monthOrDayOfWeek;

    // Start from the next minute
    const candidate = new Date(fromDate);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    // Iterate up to 2 years to find next match
    const maxIterations = 525600 * 2; // 2 years in minutes
    for (let i = 0; i < maxIterations; i++) {
      if (
        SchedulerService.matchesCronField(candidate.getMinutes(), minute!) &&
        SchedulerService.matchesCronField(candidate.getHours(), hour!) &&
        SchedulerService.matchesCronField(candidate.getDate(), dayOfMonth!) &&
        SchedulerService.matchesCronField(candidate.getMonth() + 1, month!) &&
        SchedulerService.matchesCronField(candidate.getDay(), dayOfWeek!)
      ) {
        return candidate;
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return null;
  }

  /**
   * Check if a value matches a cron field pattern
   */
  private static matchesCronField(value: number, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    // Handle step values (*/n)
    if (pattern.startsWith('*/')) {
      const step = parseInt(pattern.slice(2), 10);
      return !isNaN(step) && step > 0 && value % step === 0;
    }

    // Handle ranges (a-b)
    if (pattern.includes('-') && !pattern.includes(',')) {
      const [start, end] = pattern.split('-').map((n) => parseInt(n, 10));
      if (!isNaN(start!) && !isNaN(end!)) {
        return value >= start! && value <= end!;
      }
    }

    // Handle lists (a,b,c)
    if (pattern.includes(',')) {
      const values = pattern.split(',').map((v) => {
        // Handle ranges within lists
        if (v.includes('-')) {
          const [start, end] = v.split('-').map((n) => parseInt(n, 10));
          if (!isNaN(start!) && !isNaN(end!)) {
            return value >= start! && value <= end!;
          }
          return false;
        }
        return parseInt(v, 10) === value;
      });
      return values.some(Boolean);
    }

    // Handle simple number
    return parseInt(pattern, 10) === value;
  }

  /**
   * Schedule a job based on its type
   */
  private async scheduleJob(job: ScheduledJob): Promise<void> {
    switch (job.scheduleType) {
      case 'cron':
        this.scheduleCronJob(job);
        break;
      case 'once':
        this.scheduleOnceJob(job);
        break;
      case 'interval':
        this.scheduleIntervalJob(job);
        break;
    }

    // Update next run in database
    if (this.onNextRunUpdate && job.nextRunAt) {
      await this.onNextRunUpdate(job.taskId, job.nextRunAt);
    }
  }

  /**
   * Schedule a cron-based job
   */
  private scheduleCronJob(job: ScheduledJob): void {
    // Calculate next run time
    job.nextRunAt = SchedulerService.calculateNextRun('cron', job.scheduleValue);

    // Create the cron task
    job.cronTask = cron.schedule(job.scheduleValue, () => {
      void this.executeJob(job);
    });

    console.log(
      `[Scheduler] Scheduled cron job "${job.taskName}" (${job.scheduleValue}), next run: ${job.nextRunAt?.toISOString()}`
    );
  }

  /**
   * Schedule a one-time job
   */
  private scheduleOnceJob(job: ScheduledJob): void {
    const runDate = new Date(job.scheduleValue);
    const delay = runDate.getTime() - Date.now();

    if (delay <= 0) {
      console.log(`[Scheduler] One-time job "${job.taskName}" is in the past, skipping`);
      job.nextRunAt = null;
      job.isActive = false;
      return;
    }

    job.nextRunAt = runDate;

    // Use setTimeout for one-time execution
    job.timeoutId = setTimeout(() => {
      void this.executeJob(job).then(() => {
        // Mark as inactive after execution
        job.isActive = false;
        job.nextRunAt = null;
      });
    }, delay);

    console.log(
      `[Scheduler] Scheduled one-time job "${job.taskName}" for ${runDate.toISOString()}`
    );
  }

  /**
   * Schedule an interval-based job
   */
  private scheduleIntervalJob(job: ScheduledJob): void {
    const minutes = parseInt(job.scheduleValue, 10);
    if (isNaN(minutes) || minutes <= 0) {
      console.error(`[Scheduler] Invalid interval for job "${job.taskName}": ${job.scheduleValue}`);
      return;
    }

    const intervalMs = minutes * 60 * 1000;
    job.nextRunAt = new Date(Date.now() + intervalMs);

    // Use setTimeout for interval execution (to allow for dynamic rescheduling)
    const scheduleNext = (): void => {
      if (!job.isActive) return;

      job.timeoutId = setTimeout(() => {
        void this.executeJob(job).then(async () => {
          // Schedule next run if still active
          if (job.isActive) {
            job.nextRunAt = new Date(Date.now() + intervalMs);
            if (this.onNextRunUpdate) {
              await this.onNextRunUpdate(job.taskId, job.nextRunAt);
            }
            scheduleNext();
          }
        });
      }, intervalMs);
    };

    scheduleNext();

    console.log(
      `[Scheduler] Scheduled interval job "${job.taskName}" every ${minutes} minutes, next run: ${job.nextRunAt.toISOString()}`
    );
  }

  /**
   * Execute a job and handle its lifecycle
   */
  private async executeJob(job: ScheduledJob): Promise<void> {
    console.log(`[Scheduler] Executing task "${job.taskName}" (id: ${job.taskId})`);

    try {
      await this.onTaskExecute(job.taskId);

      // Update next run time for cron jobs
      if (job.scheduleType === 'cron') {
        job.nextRunAt = SchedulerService.calculateNextRun('cron', job.scheduleValue);
        if (this.onNextRunUpdate) {
          await this.onNextRunUpdate(job.taskId, job.nextRunAt);
        }
      }
    } catch (error) {
      console.error(
        `[Scheduler] Error executing task "${job.taskName}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Clean up a job's resources
   */
  private cleanupJob(job: ScheduledJob): void {
    if (job.cronTask) {
      job.cronTask.stop();
      delete job.cronTask;
    }
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
      delete job.timeoutId;
    }
  }
}

/**
 * Create a scheduler service instance
 */
export function createSchedulerService(options: SchedulerOptions): SchedulerService {
  return new SchedulerService(options);
}
