# MCP API Reference

Complete specification of all MCP tools exposed by Personal Automator.

## Overview

Personal Automator implements the Model Context Protocol (MCP) to expose task automation capabilities. The server uses **stdio transport** for local integration with MCP clients like Claude Desktop.

**Important**: Tasks can only be created from predefined templates. The MCP API does not accept arbitrary code—templates must be created through the desktop UI.

## Connection

### Claude Desktop Configuration

Add to `~/.config/claude/claude_desktop_config.json` (Linux/macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "personal-automator": {
      "command": "node",
      "args": ["/path/to/personal-automator/dist/mcp-server.js"]
    }
  }
}
```

### Programmatic Connection

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/path/to/personal-automator/dist/mcp-server.js"],
});

const client = new Client({ name: "my-client", version: "1.0.0" }, {});
await client.connect(transport);
```

---

## Tools

### Templates

#### `list_templates`

List all available task templates.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Filter by category |

**Response:**

```json
{
  "templates": [
    {
      "id": "http-health-check",
      "name": "HTTP Health Check",
      "description": "Monitor a URL and report status",
      "category": "monitoring",
      "params": [
        { "name": "url", "type": "string", "required": true, "description": "URL to check" },
        { "name": "expected_status", "type": "number", "required": false, "default": 200 }
      ],
      "required_credentials": [],
      "suggested_schedule": "*/5 * * * *"
    },
    {
      "id": "github-pr",
      "name": "GitHub Pull Request",
      "description": "Create a pull request on GitHub",
      "category": "github",
      "params": [
        { "name": "repo", "type": "string", "required": true },
        { "name": "base", "type": "string", "required": true },
        { "name": "head", "type": "string", "required": true },
        { "name": "title", "type": "string", "required": true },
        { "name": "body", "type": "string", "required": false }
      ],
      "required_credentials": ["GITHUB_TOKEN"]
    }
  ],
  "total": 2
}
```

---

### Task Management

#### `schedule_task`

Create a new scheduled task from a template.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `template_id` | string | Yes | Template to use (from `list_templates`) |
| `name` | string | Yes | Unique task identifier |
| `description` | string | No | Human-readable description |
| `params` | object | Yes | Template parameters |
| `schedule` | object | Yes | When to run the task |
| `credentials` | string[] | No | Additional credentials beyond template requirements |
| `enabled` | boolean | No | Start enabled (default: true) |

**Schedule Object:**

```typescript
// Cron schedule (recurring)
{ "type": "cron", "expression": "0 9 * * 1-5" }

// One-time schedule
{ "type": "once", "datetime": "2024-12-25T09:00:00Z" }

// Interval schedule
{ "type": "interval", "minutes": 30 }
```

**Example:**

```json
{
  "template_id": "http-health-check",
  "name": "api-health-check",
  "description": "Check API health every 5 minutes",
  "params": {
    "url": "https://api.example.com/health",
    "expected_status": 200
  },
  "schedule": { "type": "cron", "expression": "*/5 * * * *" }
}
```

**Response:**

```json
{
  "success": true,
  "task": {
    "id": 1,
    "name": "api-health-check",
    "template_id": "http-health-check",
    "next_run": "2024-01-15T10:05:00Z"
  }
}
```

---

#### `list_tasks`

List all tasks with their status.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `enabled` | boolean | No | Filter by enabled status |
| `has_errors` | boolean | No | Only tasks with recent errors |

**Response:**

```json
{
  "tasks": [
    {
      "id": 1,
      "name": "health-check",
      "description": "Check API health every 5 minutes",
      "schedule": { "type": "cron", "expression": "*/5 * * * *" },
      "enabled": true,
      "last_run": {
        "at": "2024-01-15T10:00:00Z",
        "status": "success",
        "duration_ms": 245
      },
      "next_run": "2024-01-15T10:05:00Z"
    }
  ],
  "total": 1
}
```

---

#### `get_task`

Get detailed information about a specific task.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Task name |
| `recent_executions` | number | No | Number of recent executions to include (default: 5) |

**Response:**

```json
{
  "task": {
    "id": 1,
    "name": "api-health-check",
    "description": "Check API health every 5 minutes",
    "template_id": "http-health-check",
    "template_name": "HTTP Health Check",
    "params": {
      "url": "https://api.example.com/health",
      "expected_status": 200
    },
    "schedule": { "type": "cron", "expression": "*/5 * * * *" },
    "credentials": [],
    "enabled": true,
    "created_at": "2024-01-10T12:00:00Z",
    "updated_at": "2024-01-10T12:00:00Z",
    "last_run_at": "2024-01-15T10:00:00Z",
    "next_run_at": "2024-01-15T10:05:00Z",
    "recent_executions": [
      {
        "id": 100,
        "started_at": "2024-01-15T10:00:00Z",
        "status": "success",
        "duration_ms": 245
      }
    ]
  }
}
```

---

#### `update_task`

Modify an existing task. Only provided fields are updated.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Task name to update |
| `new_name` | string | No | Rename the task |
| `description` | string | No | New description |
| `params` | object | No | Updated template parameters |
| `schedule` | object | No | New schedule |
| `credentials` | string[] | No | New credential list |
| `enabled` | boolean | No | Enable/disable |

**Note**: The template cannot be changed after task creation. To use a different template, delete and recreate the task.

**Response:**

```json
{
  "success": true,
  "task": {
    "id": 1,
    "name": "api-health-check",
    "next_run": "2024-01-15T10:05:00Z"
  }
}
```

---

#### `delete_task`

Remove a task and its execution history.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Task name to delete |

**Response:**

```json
{
  "success": true,
  "deleted": {
    "name": "health-check",
    "executions_removed": 150
  }
}
```

---

#### `toggle_task`

Enable or disable a task.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Task name |
| `enabled` | boolean | Yes | New enabled state |

**Response:**

```json
{
  "success": true,
  "task": {
    "name": "health-check",
    "enabled": false,
    "next_run": null
  }
}
```

---

### Execution

#### `execute_task`

Trigger immediate execution of a task.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Task name to execute |
| `wait` | boolean | No | Wait for completion (default: true) |

**Response (wait: true):**

```json
{
  "execution": {
    "id": 101,
    "task_name": "health-check",
    "started_at": "2024-01-15T10:07:23Z",
    "finished_at": "2024-01-15T10:07:23Z",
    "status": "success",
    "duration_ms": 312,
    "output": {
      "console": ["Status: 200"],
      "return_value": { "status": 200 }
    }
  }
}
```

**Response (wait: false):**

```json
{
  "execution": {
    "id": 101,
    "task_name": "health-check",
    "started_at": "2024-01-15T10:07:23Z",
    "status": "running"
  }
}
```

---

#### `get_executions`

Retrieve execution history.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_name` | string | No | Filter by task |
| `status` | string | No | Filter: "success", "failed", "timeout" |
| `since` | string | No | ISO datetime, executions after this time |
| `until` | string | No | ISO datetime, executions before this time |
| `limit` | number | No | Max results (default: 50, max: 500) |
| `offset` | number | No | Pagination offset |

**Response:**

```json
{
  "executions": [
    {
      "id": 101,
      "task_name": "health-check",
      "started_at": "2024-01-15T10:07:23Z",
      "finished_at": "2024-01-15T10:07:23Z",
      "status": "success",
      "duration_ms": 312
    }
  ],
  "total": 150,
  "has_more": true
}
```

---

#### `get_execution`

Get detailed information about a specific execution.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | number | Yes | Execution ID |

**Response:**

```json
{
  "execution": {
    "id": 101,
    "task_name": "health-check",
    "task_id": 1,
    "started_at": "2024-01-15T10:07:23Z",
    "finished_at": "2024-01-15T10:07:23Z",
    "status": "success",
    "duration_ms": 312,
    "output": {
      "console": [
        "[10:07:23.100] Status: 200",
        "[10:07:23.105] Response time: 89ms"
      ],
      "return_value": { "status": 200 }
    },
    "error": null
  }
}
```

---

### Credentials

#### `add_credential`

Store a new credential securely.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Unique credential name |
| `value` | string | Yes | Secret value (encrypted at rest) |
| `type` | string | No | Type: "api_key", "oauth_token", "env_var", "secret" |
| `description` | string | No | Human-readable description |

**Example:**

```json
{
  "name": "GITHUB_TOKEN",
  "value": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "type": "api_key",
  "description": "GitHub personal access token for repo operations"
}
```

**Response:**

```json
{
  "success": true,
  "credential": {
    "name": "GITHUB_TOKEN",
    "type": "api_key",
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

---

#### `list_credentials`

List all stored credentials (values are never returned).

**Parameters:** None

**Response:**

```json
{
  "credentials": [
    {
      "name": "GITHUB_TOKEN",
      "type": "api_key",
      "description": "GitHub personal access token for repo operations",
      "created_at": "2024-01-15T10:00:00Z",
      "last_used_at": "2024-01-15T12:00:00Z",
      "used_by_tasks": ["deploy-bot", "pr-creator"]
    },
    {
      "name": "SLACK_WEBHOOK",
      "type": "env_var",
      "description": "Slack incoming webhook URL",
      "created_at": "2024-01-10T08:00:00Z",
      "last_used_at": "2024-01-15T09:00:00Z",
      "used_by_tasks": ["daily-report"]
    }
  ],
  "total": 2
}
```

---

#### `update_credential`

Update an existing credential.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Credential name to update |
| `new_name` | string | No | Rename the credential |
| `value` | string | No | New secret value |
| `type` | string | No | New type |
| `description` | string | No | New description |

**Response:**

```json
{
  "success": true,
  "credential": {
    "name": "GITHUB_TOKEN",
    "updated_at": "2024-01-15T14:00:00Z"
  }
}
```

---

#### `delete_credential`

Remove a credential from the vault.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Credential name to delete |
| `force` | boolean | No | Delete even if used by tasks (default: false) |

**Response (credential in use, force: false):**

```json
{
  "success": false,
  "error": "credential_in_use",
  "message": "Credential 'GITHUB_TOKEN' is used by 2 tasks: deploy-bot, pr-creator. Use force=true to delete anyway."
}
```

**Response (success):**

```json
{
  "success": true,
  "deleted": {
    "name": "GITHUB_TOKEN"
  }
}
```

---

### System

#### `get_status`

Get system health and status information.

**Parameters:** None

**Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "scheduler": {
    "active_jobs": 5,
    "next_execution": "2024-01-15T10:05:00Z"
  },
  "database": {
    "tasks_count": 10,
    "executions_count": 1500,
    "credentials_count": 5,
    "size_bytes": 1048576
  },
  "recent_activity": {
    "executions_24h": 288,
    "success_rate": 0.98,
    "failed_count": 6
  }
}
```

---

## Error Handling

All tools follow a consistent error response format:

```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable error description"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `template_not_found` | Template with specified ID doesn't exist |
| `invalid_params` | Template parameters missing or invalid |
| `task_not_found` | Task with specified name doesn't exist |
| `task_exists` | Task with specified name already exists |
| `invalid_schedule` | Invalid cron expression or datetime |
| `credential_not_found` | Referenced credential doesn't exist |
| `credential_exists` | Credential with specified name already exists |
| `credential_in_use` | Credential is used by tasks (delete with force) |
| `execution_not_found` | Execution ID doesn't exist |
| `execution_timeout` | Task execution exceeded timeout |
| `execution_error` | Task threw an error |
| `validation_error` | Input validation failed |

---

## Rate Limits

Personal Automator does not impose rate limits—it runs locally on your machine. However, be mindful of:

- Task execution timeouts (default: 5 minutes)
- Database size (execution logs can grow large)
- External API rate limits from services your tasks call

---

## Credential Injection

When tasks run, credentials specified by the template (plus any additional credentials assigned to the task) are available via the `credentials` object within the template code:

```javascript
// Example template code (authored via UI)
const response = await fetch(params.url, {
  headers: {
    'Authorization': `Bearer ${credentials.API_TOKEN}`
  }
});
```

Credentials are:
- Decrypted only at execution time
- Available only to templates/tasks that list them
- Never logged or returned in API responses
