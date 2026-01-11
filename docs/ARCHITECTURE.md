# Architecture

Personal Automator is a local-first Electron application that provides task automation capabilities exclusively through MCP (Model Context Protocol).

## Design Principles

1. **Local-First**: All data stays on the user's machine. No cloud services, no accounts, no telemetry.
2. **MCP-Only Interface**: All automation capabilities are exposed through MCP tools. No built-in AI assistant.
3. **Secure Credentials**: Encrypted credential storage using OS keychain.
4. **Developer-Friendly**: JavaScript-based tasks, familiar tooling, transparent operation.
5. **Trust the User**: No sandboxing—users run their own code with full Node.js capabilities.

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           External MCP Client                             │
│                    (Claude Desktop, custom integrations)                  │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ MCP Protocol (stdio transport)
                                 │
┌────────────────────────────────▼─────────────────────────────────────────┐
│                         PERSONAL AUTOMATOR                                │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                         MCP Server Layer                             │ │
│  │                                                                      │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │ │
│  │  │ Task Tools   │ │ Exec Tools   │ │ Cred Tools   │ │ Query Tools │ │ │
│  │  │ schedule     │ │ execute      │ │ add          │ │ list        │ │ │
│  │  │ update       │ │ get_history  │ │ delete       │ │ get         │ │ │
│  │  │ delete       │ │              │ │ list         │ │ search      │ │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └─────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                      │
│  ┌─────────────────────────────────▼───────────────────────────────────┐ │
│  │                        Core Services                                 │ │
│  │                                                                      │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │ │
│  │  │    Scheduler     │  │    Executor      │  │  Credential Vault │  │ │
│  │  │    (node-cron)   │  │    (Node.js)     │  │  (keytar + AES)   │  │ │
│  │  │                  │  │                  │  │                   │  │ │
│  │  │ - Cron parsing   │  │ - Code execution │  │ - Key derivation  │  │ │
│  │  │ - Job management │  │ - Async handling │  │ - Encryption      │  │ │
│  │  │ - Next run calc  │  │ - Result capture │  │ - Secure inject   │  │ │
│  │  │ - Retry logic    │  │ - Error handling │  │ - Access control  │  │ │
│  │  └──────────────────┘  └──────────────────┘  └───────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                    │                                      │
│  ┌─────────────────────────────────▼───────────────────────────────────┐ │
│  │                        Data Layer                                    │ │
│  │                                                                      │ │
│  │  ┌─────────────────────────────────────────────────────────────┐    │ │
│  │  │                    SQLite Database                           │    │ │
│  │  │                                                              │    │ │
│  │  │  tasks          executions       credentials_meta            │    │ │
│  │  │  ├─ id          ├─ id            ├─ id                       │    │ │
│  │  │  ├─ name        ├─ task_id       ├─ name                     │    │ │
│  │  │  ├─ code        ├─ started_at    ├─ type                     │    │ │
│  │  │  ├─ schedule    ├─ finished_at   ├─ created_at               │    │ │
│  │  │  ├─ credentials ├─ success       └─ last_used                │    │ │
│  │  │  ├─ enabled     ├─ output                                    │    │ │
│  │  │  └─ ...         └─ error                                     │    │ │
│  │  └─────────────────────────────────────────────────────────────┘    │ │
│  │                                                                      │ │
│  │  ┌─────────────────────────────────────────────────────────────┐    │ │
│  │  │                    OS Keychain                               │    │ │
│  │  │         (credential values, master encryption key)           │    │ │
│  │  └─────────────────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                        UI Layer (Electron Renderer)                  │ │
│  │                                                                      │ │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐   │ │
│  │  │ Task List │ │ Code      │ │ Execution │ │ Credential        │   │ │
│  │  │           │ │ Editor    │ │ Logs      │ │ Manager           │   │ │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### MCP Server (`src/main/mcp-server.ts`)

The MCP server is the primary interface for external clients. It implements the Model Context Protocol specification and exposes all automation capabilities as tools.

**Responsibilities:**
- Handle MCP protocol communication (stdio transport)
- Validate tool inputs
- Route requests to appropriate services
- Format responses per MCP specification

**Transport Options:**
- **stdio** (primary): For local Claude Desktop integration
- **SSE** (future): For browser-based MCP clients

### Scheduler (`src/main/scheduler.ts`)

Manages task scheduling using node-cron for recurring tasks and setTimeout for one-time tasks.

**Responsibilities:**
- Parse and validate cron expressions
- Calculate next run times
- Manage job lifecycle (create, pause, resume, delete)
- Handle missed executions (e.g., app was closed)
- Implement retry logic for failed tasks

**Schedule Types:**
```typescript
type Schedule =
  | { type: 'cron'; expression: string }      // "0 9 * * 1-5"
  | { type: 'once'; datetime: string }         // ISO 8601
  | { type: 'interval'; minutes: number };     // Simple interval
```

### Executor (`src/main/executor.ts`)

Runs task code directly in Node.js with full access to all APIs.

**Responsibilities:**
- Dynamically import/execute task code
- Inject credentials into execution context
- Handle async execution and timeouts
- Capture console output and return values
- Handle errors gracefully

**Execution Context:**
```typescript
// Tasks have access to:
const context = {
  fetch,                            // Native fetch
  console,                          // Captured for logs
  credentials: injectedCredentials, // Task-specific secrets
  require,                          // Full Node.js require
  process: { env },                 // Environment variables
  // Full Node.js APIs available
};
```

**Configuration:**
| Setting | Default | Description |
|---------|---------|-------------|
| Timeout | 5min | Max execution time before kill |
| Console capture | 1MB | Max logged output size |

### Credential Vault (`src/main/credentials.ts`)

Securely stores and manages API keys and secrets.

**Responsibilities:**
- Derive encryption key from OS keychain
- Encrypt/decrypt credential values (AES-256-GCM)
- Inject credentials into execution context
- Track credential usage

**Storage Model:**
- **SQLite**: Credential metadata (name, type, created_at)
- **OS Keychain**: Encrypted credential values

**No credential value is ever:**
- Logged to console or files
- Returned in MCP responses
- Stored in plain text

### Database (`src/main/database.ts`)

SQLite database for persistent storage using better-sqlite3.

**Schema:**

```sql
-- Tasks
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    code TEXT NOT NULL,
    schedule_type TEXT NOT NULL,       -- 'cron', 'once', 'interval'
    schedule_value TEXT NOT NULL,      -- cron expr, ISO datetime, or minutes
    credentials TEXT DEFAULT '[]',     -- JSON array of credential names
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_run_at TEXT,
    next_run_at TEXT
);

-- Execution History
CREATE TABLE executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,              -- 'running', 'success', 'failed', 'timeout'
    output TEXT,                       -- JSON: console logs, return value
    error TEXT,                        -- Error message if failed
    duration_ms INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Credential Metadata
CREATE TABLE credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,                -- 'api_key', 'oauth_token', 'env_var', 'secret'
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
);

-- Indexes
CREATE INDEX idx_executions_task_id ON executions(task_id);
CREATE INDEX idx_executions_started_at ON executions(started_at);
CREATE INDEX idx_tasks_next_run ON tasks(next_run_at) WHERE enabled = 1;
```

### UI Layer (`src/renderer/`)

React-based UI for visual task management. The UI is optional—all functionality is accessible via MCP.

**Components:**

| Component | Purpose |
|-----------|---------|
| `TaskList` | View and manage scheduled tasks |
| `CodeEditor` | Monaco editor for writing/editing task code |
| `ExecutionLog` | View execution history and logs |
| `CredentialVault` | Manage stored credentials |

**IPC Communication:**
The renderer communicates with the main process via Electron IPC, not MCP. This provides a direct, low-latency interface for the UI.

## Data Flow

### Task Creation Flow

```
MCP Client                    MCP Server              Scheduler              Database
    │                             │                       │                      │
    │  schedule_task(...)         │                       │                      │
    │────────────────────────────>│                       │                      │
    │                             │                       │                      │
    │                             │  validate input       │                      │
    │                             │  parse schedule       │                      │
    │                             │                       │                      │
    │                             │  INSERT task          │                      │
    │                             │──────────────────────────────────────────────>│
    │                             │                       │                      │
    │                             │  registerJob(task)    │                      │
    │                             │──────────────────────>│                      │
    │                             │                       │                      │
    │                             │       job_id          │                      │
    │                             │<──────────────────────│                      │
    │                             │                       │                      │
    │     { success, task_id }    │                       │                      │
    │<────────────────────────────│                       │                      │
```

### Task Execution Flow

```
Scheduler              Executor              Credential Vault           Database
    │                      │                        │                      │
    │  (cron triggers)     │                        │                      │
    │                      │                        │                      │
    │  execute(task)       │                        │                      │
    │─────────────────────>│                        │                      │
    │                      │                        │                      │
    │                      │  getCredentials(names) │                      │
    │                      │───────────────────────>│                      │
    │                      │                        │                      │
    │                      │       decrypted values │                      │
    │                      │<───────────────────────│                      │
    │                      │                        │                      │
    │                      │  INSERT execution (running)                   │
    │                      │───────────────────────────────────────────────>│
    │                      │                        │                      │
    │                      │  execute task code     │                      │
    │                      │  ...                   │                      │
    │                      │                        │                      │
    │                      │  UPDATE execution (result)                    │
    │                      │───────────────────────────────────────────────>│
    │                      │                        │                      │
    │       result         │                        │                      │
    │<─────────────────────│                        │                      │
```

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Electron 28+ | Cross-platform desktop, Node.js access |
| UI Framework | React 18 | Component-based, large ecosystem |
| Language | TypeScript | Type safety, better tooling |
| Database | better-sqlite3 | Synchronous API, no server needed |
| Scheduler | node-cron | Mature, reliable cron implementation |
| MCP | @modelcontextprotocol/sdk | Official MCP implementation |
| Encryption | Node.js crypto | AES-256-GCM |
| Keychain | keytar | Cross-platform OS keychain access |
| Code Editor | Monaco Editor | VS Code experience |
| Build | Vite | Fast builds, good Electron support |
| Packaging | electron-builder | Cross-platform distribution |

## File Structure

```
personal-automator/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # App entry, window management
│   │   ├── mcp-server.ts          # MCP server implementation
│   │   ├── scheduler.ts           # Task scheduling service
│   │   ├── executor.ts            # Task execution engine
│   │   ├── credentials.ts         # Credential vault service
│   │   ├── database.ts            # SQLite database service
│   │   ├── ipc-handlers.ts        # IPC handlers for renderer
│   │   └── preload.ts             # Preload script for renderer
│   │
│   ├── renderer/                  # Electron renderer (React)
│   │   ├── index.html
│   │   ├── main.tsx               # React entry point
│   │   ├── App.tsx                # Root component
│   │   ├── components/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskEditor.tsx
│   │   │   ├── CodeEditor.tsx
│   │   │   ├── ExecutionLog.tsx
│   │   │   ├── CredentialVault.tsx
│   │   │   └── common/
│   │   ├── hooks/
│   │   │   ├── useTask.ts
│   │   │   ├── useExecutions.ts
│   │   │   └── useCredentials.ts
│   │   ├── stores/                # State management
│   │   └── styles/
│   │
│   └── shared/                    # Shared between main/renderer
│       ├── types.ts               # TypeScript interfaces
│       ├── constants.ts           # Shared constants
│       ├── templates.ts           # Task code templates
│       └── validation.ts          # Input validation schemas
│
├── docs/                          # Documentation
├── tests/                         # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/                       # Build/dev scripts
├── resources/                     # App icons, assets
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
└── README.md
```

## Extension Points

### Custom Task Templates

Templates are defined in `src/shared/templates.ts` and can be extended:

```typescript
interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
  requiredCredentials: string[];
  suggestedSchedule?: string;
}
```

### MCP Resource Extensions

Future: Expose task templates and execution logs as MCP resources for richer client integrations.

### Plugin System (Future)

Planned architecture for extending executor capabilities:

```typescript
interface ExecutorPlugin {
  name: string;
  version: string;
  apis: Record<string, Function>;  // APIs to expose to tasks
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}
```
