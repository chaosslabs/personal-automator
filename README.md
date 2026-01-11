# Personal Automator

A local-first task automation engine that exposes scheduling and execution capabilities through MCP (Model Context Protocol). Schedule JavaScript tasks, manage credentials securely, and automate workflows—all running entirely on your machine.

## Overview

Personal Automator is designed for developers who want to automate repetitive tasks without deploying to external services. It runs as a local Electron application with an MCP server that any MCP-compatible client (like Claude Desktop) can connect to.

**Key Design Decision**: Personal Automator exposes all functionality through MCP tools only. There is no built-in AI assistant—instead, you connect your preferred MCP client to interact with the automation engine.

## Features

- **Task Scheduling**: One-time or recurring tasks using cron expressions
- **Secure Credential Vault**: AES-256 encrypted storage using OS keychain
- **Full Node.js Access**: Tasks run with complete Node.js capabilities
- **MCP Server**: Full API exposed via Model Context Protocol
- **Execution History**: Complete logs and analytics for all task runs
- **Local-First**: No accounts, no cloud—everything runs on your machine

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Client                                │
│              (Claude Desktop, custom clients, etc.)              │
└─────────────────────────┬───────────────────────────────────────┘
                          │ MCP Protocol (stdio/SSE)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Personal Automator                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ MCP Server  │──│  Scheduler  │──│  Execution Engine       │  │
│  │             │  │  (node-cron)│  │  (vm2 sandbox)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                     │                 │
│         ▼                ▼                     ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    SQLite Database                          ││
│  │  (tasks, executions, credentials metadata)                  ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              OS Keychain (credential values)                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## MCP Tools

Personal Automator exposes the following tools via MCP:

| Tool | Description |
|------|-------------|
| `schedule_task` | Create a new scheduled task with code and cron/datetime |
| `list_tasks` | List all tasks with their status and schedules |
| `get_task` | Get details of a specific task |
| `update_task` | Modify an existing task |
| `delete_task` | Remove a task from the scheduler |
| `execute_task` | Trigger immediate execution of a task |
| `get_executions` | Retrieve execution history |
| `add_credential` | Store a new credential in the vault |
| `list_credentials` | List available credentials (names only) |
| `delete_credential` | Remove a credential from the vault |

See [docs/MCP_API.md](docs/MCP_API.md) for complete API documentation.

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/chaosslabs/personal-automator.git
cd personal-automator

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Connecting an MCP Client

Add to your Claude Desktop configuration (`~/.config/claude/claude_desktop_config.json`):

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

### Example Usage

Once connected via MCP, you can:

```
"Schedule a task called 'health-check' that pings https://api.example.com
every 5 minutes and logs the response status"
```

The MCP client will use the `schedule_task` tool to create:

```javascript
const response = await fetch('https://api.example.com/health');
console.log('Status:', response.status);
return { status: response.status, timestamp: new Date().toISOString() };
```

## Project Structure

```
personal-automator/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # Application entry point
│   │   ├── mcp-server.ts     # MCP server implementation
│   │   ├── scheduler.ts      # Task scheduling (node-cron)
│   │   ├── executor.ts       # Sandboxed execution (vm2)
│   │   ├── credentials.ts    # Credential vault
│   │   └── database.ts       # SQLite operations
│   ├── renderer/             # Electron renderer (React UI)
│   │   ├── components/
│   │   │   ├── TaskList.tsx
│   │   │   ├── CodeEditor.tsx
│   │   │   ├── ExecutionLog.tsx
│   │   │   └── CredentialVault.tsx
│   │   └── App.tsx
│   └── shared/
│       ├── types.ts          # Shared TypeScript types
│       └── templates.ts      # Task code templates
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MCP_API.md
│   ├── ROADMAP.md
│   └── SECURITY.md
├── tests/
├── package.json
└── README.md
```

## Security

- **Encrypted Credentials**: AES-256 encryption with keys derived from OS keychain
- **No Network Exposure**: MCP server runs locally via stdio, not exposed to network
- **Local-Only Data**: All data stored locally, never transmitted externally
- **User-Controlled Code**: You write and control all task code that runs

See [docs/SECURITY.md](docs/SECURITY.md) for the complete security model.

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Package for distribution
npm run package
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and data flow
- [MCP API](docs/MCP_API.md) - Complete MCP tool specifications
- [Roadmap](docs/ROADMAP.md) - Development phases and milestones
- [Security](docs/SECURITY.md) - Security model and threat mitigation

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read the contributing guidelines before submitting PRs.
