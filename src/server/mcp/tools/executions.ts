/**
 * MCP Execution Tools
 *
 * Provides tools for executing tasks and viewing execution history.
 */

import type { MCPServer } from '../index.js';
import { createSuccessResponse, createErrorResponse } from '../index.js';
import type { ExecutionFilters, ExecutionStatus } from '../../../shared/types.js';

/**
 * Execute task request arguments
 */
interface ExecuteTaskArgs {
  name: string;
  wait?: boolean;
}

/**
 * Get executions request arguments
 */
interface GetExecutionsArgs {
  task_name?: string;
  status?: ExecutionStatus;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get execution request arguments
 */
interface GetExecutionArgs {
  id: number;
}

/**
 * Register execution tools with the MCP server
 */
export function registerExecutionTools(server: MCPServer): void {
  const { db, executor } = server.getServices();

  // execute_task tool
  server.registerTool({
    tool: {
      name: 'execute_task',
      description: 'Trigger immediate execution of a task.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Task name to execute',
          },
          wait: {
            type: 'boolean',
            description: 'Wait for completion (default: true). If false, returns immediately.',
          },
        },
        required: ['name'],
      },
    },
    handler: async (args: Record<string, unknown>) => {
      const { name, wait } = args as unknown as ExecuteTaskArgs;

      try {
        const task = db.getTaskByName(name);
        if (!task) {
          return createErrorResponse('task_not_found', `Task '${name}' not found`);
        }

        const shouldWait = wait ?? true;

        if (shouldWait) {
          // Execute and wait for completion
          const result = await executor.execute(task.id);

          return createSuccessResponse({
            execution: {
              id: result.execution.id,
              task_name: name,
              started_at: result.execution.startedAt,
              finished_at: result.execution.finishedAt,
              status: result.execution.status,
              duration_ms: result.execution.durationMs,
              output: result.success
                ? {
                    console: result.output?.console ?? [],
                    return_value: result.output?.result ?? null,
                  }
                : null,
              error: result.error ?? null,
            },
          });
        } else {
          // Start execution but don't wait
          // Create execution record first
          const executionId = db.createExecution(task.id);

          // Start execution in background (fire and forget)
          executor.execute(task.id).catch((error: unknown) => {
            console.error(`Background execution of task ${name} failed:`, error);
          });

          return createSuccessResponse({
            execution: {
              id: executionId,
              task_name: name,
              started_at: new Date().toISOString(),
              status: 'running',
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to execute task';
        return createErrorResponse('execution_error', message);
      }
    },
  });

  // get_executions tool
  server.registerTool({
    tool: {
      name: 'get_executions',
      description: 'Retrieve execution history.',
      inputSchema: {
        type: 'object',
        properties: {
          task_name: {
            type: 'string',
            description: 'Filter by task name',
          },
          status: {
            type: 'string',
            enum: ['success', 'failed', 'timeout', 'running'],
            description: 'Filter by execution status',
          },
          since: {
            type: 'string',
            description: 'ISO datetime, executions after this time',
          },
          until: {
            type: 'string',
            description: 'ISO datetime, executions before this time',
          },
          limit: {
            type: 'number',
            description: 'Max results (default: 50, max: 500)',
          },
          offset: {
            type: 'number',
            description: 'Pagination offset',
          },
        },
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { task_name, status, since, until, limit, offset } =
        args as unknown as GetExecutionsArgs;

      try {
        const filters: ExecutionFilters = {
          limit: Math.min(limit ?? 50, 500),
          offset: offset ?? 0,
        };

        // Convert task name to task ID
        if (task_name) {
          const task = db.getTaskByName(task_name);
          if (!task) {
            return Promise.resolve(
              createErrorResponse('task_not_found', `Task '${task_name}' not found`)
            );
          }
          filters.taskId = task.id;
        }

        if (status) filters.status = status;
        if (since) filters.startDate = since;
        if (until) filters.endDate = until;

        const result = db.getExecutions(filters);

        // Enrich with task names
        const executions = result.executions.map((e) => {
          const task = db.getTask(e.taskId);
          return {
            id: e.id,
            task_name: task?.name ?? 'unknown',
            started_at: e.startedAt,
            finished_at: e.finishedAt,
            status: e.status,
            duration_ms: e.durationMs,
          };
        });

        return Promise.resolve(
          createSuccessResponse({
            executions,
            total: result.total,
            has_more: result.total > (filters.offset ?? 0) + executions.length,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get executions';
        return Promise.resolve(createErrorResponse('get_executions_error', message));
      }
    },
  });

  // get_execution tool
  server.registerTool({
    tool: {
      name: 'get_execution',
      description: 'Get detailed information about a specific execution.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Execution ID',
          },
        },
        required: ['id'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { id } = args as unknown as GetExecutionArgs;

      try {
        const execution = db.getExecution(id);
        if (!execution) {
          return Promise.resolve(
            createErrorResponse('execution_not_found', `Execution ${id} not found`)
          );
        }

        // Get task info
        const task = db.getTask(execution.taskId);

        // Parse output if it exists
        let output = null;
        if (execution.output) {
          output = {
            console: execution.output.console ?? [],
            return_value: execution.output.result ?? null,
          };
        }

        return Promise.resolve(
          createSuccessResponse({
            execution: {
              id: execution.id,
              task_name: task?.name ?? 'unknown',
              task_id: execution.taskId,
              started_at: execution.startedAt,
              finished_at: execution.finishedAt,
              status: execution.status,
              duration_ms: execution.durationMs,
              output,
              error: execution.error,
            },
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get execution';
        return Promise.resolve(createErrorResponse('get_execution_error', message));
      }
    },
  });
}
