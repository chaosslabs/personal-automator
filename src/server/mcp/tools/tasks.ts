/**
 * MCP Task Management Tools
 *
 * Provides tools for creating, managing, and scheduling tasks.
 */

import type { MCPServer } from '../index.js';
import { createSuccessResponse, createErrorResponse } from '../index.js';
import { Scheduler } from '../../scheduler/index.js';
import type { ScheduleType, TaskFilters } from '../../../shared/types.js';

/**
 * Schedule object for task creation/update
 */
interface ScheduleInput {
  type: ScheduleType;
  expression?: string; // For cron
  datetime?: string; // For once
  minutes?: number; // For interval
}

/**
 * Schedule task request arguments
 */
interface ScheduleTaskArgs {
  template_id: string;
  name: string;
  description?: string;
  params?: Record<string, unknown>;
  schedule: ScheduleInput;
  credentials?: string[];
  enabled?: boolean;
}

/**
 * List tasks request arguments
 */
interface ListTasksArgs {
  enabled?: boolean;
  has_errors?: boolean;
  template_id?: string;
}

/**
 * Get task request arguments
 */
interface GetTaskArgs {
  name: string;
  recent_executions?: number;
}

/**
 * Update task request arguments
 */
interface UpdateTaskArgs {
  name: string;
  new_name?: string;
  description?: string;
  params?: Record<string, unknown>;
  schedule?: ScheduleInput;
  credentials?: string[];
  enabled?: boolean;
}

/**
 * Delete task request arguments
 */
interface DeleteTaskArgs {
  name: string;
}

/**
 * Toggle task request arguments
 */
interface ToggleTaskArgs {
  name: string;
  enabled: boolean;
}

/**
 * Convert schedule input to schedule type and value
 */
function parseScheduleInput(schedule: ScheduleInput): { type: ScheduleType; value: string } | null {
  switch (schedule.type) {
    case 'cron':
      if (!schedule.expression) return null;
      return { type: 'cron', value: schedule.expression };
    case 'once':
      if (!schedule.datetime) return null;
      return { type: 'once', value: schedule.datetime };
    case 'interval':
      if (schedule.minutes === undefined) return null;
      return { type: 'interval', value: String(schedule.minutes) };
    default:
      return null;
  }
}

/**
 * Register task management tools with the MCP server
 */
export function registerTaskTools(server: MCPServer): void {
  const { db, scheduler } = server.getServices();

  // schedule_task tool
  server.registerTool({
    tool: {
      name: 'schedule_task',
      description:
        'Create a new scheduled task from an existing template. The task will run according to the specified schedule.',
      inputSchema: {
        type: 'object',
        properties: {
          template_id: {
            type: 'string',
            description: 'The template ID to use (from list_templates)',
          },
          name: {
            type: 'string',
            description: 'Unique name for this task',
          },
          description: {
            type: 'string',
            description: 'Human-readable description of what this task does',
          },
          params: {
            type: 'object',
            description: 'Parameters to pass to the template',
          },
          schedule: {
            type: 'object',
            description: 'When to run the task',
            properties: {
              type: {
                type: 'string',
                enum: ['cron', 'once', 'interval'],
                description: 'Schedule type',
              },
              expression: {
                type: 'string',
                description: 'Cron expression (for type: cron)',
              },
              datetime: {
                type: 'string',
                description: 'ISO datetime string (for type: once)',
              },
              minutes: {
                type: 'number',
                description: 'Interval in minutes (for type: interval)',
              },
            },
            required: ['type'],
          },
          credentials: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional credential names to make available to this task',
          },
          enabled: {
            type: 'boolean',
            description: 'Whether to start the task enabled (default: true)',
          },
        },
        required: ['template_id', 'name', 'schedule'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { template_id, name, description, params, schedule, credentials, enabled } =
        args as unknown as ScheduleTaskArgs;

      try {
        // Validate template exists
        if (!db.templateExists(template_id)) {
          return Promise.resolve(
            createErrorResponse('template_not_found', `Template '${template_id}' not found`)
          );
        }

        // Check task name uniqueness
        if (db.getTaskByName(name)) {
          return Promise.resolve(
            createErrorResponse('task_exists', `Task with name '${name}' already exists`)
          );
        }

        // Parse and validate schedule
        const parsedSchedule = parseScheduleInput(schedule);
        if (!parsedSchedule) {
          return Promise.resolve(
            createErrorResponse('invalid_schedule', 'Invalid schedule configuration')
          );
        }

        const validation = Scheduler.validateSchedule(parsedSchedule.type, parsedSchedule.value);
        if (!validation.valid) {
          return Promise.resolve(
            createErrorResponse('invalid_schedule', validation.error ?? 'Invalid schedule')
          );
        }

        // Calculate initial next run time
        const isEnabled = enabled ?? true;
        const nextRunAt = isEnabled
          ? Scheduler.calculateNextRunISO(parsedSchedule.type, parsedSchedule.value)
          : null;

        // Create the task
        const task = db.createTask({
          templateId: template_id,
          name,
          description: description ?? null,
          params: params ?? {},
          scheduleType: parsedSchedule.type,
          scheduleValue: parsedSchedule.value,
          credentials: credentials ?? [],
          enabled: isEnabled,
          nextRunAt,
        });

        // Register with scheduler if enabled
        if (task.enabled) {
          scheduler.registerTask(task);
        }

        return Promise.resolve(
          createSuccessResponse({
            success: true,
            task: {
              id: task.id,
              name: task.name,
              template_id: task.templateId,
              next_run: task.nextRunAt,
            },
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to schedule task';
        return Promise.resolve(createErrorResponse('schedule_task_error', message));
      }
    },
  });

  // list_tasks tool
  server.registerTool({
    tool: {
      name: 'list_tasks',
      description: 'List all tasks with their status.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Filter by enabled status',
          },
          has_errors: {
            type: 'boolean',
            description: 'Only show tasks with recent errors',
          },
          template_id: {
            type: 'string',
            description: 'Filter by template ID',
          },
        },
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { enabled, has_errors, template_id } = args as unknown as ListTasksArgs;

      try {
        const filters: TaskFilters = {};
        if (enabled !== undefined) filters.enabled = enabled;
        if (has_errors) filters.hasErrors = true;
        if (template_id) filters.templateId = template_id;

        const tasks = db.getTasks(filters);

        // Transform to response format
        const response = {
          tasks: tasks.map((t) => {
            // Get last execution for this task
            const recentExecs = db.getExecutions({ taskId: t.id, limit: 1 });
            const lastExec = recentExecs.executions[0];

            return {
              id: t.id,
              name: t.name,
              description: t.description,
              template_id: t.templateId,
              schedule: {
                type: t.scheduleType,
                value: t.scheduleValue,
              },
              enabled: t.enabled,
              last_run: lastExec
                ? {
                    at: lastExec.startedAt,
                    status: lastExec.status,
                    duration_ms: lastExec.durationMs,
                  }
                : null,
              next_run: t.nextRunAt,
            };
          }),
          total: tasks.length,
        };

        return Promise.resolve(createSuccessResponse(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list tasks';
        return Promise.resolve(createErrorResponse('list_tasks_error', message));
      }
    },
  });

  // get_task tool
  server.registerTool({
    tool: {
      name: 'get_task',
      description: 'Get detailed information about a specific task.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Task name',
          },
          recent_executions: {
            type: 'number',
            description: 'Number of recent executions to include (default: 5)',
          },
        },
        required: ['name'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { name, recent_executions } = args as unknown as GetTaskArgs;

      try {
        const task = db.getTaskByName(name);
        if (!task) {
          return Promise.resolve(createErrorResponse('task_not_found', `Task '${name}' not found`));
        }

        // Get template info
        const template = db.getTemplate(task.templateId);

        // Get recent executions
        const limit = recent_executions ?? 5;
        const recentExecs = db.getExecutions({ taskId: task.id, limit });

        const response = {
          task: {
            id: task.id,
            name: task.name,
            description: task.description,
            template_id: task.templateId,
            template_name: template?.name ?? null,
            params: task.params,
            schedule: {
              type: task.scheduleType,
              value: task.scheduleValue,
            },
            credentials: task.credentials,
            enabled: task.enabled,
            created_at: task.createdAt,
            updated_at: task.updatedAt,
            last_run_at: task.lastRunAt,
            next_run_at: task.nextRunAt,
            recent_executions: recentExecs.executions.map((e) => ({
              id: e.id,
              started_at: e.startedAt,
              status: e.status,
              duration_ms: e.durationMs,
            })),
          },
        };

        return Promise.resolve(createSuccessResponse(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get task';
        return Promise.resolve(createErrorResponse('get_task_error', message));
      }
    },
  });

  // update_task tool
  server.registerTool({
    tool: {
      name: 'update_task',
      description:
        'Modify an existing task. Only provided fields are updated. The template cannot be changed.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Task name to update',
          },
          new_name: {
            type: 'string',
            description: 'Rename the task',
          },
          description: {
            type: 'string',
            description: 'New description',
          },
          params: {
            type: 'object',
            description: 'Updated template parameters',
          },
          schedule: {
            type: 'object',
            description: 'New schedule',
            properties: {
              type: {
                type: 'string',
                enum: ['cron', 'once', 'interval'],
              },
              expression: { type: 'string' },
              datetime: { type: 'string' },
              minutes: { type: 'number' },
            },
            required: ['type'],
          },
          credentials: {
            type: 'array',
            items: { type: 'string' },
            description: 'New credential list',
          },
          enabled: {
            type: 'boolean',
            description: 'Enable/disable',
          },
        },
        required: ['name'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { name, new_name, description, params, schedule, credentials, enabled } =
        args as unknown as UpdateTaskArgs;

      try {
        const task = db.getTaskByName(name);
        if (!task) {
          return Promise.resolve(createErrorResponse('task_not_found', `Task '${name}' not found`));
        }

        // Check new name uniqueness
        if (new_name && new_name !== name && db.getTaskByName(new_name)) {
          return Promise.resolve(
            createErrorResponse('task_exists', `Task with name '${new_name}' already exists`)
          );
        }

        // Build updates object
        const updates: Parameters<typeof db.updateTask>[1] = {};
        if (new_name !== undefined) updates.name = new_name;
        if (description !== undefined) updates.description = description;
        if (params !== undefined) updates.params = params;
        if (credentials !== undefined) updates.credentials = credentials;
        if (enabled !== undefined) updates.enabled = enabled;

        // Handle schedule update
        let scheduleChanged = false;
        if (schedule) {
          const parsedSchedule = parseScheduleInput(schedule);
          if (!parsedSchedule) {
            return Promise.resolve(
              createErrorResponse('invalid_schedule', 'Invalid schedule configuration')
            );
          }

          const validation = Scheduler.validateSchedule(parsedSchedule.type, parsedSchedule.value);
          if (!validation.valid) {
            return Promise.resolve(
              createErrorResponse('invalid_schedule', validation.error ?? 'Invalid schedule')
            );
          }

          updates.scheduleType = parsedSchedule.type;
          updates.scheduleValue = parsedSchedule.value;
          scheduleChanged = true;
        }

        // Recalculate next run time if schedule or enabled status changed
        const newEnabled = enabled ?? task.enabled;
        const enabledChanged = enabled !== undefined && enabled !== task.enabled;

        if (scheduleChanged || enabledChanged) {
          const scheduleType = updates.scheduleType ?? task.scheduleType;
          const scheduleValue = updates.scheduleValue ?? task.scheduleValue;
          updates.nextRunAt = newEnabled
            ? Scheduler.calculateNextRunISO(scheduleType, scheduleValue)
            : null;
        }

        // Update the task
        const updatedTask = db.updateTask(task.id, updates);
        if (!updatedTask) {
          return Promise.resolve(createErrorResponse('update_task_error', 'Failed to update task'));
        }

        // Update scheduler
        if (scheduleChanged || enabledChanged) {
          scheduler.updateTaskSchedule(task.id);
        }

        return Promise.resolve(
          createSuccessResponse({
            success: true,
            task: {
              id: updatedTask.id,
              name: updatedTask.name,
              next_run: updatedTask.nextRunAt,
            },
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update task';
        return Promise.resolve(createErrorResponse('update_task_error', message));
      }
    },
  });

  // delete_task tool
  server.registerTool({
    tool: {
      name: 'delete_task',
      description: 'Remove a task and its execution history.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Task name to delete',
          },
        },
        required: ['name'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { name } = args as unknown as DeleteTaskArgs;

      try {
        const task = db.getTaskByName(name);
        if (!task) {
          return Promise.resolve(createErrorResponse('task_not_found', `Task '${name}' not found`));
        }

        // Count executions that will be removed
        const executions = db.getExecutions({ taskId: task.id });
        const executionsRemoved = executions.total;

        // Unregister from scheduler
        scheduler.unregisterTask(task.id);

        // Delete the task (cascades to executions)
        db.deleteTask(task.id);

        return Promise.resolve(
          createSuccessResponse({
            success: true,
            deleted: {
              name: task.name,
              executions_removed: executionsRemoved,
            },
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete task';
        return Promise.resolve(createErrorResponse('delete_task_error', message));
      }
    },
  });

  // toggle_task tool
  server.registerTool({
    tool: {
      name: 'toggle_task',
      description: 'Enable or disable a task.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Task name',
          },
          enabled: {
            type: 'boolean',
            description: 'New enabled state',
          },
        },
        required: ['name', 'enabled'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { name, enabled } = args as unknown as ToggleTaskArgs;

      try {
        const task = db.getTaskByName(name);
        if (!task) {
          return Promise.resolve(createErrorResponse('task_not_found', `Task '${name}' not found`));
        }

        // Update enabled status
        const nextRunAt = enabled
          ? Scheduler.calculateNextRunISO(task.scheduleType, task.scheduleValue)
          : null;

        db.updateTask(task.id, { enabled, nextRunAt });

        // Update scheduler
        scheduler.updateTaskSchedule(task.id);

        return Promise.resolve(
          createSuccessResponse({
            success: true,
            task: {
              name: task.name,
              enabled,
              next_run: nextRunAt,
            },
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to toggle task';
        return Promise.resolve(createErrorResponse('toggle_task_error', message));
      }
    },
  });
}
