import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor } from '../src/server/executor/index.js';
import { Scheduler } from '../src/server/scheduler/index.js';
import {
  MCPServer,
  createSuccessResponse,
  createErrorResponse,
  type ToolDefinition,
} from '../src/server/mcp/index.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-mcp');

describe('MCPServer', () => {
  let db: DatabaseService;
  let vault: VaultService;
  let executor: TaskExecutor;
  let scheduler: Scheduler;
  let mcpServer: MCPServer;

  beforeEach(() => {
    // Clean up test directory if it exists
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Initialize test services
    const dbPath = join(TEST_DIR, 'test.db');
    db = new DatabaseService(dbPath);
    db.initialize();

    vault = new VaultService(TEST_DIR);
    vault.initialize();

    executor = new TaskExecutor(db, vault);
    scheduler = new Scheduler(db, executor);

    // Create MCP server
    mcpServer = new MCPServer({
      db,
      vault,
      executor,
      scheduler,
    });
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

  describe('initialization', () => {
    it('should create MCPServer instance', () => {
      expect(mcpServer).toBeDefined();
      expect(mcpServer.getIsRunning()).toBe(false);
    });

    it('should provide access to services', () => {
      const services = mcpServer.getServices();
      expect(services.db).toBe(db);
      expect(services.vault).toBe(vault);
      expect(services.executor).toBe(executor);
      expect(services.scheduler).toBe(scheduler);
    });

    it('should report 0 uptime before starting', () => {
      expect(mcpServer.getUptimeSeconds()).toBe(0);
    });
  });

  describe('tool registration', () => {
    it('should register a tool', () => {
      const tool: ToolDefinition = {
        tool: {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
        handler: () => Promise.resolve(createSuccessResponse({ result: 'ok' })),
      };

      // Should not throw
      mcpServer.registerTool(tool);
    });

    it('should register multiple tools', () => {
      const tool1: ToolDefinition = {
        tool: {
          name: 'tool_one',
          description: 'First tool',
          inputSchema: { type: 'object', properties: {} },
        },
        handler: () => Promise.resolve(createSuccessResponse({ result: 'one' })),
      };

      const tool2: ToolDefinition = {
        tool: {
          name: 'tool_two',
          description: 'Second tool',
          inputSchema: { type: 'object', properties: {} },
        },
        handler: () => Promise.resolve(createSuccessResponse({ result: 'two' })),
      };

      mcpServer.registerTool(tool1);
      mcpServer.registerTool(tool2);
      // No assertion needed - just verifying no errors
    });
  });
});

describe('Response helpers', () => {
  describe('createSuccessResponse', () => {
    it('should create success response with data', () => {
      const data = { message: 'Hello', count: 42 };
      const response = createSuccessResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0]?.type).toBe('text');
      expect(response.isError).toBeUndefined();

      const textContent = response.content[0] as { type: 'text'; text: string };
      const parsed = JSON.parse(textContent.text) as typeof data;
      expect(parsed.message).toBe('Hello');
      expect(parsed.count).toBe(42);
    });

    it('should handle array data', () => {
      const data = [1, 2, 3];
      const response = createSuccessResponse(data);

      const textContent = response.content[0] as { type: 'text'; text: string };
      const parsed = JSON.parse(textContent.text) as number[];
      expect(parsed).toEqual([1, 2, 3]);
    });

    it('should handle null data', () => {
      const response = createSuccessResponse(null);

      const textContent = response.content[0] as { type: 'text'; text: string };
      expect(textContent.text).toBe('null');
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response', () => {
      const response = createErrorResponse('not_found', 'Item not found');

      expect(response.content).toHaveLength(1);
      expect(response.content[0]?.type).toBe('text');
      expect(response.isError).toBe(true);

      const textContent = response.content[0] as { type: 'text'; text: string };
      const parsed = JSON.parse(textContent.text) as {
        success: boolean;
        error: string;
        message: string;
      };
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('not_found');
      expect(parsed.message).toBe('Item not found');
    });

    it('should allow non-error response', () => {
      const response = createErrorResponse('warning', 'This is a warning', false);

      expect(response.isError).toBe(false);
    });
  });
});
