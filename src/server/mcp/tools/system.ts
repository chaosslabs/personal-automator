/**
 * MCP System Tools
 *
 * Provides tools for system status and health checks.
 */

import type { MCPServer } from '../index.js';
import { createSuccessResponse, createErrorResponse } from '../index.js';

/**
 * Register system tools with the MCP server
 */
export function registerSystemTools(server: MCPServer): void {
  const services = server.getServices();
  const { db, scheduler } = services;

  // get_status tool
  server.registerTool({
    tool: {
      name: 'get_status',
      description: 'Get system health and status information.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: () => {
      try {
        // Get database stats
        const stats = db.getStats();

        // Get scheduler info
        const schedulerStatus = scheduler.isRunning() ? 'running' : 'stopped';
        const activeJobs = scheduler.getJobCount();

        // Get all enabled tasks to find next execution
        const enabledTasks = db.getTasks({ enabled: true });
        let nextExecution: string | null = null;

        for (const task of enabledTasks) {
          if (task.nextRunAt) {
            if (!nextExecution || task.nextRunAt < nextExecution) {
              nextExecution = task.nextRunAt;
            }
          }
        }

        // Get recent executions (last 24 hours)
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
        const totalCompleted = successCount + failedCount;
        const successRate = totalCompleted > 0 ? successCount / totalCompleted : 1;

        // Get credentials count
        const credentials = db.credentials.getAllWithValueStatus();

        // Get database file size (approximate from execution count * avg size)
        // This is a rough estimate since we can't easily get file size in a portable way
        const estimatedDbSize = stats.executionsCount * 500 + stats.tasksCount * 200;

        const response = {
          status: 'healthy',
          version: process.env['npm_package_version'] ?? '0.1.0',
          uptime_seconds: server.getUptimeSeconds(),
          scheduler: {
            status: schedulerStatus,
            active_jobs: activeJobs,
            next_execution: nextExecution,
          },
          database: {
            connected: db.isConnected(),
            tasks_count: stats.tasksCount,
            enabled_tasks_count: stats.enabledTasksCount,
            executions_count: stats.executionsCount,
            credentials_count: credentials.length,
            templates_count: db.getTemplates().length,
            size_bytes: estimatedDbSize,
          },
          recent_activity: {
            executions_24h: recentExecs.total,
            success_rate: Math.round(successRate * 100) / 100,
            failed_count: failedCount,
            pending_count: stats.pendingExecutions,
            recent_errors: stats.recentErrors,
          },
        };

        return Promise.resolve(createSuccessResponse(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get status';
        return Promise.resolve(createErrorResponse('get_status_error', message));
      }
    },
  });
}
