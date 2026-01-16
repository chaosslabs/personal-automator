/**
 * MCP Template Tools
 *
 * Provides tools for listing and inspecting task templates.
 */

import type { MCPServer } from '../index.js';
import { createSuccessResponse, createErrorResponse } from '../index.js';

/**
 * List templates request arguments
 */
interface ListTemplatesArgs {
  category?: string;
}

/**
 * Register template tools with the MCP server
 */
export function registerTemplateTools(server: MCPServer): void {
  const { db } = server.getServices();

  // list_templates tool
  server.registerTool({
    tool: {
      name: 'list_templates',
      description:
        'List all available task templates. Templates define reusable automation tasks that can be scheduled.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'Filter templates by category (e.g., "monitoring", "notifications", "utility")',
          },
        },
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { category } = args as ListTemplatesArgs;

      try {
        const templates = db.getTemplates(category);

        // Transform templates to MCP response format
        const response = {
          templates: templates.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            category: t.category,
            params: t.paramsSchema,
            required_credentials: t.requiredCredentials,
            suggested_schedule: t.suggestedSchedule,
            is_builtin: t.isBuiltin,
          })),
          total: templates.length,
        };

        return Promise.resolve(createSuccessResponse(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list templates';
        return Promise.resolve(createErrorResponse('list_templates_error', message));
      }
    },
  });
}
