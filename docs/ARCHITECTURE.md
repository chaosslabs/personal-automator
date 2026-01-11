# Architecture

Personal Automator is a local-first Electron application that provides task automation capabilities exclusively through MCP (Model Context Protocol).

## Design Principles

1. **Local-First**: All data stays on the user's machine. No cloud services, no accounts, no telemetry.
2. **MCP-Only Interface**: All automation capabilities are exposed through MCP tools. No built-in AI assistant.
3. **Template-Based Execution**: Tasks run from predefined templates only. MCP cannot execute arbitrary code—templates are authored through the desktop UI.
4. **Secure Credentials**: Encrypted credential storage using OS keychain.
5. **Developer-Friendly**: JavaScript-based templates, familiar tooling, transparent operation.

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
│  │  │ Template     │ │ Task Tools   │ │ Exec Tools   │ │ Cred Tools  │ │ │
│  │  │ Tools        │ │ schedule     │ │ execute      │ │ add         │ │ │
│  │  │ list         │ │ update       │ │ get_history  │ │ delete      │ │ │
│  │  │              │ │ delete       │ │              │ │ list        │ │ │
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
│  │  │  templates      tasks            executions     credentials  │    │ │
│  │  │  ├─ id          ├─ id            ├─ id          ├─ id        │    │ │
│  │  │  ├─ name        ├─ template_id   ├─ task_id     ├─ name      │    │ │
│  │  │  ├─ code        ├─ name          ├─ started_at  ├─ type      │    │ │
│  │  │  ├─ params_def  ├─ params        ├─ finished_at ├─ created   │    │ │
│  │  │  └─ ...         ├─ schedule      ├─ output      └─ last_used │    │ │
│  │  │                 └─ enabled       └─ error                    │    │ │
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
│  │  │ Task List │ │ Template  │ │ Execution │ │ Credential        │   │ │
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

Runs template code with task parameters in Node.js.

**Responsibilities:**
- Load template code from database
- Inject task parameters and credentials into execution context
- Handle async execution and timeouts
- Capture console output and return values
- Handle errors gracefully

**Execution Context:**
```typescript
// Template code has access to:
const context = {
  params,                           // Task-specific parameters
  credentials: injectedCredentials, // Task-specific secrets
  fetch,                            // Native fetch
  console,                          // Captured for logs
  require,                          // Full Node.js require
  process: { env },                 // Environment variables
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
-- Templates (authored via UI)
CREATE TABLE templates (
    id TEXT PRIMARY KEY,               -- e.g., 'http-health-check'
    name TEXT NOT NULL,                -- e.g., 'HTTP Health Check'
    description TEXT,
    category TEXT,                     -- e.g., 'monitoring', 'github'
    code TEXT NOT NULL,                -- JavaScript code
    params_schema TEXT NOT NULL,       -- JSON schema for parameters
    required_credentials TEXT DEFAULT '[]',  -- JSON array
    suggested_schedule TEXT,           -- e.g., '*/5 * * * *'
    is_builtin INTEGER DEFAULT 0,      -- 1 for shipped templates
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tasks (instances of templates)
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id TEXT NOT NULL,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    params TEXT NOT NULL,              -- JSON: parameter values
    schedule_type TEXT NOT NULL,       -- 'cron', 'once', 'interval'
    schedule_value TEXT NOT NULL,      -- cron expr, ISO datetime, or minutes
    credentials TEXT DEFAULT '[]',     -- JSON array of additional credential names
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_run_at TEXT,
    next_run_at TEXT,
    FOREIGN KEY (template_id) REFERENCES templates(id)
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
CREATE INDEX idx_tasks_template_id ON tasks(template_id);
```

### UI Layer (`src/renderer/`)

React-based UI for task and template management. The UI provides template authoring capabilities not available via MCP.

**Components:**

| Component | Purpose |
|-----------|---------|
| `TaskList` | View and manage scheduled tasks |
| `TemplateEditor` | Monaco editor for authoring/editing templates |
| `TemplateList` | Browse and manage available templates |
| `ExecutionLog` | View execution history and logs |
| `CredentialVault` | Manage stored credentials |

**UI-Only Features:**
- Template creation and editing (MCP can only use existing templates)
- Template deletion
- Built-in template management

**IPC Communication:**
The renderer communicates with the main process via Electron IPC, not MCP. This provides a direct, low-latency interface for the UI.

## Data Flow

### Task Creation Flow

```
MCP Client                    MCP Server              Scheduler              Database
    │                             │                       │                      │
    │  schedule_task(             │                       │                      │
    │    template_id, params...)  │                       │                      │
    │────────────────────────────>│                       │                      │
    │                             │                       │                      │
    │                             │  SELECT template      │                      │
    │                             │──────────────────────────────────────────────>│
    │                             │                       │                      │
    │                             │  validate params      │                      │
    │                             │  against schema       │                      │
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
    │                      │  SELECT template.code (via task.template_id)  │
    │                      │───────────────────────────────────────────────>│
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
    │                      │  run template code     │                      │
    │                      │  with params + creds   │                      │
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
│   │   │   ├── TemplateList.tsx
│   │   │   ├── TemplateEditor.tsx # Monaco editor for templates
│   │   │   ├── ExecutionLog.tsx
│   │   │   ├── CredentialVault.tsx
│   │   │   └── common/
│   │   ├── hooks/
│   │   │   ├── useTemplates.ts
│   │   │   ├── useTasks.ts
│   │   │   ├── useExecutions.ts
│   │   │   └── useCredentials.ts
│   │   ├── stores/                # State management
│   │   └── styles/
│   │
│   └── shared/                    # Shared between main/renderer
│       ├── types.ts               # TypeScript interfaces
│       ├── constants.ts           # Shared constants
│       ├── builtin-templates.ts   # Built-in task templates
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

### Built-in Templates

Built-in templates are defined in `src/shared/builtin-templates.ts` and loaded on first run:

```typescript
interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  code: string;
  paramsSchema: ParamDefinition[];
  requiredCredentials: string[];
  suggestedSchedule?: string;
}

interface ParamDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  default?: any;
  description?: string;
}
```

### User-Created Templates

Users create templates through the UI. Template code has access to:
- `params` - Task-specific parameter values
- `credentials` - Decrypted credential values
- Full Node.js APIs including `fetch`, `require`, etc.

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
