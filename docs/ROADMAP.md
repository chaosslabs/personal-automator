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
- [ ] Integrate better-sqlite3
- [ ] Create schema migrations system
- [ ] Implement templates table (CRUD operations)
- [ ] Implement tasks table (references templates)
- [ ] Implement executions table
- [ ] Implement credentials metadata table
- [ ] Add database initialization on first launch
- [ ] Seed built-in templates on first launch

### 1.3 Credential Vault
- [ ] Implement secure master key storage
- [ ] Implement master key derivation
- [ ] Create AES-256-GCM encryption/decryption utilities
- [ ] Build credential CRUD operations
- [ ] Implement secure credential injection for tasks

### 1.4 Task Executor
- [ ] Create execution engine (load template, inject params)
- [ ] Implement console output capture
- [ ] Add timeout handling
- [ ] Build result/error capture
- [ ] Create execution record persistence

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
- [ ] Set up @modelcontextprotocol/sdk
- [ ] Configure stdio transport
- [ ] Implement server initialization
- [ ] Add graceful shutdown handling

### 2.2 Template Tools
- [ ] `list_templates` - List available templates
  - Filter by: category
  - Include: params schema, required credentials

### 2.3 Task Management Tools
- [ ] `schedule_task` - Create new scheduled task from template
  - Parameters: template_id, name, params, schedule, credentials[]
  - Validate params against template schema
  - Validate cron expressions
  - Validate credential references exist
- [ ] `list_tasks` - List all tasks
  - Filter by: enabled, has_errors, template_id
  - Include: last_run, next_run, status
- [ ] `get_task` - Get task details
  - Include: template info, params, schedule, recent executions
- [ ] `update_task` - Modify existing task
  - Support partial param updates
  - Reschedule if schedule changes
  - Cannot change template (delete and recreate)
- [ ] `delete_task` - Remove task
  - Cascade delete executions
  - Cancel scheduled job
- [ ] `toggle_task` - Enable/disable task

### 2.4 Execution Tools
- [ ] `execute_task` - Run task immediately
  - Return execution ID
  - Option: wait for completion or return immediately
- [ ] `get_executions` - Get execution history
  - Filter by: task_name, status, date range
  - Pagination support
- [ ] `get_execution` - Get single execution details
  - Full output and error logs

### 2.5 Credential Tools
- [ ] `add_credential` - Store new credential
  - Parameters: name, value, type, description
  - Encrypt and store securely
- [ ] `list_credentials` - List credentials (names only)
  - Include: type, created_at, last_used, usage_count
- [ ] `delete_credential` - Remove credential
  - Warn if credential is in use by tasks

### 2.6 System Tools
- [ ] `get_status` - System health check
  - Scheduler status
  - Database stats
  - Pending tasks count

---

## Phase 3: User Interface

**Goal**: React web UI with full task and template management

### 3.1 Application Shell
- [ ] Create main layout with navigation
- [ ] Implement dark/light theme support
- [ ] Set up API client for server communication
- [ ] Create loading and error states

### 3.2 Template Management (UI-only features)
- [ ] Template list view with categories
- [ ] Template editor with Monaco Editor
  - Syntax highlighting for JavaScript
  - Parameter schema builder UI
  - Required credentials selector
- [ ] Create new template from scratch
- [ ] Edit existing templates
- [ ] Delete templates (with task dependency warning)
- [ ] Import/export templates

### 3.3 Task List View
- [ ] Display all tasks with status indicators
- [ ] Show template name, next run, last status
- [ ] Quick actions: run, edit params, enable/disable, delete
- [ ] Search and filter by template, status
- [ ] Bulk operations (delete, enable/disable)

### 3.4 Task Configuration
- [ ] Template selector (from available templates)
- [ ] Parameter form (generated from template schema)
- [ ] Schedule configuration UI
  - Cron expression builder
  - One-time datetime picker
  - Interval selector
- [ ] Additional credential assignment
- [ ] Validation before save

### 3.5 Execution Logs
- [ ] Execution history table with filtering
- [ ] Detailed execution view
  - Console output display
  - Return value display
  - Error stack traces
- [ ] Real-time log streaming for running tasks
- [ ] Export logs functionality

### 3.6 Credential Manager
- [ ] Credential list with masked values
- [ ] Add new credential form
- [ ] Edit credential (re-enter value)
- [ ] Delete with usage warning
- [ ] Credential usage overview (which templates/tasks use it)

---

## Phase 4: Polish & Distribution

**Goal**: Production-ready application

### 4.1 Error Handling & Recovery
- [ ] Comprehensive error boundaries in UI
- [ ] Automatic retry for failed tasks (configurable)
- [ ] Database corruption recovery
- [ ] Graceful handling of missing credentials

### 4.2 Notifications
- [ ] System notifications for task completion/failure
- [ ] Notification preferences
- [ ] Optional sound alerts

### 4.3 Built-in Templates
- [ ] HTTP Health Check template
- [ ] GitHub PR Creation template
- [ ] Slack/Discord notification template
- [ ] Database backup template
- [ ] Webhook trigger template
- [ ] File watcher template

### 4.4 Import/Export
- [ ] Export tasks as JSON
- [ ] Import tasks from JSON
- [ ] Backup/restore entire configuration

### 4.5 Distribution
- [ ] Docker container image
- [ ] systemd service file for Linux
- [ ] npm package publishing
- [ ] Installation documentation

### 4.6 Documentation
- [ ] User guide
- [ ] Task code examples
- [ ] MCP client setup guides
- [ ] Troubleshooting guide

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
