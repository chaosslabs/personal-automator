/**
 * MCP Server Core
 *
 * Implements the Model Context Protocol server for Personal Automator.
 * Uses stdio transport for communication with MCP clients like Claude Desktop.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolResult,
  type TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import type { DatabaseService } from '../database/index.js';
import type { VaultService } from '../vault/index.js';
import type { TaskExecutor } from '../executor/index.js';
import type { Scheduler } from '../scheduler/index.js';

/**
 * Tool handler function type
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

/**
 * Tool definition with handler
 */
export interface ToolDefinition {
  tool: Tool;
  handler: ToolHandler;
}

/**
 * Services available to MCP tool handlers
 */
export interface MCPServices {
  db: DatabaseService;
  vault: VaultService;
  executor: TaskExecutor;
  scheduler: Scheduler;
}

/**
 * MCP Server for Personal Automator
 *
 * Exposes automation capabilities through the Model Context Protocol.
 */
export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private tools: Map<string, ToolDefinition> = new Map();
  private services: MCPServices;
  private isRunning = false;
  private startTime: Date | null = null;

  constructor(services: MCPServices) {
    this.services = services;
    this.server = new Server(
      {
        name: 'personal-automator',
        version: process.env['npm_package_version'] ?? '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // Handle ListTools request
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      const tools = Array.from(this.tools.values()).map((td) => td.tool);
      return Promise.resolve({ tools });
    });

    // Handle CallTool request
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const toolDef = this.tools.get(name);
      if (!toolDef) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'tool_not_found',
                message: `Tool '${name}' not found`,
              }),
            } as TextContent,
          ],
          isError: true,
        };
      }

      try {
        const result = await toolDef.handler(args ?? {});
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'execution_error',
                message,
              }),
            } as TextContent,
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Register a tool with the MCP server
   */
  registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.tool.name, definition);
  }

  /**
   * Get the services available to tool handlers
   */
  getServices(): MCPServices {
    return this.services;
  }

  /**
   * Get server uptime in seconds
   */
  getUptimeSeconds(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Check if server is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);

    this.isRunning = true;
    this.startTime = new Date();

    // Log to stderr since stdout is used for MCP communication
    console.error('[MCP] Personal Automator MCP server started');
    console.error(`[MCP] Registered ${this.tools.size} tools`);
  }

  /**
   * Stop the MCP server gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.error('[MCP] Shutting down MCP server...');

    await this.server.close();
    this.transport = null;
    this.isRunning = false;

    console.error('[MCP] MCP server stopped');
  }
}

/**
 * Helper to create a successful tool response
 */
export function createSuccessResponse(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      } as TextContent,
    ],
  };
}

/**
 * Helper to create an error tool response
 */
export function createErrorResponse(
  error: string,
  message: string,
  isError = true
): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: false,
          error,
          message,
        }),
      } as TextContent,
    ],
    isError,
  };
}
