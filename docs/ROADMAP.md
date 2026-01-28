# Roadmap

Development roadmap for Personal Automator organized into phases with clear milestones.

## Phase 1: Foundation

**Goal**: Core infrastructure and basic task management

### 1.1 Project Setup
- [x] Initialize Express + Vite + React project structure
- [x] Configure TypeScript with strict mode
- [x] Set up ESLint and Prettier
- [x] Create development and build scripts

### 1.2 Database Layer
- [x] Integrate better-sqlite3
- [x] Create schema migrations system
- [x] Implement templates table (CRUD operations)
- [x] Implement tasks table (references templates)
- [x] Implement executions table
- [x] Implement credentials metadata table
- [x] Add database initialization on first launch
- [x] Seed built-in templates on first launch

### 1.3 Credential Vault
- [x] Implement secure master key storage
- [x] Implement master key derivation
- [x] Create AES-256-GCM encryption/decryption utilities
- [x] Build credential CRUD operations
- [x] Implement secure credential injection for tasks

### 1.4 Task Executor
- [x] Create execution engine (load template, inject params)
- [x] Implement console output capture
- [x] Add timeout handling
- [x] Build result/error capture
- [x] Create execution record persistence

### 1.5 Scheduler
- [x] Integrate node-cron
- [x] Implement cron expression validation
- [x] Create job registration and management
- [x] Add one-time task scheduling (setTimeout-based)
- [x] Implement next-run calculation
- [x] Handle app restart (reschedule persisted tasks)

---

## Phase 2: MCP Server

**Goal**: Full MCP API implementation

### 2.1 MCP Server Core
- [x] Set up @modelcontextprotocol/sdk
- [x] Configure stdio transport
- [x] Implement server initialization
- [x] Add graceful shutdown handling

### 2.2 Template Tools
- [x] `list_templates` - List available templates
  - Filter by: category
  - Include: params schema, required credentials

### 2.3 Task Management Tools
- [x] `schedule_task` - Create new scheduled task from template
  - Parameters: template_id, name, params, schedule, credentials[]
  - Validate params against template schema
  - Validate cron expressions
  - Validate credential references exist
- [x] `list_tasks` - List all tasks
  - Filter by: enabled, has_errors, template_id
  - Include: last_run, next_run, status
- [x] `get_task` - Get task details
  - Include: template info, params, schedule, recent executions
- [x] `update_task` - Modify existing task
  - Support partial param updates
  - Reschedule if schedule changes
  - Cannot change template (delete and recreate)
- [x] `delete_task` - Remove task
  - Cascade delete executions
  - Cancel scheduled job
- [x] `toggle_task` - Enable/disable task

### 2.4 Execution Tools
- [x] `execute_task` - Run task immediately
  - Return execution ID
  - Option: wait for completion or return immediately
- [x] `get_executions` - Get execution history
  - Filter by: task_name, status, date range
  - Pagination support
- [x] `get_execution` - Get single execution details
  - Full output and error logs

### 2.5 Credential Tools
- [x] `add_credential` - Store new credential
  - Parameters: name, value, type, description
  - Encrypt and store securely
- [x] `list_credentials` - List credentials (names only)
  - Include: type, created_at, last_used, usage_count
- [x] `delete_credential` - Remove credential
  - Warn if credential is in use by tasks

### 2.6 System Tools
- [x] `get_status` - System health check
  - Scheduler status
  - Database stats
  - Pending tasks count

---

## Phase 3: User Interface

**Goal**: React web UI with full task and template management

### 3.1 Application Shell
- [x] Create main layout with navigation
- [x] Implement dark/light theme support
- [x] Set up API client for server communication
- [x] Create loading and error states

### 3.2 Template Management (UI-only features)
- [x] Template list view with categories
- [x] Template editor with Monaco Editor
  - Syntax highlighting for JavaScript
  - Parameter schema builder UI
  - Required credentials selector
- [x] Create new template from scratch
- [x] Edit existing templates
- [x] Delete templates (with task dependency warning)
- [x] Import/export templates

### 3.3 Task List View
- [x] Display all tasks with status indicators
- [x] Show template name, next run, last status
- [x] Quick actions: run, edit params, enable/disable, delete
- [x] Search and filter by template, status
- [x] Bulk operations (delete, enable/disable)

### 3.4 Task Configuration
- [x] Template selector (from available templates)
- [x] Parameter form (generated from template schema)
- [x] Schedule configuration UI
  - Cron expression builder
  - One-time datetime picker
  - Interval selector
- [x] Additional credential assignment
- [x] Validation before save

### 3.5 Execution Logs
- [x] Execution history table with filtering
- [x] Detailed execution view
  - Console output display
  - Return value display
  - Error stack traces
- [x] Real-time log streaming for running tasks
- [x] Export logs functionality

### 3.6 Credential Manager
- [x] Credential list with masked values
- [x] Add new credential form
- [x] Edit credential (re-enter value)
- [x] Delete with usage warning
- [x] Credential usage overview (which templates/tasks use it)

---

## Phase 4: Polish & Distribution

**Goal**: Production-ready application

### 4.1 Error Handling & Recovery
- [x] Comprehensive error boundaries in UI
- [x] Automatic retry for failed tasks (configurable)
- [x] Database corruption recovery
- [x] Graceful handling of missing credentials

### 4.2 Notifications
- [x] System notifications for task completion/failure
- [x] Notification preferences
- [x] Optional sound alerts

### 4.3 Built-in Templates
- [x] HTTP Health Check template
- [x] GitHub PR Creation template
- [x] Slack/Discord notification template
- [x] Database backup template
- [x] Webhook trigger template
- [x] File watcher template

### 4.4 Import/Export
- [x] Export tasks as JSON
- [x] Import tasks from JSON
- [x] Backup/restore entire configuration

### 4.5 Distribution
- [x] Docker container image
- [x] systemd service file for Linux
- [x] npm package publishing
- [x] Installation documentation

### 4.6 Documentation
- [x] User guide
- [x] Task code examples
- [x] MCP client setup guides
- [x] Troubleshooting guide

---

## Phase 5: Advanced Features (Future)

**Goal**: Extended capabilities based on user feedback

### 5.1 Task Dependencies
- [ ] Define task execution order
- [ ] Run task B after task A succeeds
- [ ] Parallel execution groups
- [ ] DAG visualization

### 5.2 Enhanced Scheduling
- [ ] Timezone support
- [ ] Holiday calendars
- [ ] Maintenance windows (pause during specified times)
- [ ] Random delay (jitter) for distributed execution

### 5.3 Execution Improvements
- [ ] Task timeout configuration per task
- [ ] Concurrent execution limits
- [ ] Priority queues
- [ ] Execution hooks (before/after)

### 5.4 Monitoring & Analytics
- [ ] Dashboard with execution statistics
- [ ] Success/failure rate charts
- [ ] Execution duration trends
- [ ] Alerting for repeated failures

### 5.5 Plugin System
- [ ] Plugin API definition
- [ ] Built-in plugins for common services
  - GitHub
  - Slack
  - AWS
  - Google Cloud
- [ ] Community plugin directory

### 5.6 MCP Enhancements
- [ ] SSE transport for web-based MCP clients
- [ ] MCP Resources for task templates
- [ ] MCP Prompts for task creation wizards
- [ ] Streaming execution output

---

## Non-Goals

The following are explicitly out of scope:

- **User accounts/authentication**: Local-first, single user
- **Cloud sync**: All data stays local
- **Built-in AI chat**: MCP-only interface; use external clients
- **Arbitrary code via MCP**: MCP can only use existing templates; template authoring is UI-only
- **Multi-user collaboration**: Single machine, single user
- **Remote execution**: Tasks run only on local machine

---

## Status Legend

- [ ] Not started
- [x] Completed
- 🚧 In progress
