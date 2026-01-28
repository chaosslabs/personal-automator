# MCP Client Setup Guide

Personal Automator includes an MCP (Model Context Protocol) server that allows AI assistants to manage your automation tasks.

## Prerequisites

- Personal Automator installed and running
- An MCP-compatible client (Claude Desktop, etc.)

## Setup with Claude Desktop

Add the following to your Claude Desktop MCP configuration file:

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "personal-automator": {
      "command": "node",
      "args": ["/path/to/personal-automator/dist/server/mcp/index.js"],
      "env": {}
    }
  }
}
```

### Linux

Edit `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "personal-automator": {
      "command": "node",
      "args": ["/path/to/personal-automator/dist/server/mcp/index.js"],
      "env": {}
    }
  }
}
```

### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "personal-automator": {
      "command": "node",
      "args": ["C:\\path\\to\\personal-automator\\dist\\server\\mcp\\index.js"],
      "env": {}
    }
  }
}
```

## If installed globally via npm

```json
{
  "mcpServers": {
    "personal-automator": {
      "command": "npx",
      "args": ["io.chaosslabs.personal-automator", "--mcp"],
      "env": {}
    }
  }
}
```

## Verifying the Connection

After configuring, restart your MCP client. You should see the Personal Automator tools available. Try:

> "List my automation templates"

The assistant should use the `list_templates` tool and display the available templates.

## Available Tools

### Template Tools
- **list_templates** - List all available templates, optionally filtered by category

### Task Management
- **schedule_task** - Create a new task from a template with parameters, schedule, and credentials
- **list_tasks** - List all tasks with optional filters (enabled, has_errors, template_id)
- **get_task** - Get detailed info about a specific task
- **update_task** - Modify task parameters, schedule, or credentials
- **delete_task** - Delete a task and its execution history
- **toggle_task** - Enable or disable a task

### Execution
- **execute_task** - Run a task immediately and get results
- **get_executions** - View execution history with filters
- **get_execution** - Get detailed execution output and logs

### Credentials
- **add_credential** - Store a new encrypted credential
- **list_credentials** - List credential names and types (values never exposed)
- **delete_credential** - Remove a credential

### System
- **get_status** - Check system health, scheduler status, and statistics

## Example Conversations

### Creating a health check task

> "Create a health check that monitors https://example.com every 5 minutes"

The assistant will:
1. Use `list_templates` to find the HTTP Health Check template
2. Use `schedule_task` to create a task with the URL parameter and a `*/5 * * * *` cron schedule

### Checking execution results

> "Show me the last 5 execution results"

The assistant will use `get_executions` with a limit of 5.

### Managing credentials

> "Add my GitHub token as a credential"

The assistant will use `add_credential` with the provided token value.

## Troubleshooting

- **Tools not appearing**: Make sure the path to the MCP server is correct and the project is built (`npm run build`)
- **Connection errors**: Ensure no other process is using the same stdio transport
- **Permission errors**: The MCP server needs read/write access to `~/.personal-automator/`
