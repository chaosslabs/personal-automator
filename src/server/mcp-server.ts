#!/usr/bin/env node
/**
 * Personal Automator MCP Server Entry Point
 *
 * This is the main entry point for the MCP server that communicates
 * with Claude Desktop and other MCP clients via stdio.
 *
 * Usage:
 *   node dist/server/mcp-server.js
 *
 * Claude Desktop configuration (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "personal-automator": {
 *         "command": "node",
 *         "args": ["/path/to/personal-automator/dist/server/mcp-server.js"]
 *       }
 *     }
 *   }
 */

import { getDatabase, closeDatabase } from './database/index.js';
import { getVault, closeVault } from './vault/index.js';
import { getExecutor, closeExecutor } from './executor/index.js';
import { getScheduler, closeScheduler } from './scheduler/index.js';
import { MCPServer } from './mcp/index.js';

// Global MCP server instance
let mcpServer: MCPServer | null = null;

/**
 * Initialize and start the MCP server
 */
async function main(): Promise<void> {
  // Log to stderr since stdout is reserved for MCP protocol
  console.error('[MCP] Initializing Personal Automator MCP server...');

  try {
    // Initialize services
    const db = getDatabase();
    console.error('[MCP] Database initialized');

    const vault = getVault();
    console.error('[MCP] Vault initialized');

    const executor = getExecutor(db, vault);
    console.error('[MCP] Executor initialized');

    const scheduler = getScheduler(db, executor);
    scheduler.start();
    console.error('[MCP] Scheduler initialized and started');

    // Create and start MCP server
    mcpServer = new MCPServer({
      db,
      vault,
      executor,
      scheduler,
    });

    // Note: Tools will be registered by tool modules in future commits
    // For now, the server starts with no tools registered

    await mcpServer.start();
  } catch (error) {
    console.error('[MCP] Failed to start MCP server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(): Promise<void> {
  console.error('[MCP] Received shutdown signal...');

  try {
    if (mcpServer) {
      await mcpServer.stop();
    }

    closeScheduler();
    console.error('[MCP] Scheduler closed');

    closeExecutor();
    console.error('[MCP] Executor closed');

    closeVault();
    console.error('[MCP] Vault closed');

    closeDatabase();
    console.error('[MCP] Database closed');

    console.error('[MCP] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[MCP] Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => {
  shutdown().catch(console.error);
});
process.on('SIGINT', () => {
  shutdown().catch(console.error);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[MCP] Uncaught exception:', error);
  shutdown().catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[MCP] Unhandled rejection:', reason);
  shutdown().catch(() => process.exit(1));
});

// Start the server
main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
