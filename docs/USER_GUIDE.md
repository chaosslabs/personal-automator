# User Guide

## Getting Started

Personal Automator is a local-first task automation engine. All data stays on your machine.

### Installation

#### From npm

```bash
npm install -g io.chaosslabs.personal-automator
personal-automator
```

#### From source

```bash
git clone https://github.com/chaosslabs/personal-automator.git
cd personal-automator
npm install
npm run build
npm start
```

#### Using Docker

```bash
docker run -d \
  --name personal-automator \
  -p 3000:3000 \
  -v automator-data:/data \
  personal-automator
```

### Accessing the UI

Open your browser to `http://localhost:3000`. The sidebar provides navigation between:

- **Tasks** - View and manage scheduled tasks
- **Templates** - Create and edit automation templates
- **Executions** - View execution history and logs
- **Credentials** - Manage API keys and secrets
- **Import/Export** - Backup and restore your configuration

---

## Templates

Templates define reusable automation logic written in JavaScript. They can accept parameters and use credentials.

### Built-in Templates

| Template | Category | Description |
|----------|----------|-------------|
| HTTP Health Check | Monitoring | Check URL availability and response status |
| Webhook Trigger | Automation | Send POST requests to webhook URLs |
| Slack Notification | Notifications | Send messages to Slack channels |
| Discord Notification | Notifications | Send messages to Discord channels |
| JSON API Request | Automation | Make authenticated HTTP API calls |
| Run Shell Command | Automation | Execute shell commands with output capture |
| Log Message | Custom | Simple message logging (for testing) |
| GitHub PR Creation | GitHub | Create pull requests via GitHub API |
| Database Backup | Data | Backup file-based databases with rotation |
| File Watcher | Monitoring | Detect recently modified files |

### Creating Custom Templates

1. Navigate to the **Templates** view
2. Click **Create Template**
3. Fill in the template details:
   - **ID**: Unique identifier (e.g., `my-custom-check`)
   - **Name**: Display name
   - **Category**: Organizational category
   - **Code**: JavaScript code to execute
4. Define **Parameters** that users must provide when creating tasks
5. List **Required Credentials** the template needs

### Template Code

Template code runs in a sandboxed environment with access to:

- `params` - Task parameters (configured per task)
- `credentials` - Decrypted credentials (injected at runtime)
- `console` - Logging (`console.log`, `console.error`, etc.)
- `fetch` - HTTP requests
- `require` - Whitelisted Node.js modules (`fs`, `path`, `child_process`, `crypto`, `http`, `https`, etc.)
- Standard JavaScript globals (`JSON`, `Date`, `Promise`, `Buffer`, `URL`, etc.)

Templates support `async`/`await`. The return value is captured as the execution result.

---

## Tasks

Tasks are instances of templates with specific parameters, schedule, and credentials.

### Creating a Task

1. Navigate to the **Tasks** view
2. Click **Create Task**
3. Select a template
4. Configure:
   - **Name**: Unique task name
   - **Parameters**: Fill in template-specific parameters
   - **Schedule**: Choose cron, one-time, or interval
   - **Credentials**: Assign required credentials
5. Click **Save**

### Schedule Types

| Type | Description | Example |
|------|-------------|---------|
| Cron | Standard cron expression | `*/5 * * * *` (every 5 minutes) |
| Once | Run at a specific date/time | `2025-01-15T10:00:00` |
| Interval | Repeat at fixed intervals | `30` (every 30 minutes) |

### Common Cron Expressions

| Expression | Description |
|------------|-------------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 */6 * * *` | Every 6 hours |
| `0 9 * * *` | Daily at 9:00 AM |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 0 * * 0` | Weekly on Sunday |
| `0 0 1 * *` | Monthly on the 1st |

### Task Actions

- **Run** - Execute the task immediately
- **Edit** - Modify parameters, schedule, or credentials
- **Enable/Disable** - Toggle task scheduling
- **Delete** - Remove task and its execution history

---

## Credentials

Credentials store sensitive values like API keys and tokens. Values are encrypted with AES-256-GCM.

### Adding Credentials

1. Navigate to the **Credentials** view
2. Click **Add Credential**
3. Enter:
   - **Name**: Uppercase identifier (e.g., `GITHUB_TOKEN`)
   - **Type**: API Key, OAuth Token, Environment Variable, or Secret
   - **Description**: What this credential is for
   - **Value**: The secret value (encrypted at rest)

### Security

- Credential values are **never returned** in API responses
- Values are encrypted using AES-256-GCM with PBKDF2-derived keys
- Only decrypted at the moment of task execution
- Cleared from memory after execution completes

---

## Execution History

The Executions view shows a log of all task runs with:

- **Status**: Success, Failed, Running, or Timeout
- **Duration**: How long the execution took
- **Console Output**: Captured `console.log` output with line numbers
- **Return Value**: The value returned by the template code
- **Error Details**: Error messages and stack traces for failures

### Filtering

Filter executions by:
- Task name
- Status (success, failed, running, timeout)
- Date range

### Exporting

Click **Export** to download the current filtered view as JSON.

---

## Import/Export

### Exporting Data

- **Export Tasks** - Download all tasks as JSON
- **Export Templates** - Download custom templates as JSON
- **Full Backup** - Download everything (tasks, templates, credential metadata)

### Importing Data

1. Click **Import from JSON**
2. Select a previously exported file
3. The system auto-detects the format and imports accordingly
4. Duplicate entries are automatically skipped

> **Note**: Credential values are not included in exports for security. After importing, you must re-enter credential values.

---

## MCP Integration

Personal Automator provides an MCP (Model Context Protocol) server for AI assistant integration.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_templates` | List available automation templates |
| `schedule_task` | Create a new scheduled task |
| `list_tasks` | List all tasks with status |
| `get_task` | Get task details |
| `update_task` | Modify an existing task |
| `delete_task` | Remove a task |
| `toggle_task` | Enable/disable a task |
| `execute_task` | Run a task immediately |
| `get_executions` | View execution history |
| `get_execution` | View execution details |
| `add_credential` | Store a new credential |
| `list_credentials` | List credential names |
| `delete_credential` | Remove a credential |
| `get_status` | System health check |

### MCP Client Configuration

See [MCP_SETUP.md](./MCP_SETUP.md) for detailed setup instructions.
