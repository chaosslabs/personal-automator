# Roadmap

Development roadmap for Personal Automator organized into phases with clear milestones.

## Phase 1: Foundation

**Goal**: Core infrastructure and basic task management

### 1.1 Project Setup
- [ ] Initialize Electron + Vite + React project structure
- [ ] Configure TypeScript with strict mode
- [ ] Set up ESLint and Prettier
- [ ] Create development and build scripts
- [ ] Configure electron-builder for packaging

### 1.2 Database Layer
- [ ] Integrate better-sqlite3
- [ ] Create schema migrations system
- [ ] Implement tasks table (CRUD operations)
- [ ] Implement executions table
- [ ] Implement credentials metadata table
- [ ] Add database initialization on first launch

### 1.3 Credential Vault
- [ ] Integrate keytar for OS keychain access
- [ ] Implement master key derivation
- [ ] Create AES-256-GCM encryption/decryption utilities
- [ ] Build credential CRUD operations
- [ ] Implement secure credential injection for tasks

### 1.4 Task Executor
- [ ] Create execution engine (dynamic function execution)
- [ ] Implement console output capture
- [ ] Add timeout handling
- [ ] Build result/error capture
- [ ] Create execution record persistence

### 1.5 Scheduler
- [ ] Integrate node-cron
- [ ] Implement cron expression validation
- [ ] Create job registration and management
- [ ] Add one-time task scheduling (setTimeout-based)
- [ ] Implement next-run calculation
- [ ] Handle app restart (reschedule persisted tasks)

---

## Phase 2: MCP Server

**Goal**: Full MCP API implementation

### 2.1 MCP Server Core
- [ ] Set up @modelcontextprotocol/sdk
- [ ] Configure stdio transport
- [ ] Implement server initialization
- [ ] Add graceful shutdown handling

### 2.2 Task Management Tools
- [ ] `schedule_task` - Create new scheduled task
  - Parameters: name, description, code, schedule, credentials[]
  - Validate cron expressions
  - Validate credential references exist
- [ ] `list_tasks` - List all tasks
  - Filter by: enabled, has_errors
  - Include: last_run, next_run, status
- [ ] `get_task` - Get task details
  - Include: code, schedule, credentials, recent executions
- [ ] `update_task` - Modify existing task
  - Support partial updates
  - Reschedule if schedule changes
- [ ] `delete_task` - Remove task
  - Cascade delete executions
  - Cancel scheduled job
- [ ] `toggle_task` - Enable/disable task

### 2.3 Execution Tools
- [ ] `execute_task` - Run task immediately
  - Return execution ID
  - Option: wait for completion or return immediately
- [ ] `get_executions` - Get execution history
  - Filter by: task_name, status, date range
  - Pagination support
- [ ] `get_execution` - Get single execution details
  - Full output and error logs

### 2.4 Credential Tools
- [ ] `add_credential` - Store new credential
  - Parameters: name, value, type, description
  - Encrypt and store securely
- [ ] `list_credentials` - List credentials (names only)
  - Include: type, created_at, last_used, usage_count
- [ ] `delete_credential` - Remove credential
  - Warn if credential is in use by tasks

### 2.5 System Tools
- [ ] `get_status` - System health check
  - Scheduler status
  - Database stats
  - Pending tasks count
- [ ] `get_templates` - List available task templates

---

## Phase 3: User Interface

**Goal**: Electron renderer with full task management UI

### 3.1 Application Shell
- [ ] Create main window with navigation
- [ ] Implement dark/light theme support
- [ ] Set up IPC communication with main process
- [ ] Create loading and error states

### 3.2 Task List View
- [ ] Display all tasks with status indicators
- [ ] Show next run time and last run status
- [ ] Quick actions: run, edit, enable/disable, delete
- [ ] Search and filter functionality
- [ ] Bulk operations (delete, enable/disable)

### 3.3 Task Editor
- [ ] Integrate Monaco Editor for code editing
- [ ] Syntax highlighting for JavaScript/TypeScript
- [ ] Schedule configuration UI
  - Cron expression builder
  - One-time datetime picker
  - Interval selector
- [ ] Credential assignment UI
- [ ] Task template selector
- [ ] Validation before save

### 3.4 Execution Logs
- [ ] Execution history table with filtering
- [ ] Detailed execution view
  - Console output display
  - Return value display
  - Error stack traces
- [ ] Real-time log streaming for running tasks
- [ ] Export logs functionality

### 3.5 Credential Manager
- [ ] Credential list with masked values
- [ ] Add new credential form
- [ ] Edit credential (re-enter value)
- [ ] Delete with usage warning
- [ ] Credential usage overview

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

### 4.3 Task Templates
- [ ] HTTP Health Check template
- [ ] GitHub PR Creation template
- [ ] Slack/Discord notification template
- [ ] Database backup template
- [ ] Custom template creation

### 4.4 Import/Export
- [ ] Export tasks as JSON
- [ ] Import tasks from JSON
- [ ] Backup/restore entire configuration

### 4.5 Distribution
- [ ] Code signing setup (macOS, Windows)
- [ ] Auto-update mechanism
- [ ] macOS DMG packaging
- [ ] Windows NSIS installer
- [ ] Linux AppImage/deb/rpm

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
- **Multi-user collaboration**: Single machine, single user
- **Mobile apps**: Desktop only
- **Remote execution**: Tasks run only on local machine
- **Sandboxed execution**: Users control their own code

---

## Status Legend

- [ ] Not started
- [x] Completed
- 🚧 In progress
