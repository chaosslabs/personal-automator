# Personal Automator

A local-first task automation engine that exposes scheduling and execution capabilities through MCP (Model Context Protocol). Schedule tasks from predefined templates, manage credentials securely, and automate workflows—all running entirely on your machine.

## Overview

Personal Automator is designed for developers who want to automate repetitive tasks without deploying to external services. It runs as a local Node.js web server with an MCP server that any MCP-compatible client (like Claude Desktop) can connect to.

**Key Design Decisions**:
- **MCP-Only Interface**: All automation capabilities exposed through MCP tools. No built-in AI assistant.
- **Template-Based Execution**: Tasks run from predefined templates only—no arbitrary code execution via MCP. Templates are authored and reviewed through the web UI.

## Features

- **Template-Based Tasks**: Schedule tasks from curated, reviewed templates
- **Task Scheduling**: One-time or recurring tasks using cron expressions
- **Secure Credential Vault**: AES-256 encrypted storage
- **MCP Server**: Full API exposed via Model Context Protocol
- **Execution History**: Complete logs and analytics for all task runs
- **Local-First**: No accounts, no cloud—everything runs on your machine
- **Template Authoring**: Create custom templates via the web UI (use Claude to help generate code)

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
│  │             │  │  (node-cron)│  │  (Node.js)              │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                     │                 │
│         ▼                ▼                     ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    SQLite Database                          ││
│  │  (tasks, executions, credentials metadata)                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Express Web Server + React UI                  ││
│  │              (http://localhost:3000)                        ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## MCP Tools

Personal Automator exposes the following tools via MCP:

| Tool | Description |
|------|-------------|
| `list_templates` | List available task templates |
| `schedule_task` | Create a scheduled task from a template |
| `list_tasks` | List all tasks with their status and schedules |
| `get_task` | Get details of a specific task |
| `update_task` | Modify task schedule or parameters |
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

The web UI will be available at `http://localhost:5173` (dev) or `http://localhost:3000` (production).

### Connecting an MCP Client

Add to your Claude Desktop configuration (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "personal-automator": {
      "command": "node",
      "args": ["/path/to/personal-automator/dist/server/mcp-server.js"]
    }
  }
}
```

### Example Usage

Once connected via MCP, you can ask Claude to schedule tasks using available templates:

```
"Schedule a health check for https://api.example.com every 5 minutes"
```

Claude will first call `list_templates` to find the appropriate template, then use `schedule_task`:

```json
{
  "template_id": "http-health-check",
  "name": "api-health-check",
  "params": {
    "url": "https://api.example.com/health",
    "expected_status": 200
  },
  "schedule": { "type": "cron", "expression": "*/5 * * * *" }
}
```

**Adding Custom Templates**: Use the web UI to create new templates. You can use Claude to help generate the template code, then paste it into the template editor for review before saving.

## Project Structure

```
personal-automator/
├── src/
│   ├── server/               # Express server (Node.js)
│   │   ├── index.ts          # Server entry point
│   │   ├── mcp-server.ts     # MCP server implementation
│   │   ├── scheduler.ts      # Task scheduling (node-cron)
│   │   ├── executor.ts       # Task execution engine
│   │   ├── credentials.ts    # Credential vault
│   │   └── database.ts       # SQLite operations
│   ├── client/               # React web UI
│   │   ├── components/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TemplateEditor.tsx
│   │   │   ├── ExecutionLog.tsx
│   │   │   └── CredentialVault.tsx
│   │   └── App.tsx
│   └── shared/
│       ├── types.ts          # Shared TypeScript types
│       └── constants.ts      # Shared constants
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

- **Template-Only Execution**: MCP can only run pre-approved templates—no arbitrary code injection
- **Encrypted Credentials**: AES-256 encryption for sensitive data
- **Local-Only Access**: Server binds to localhost by default
- **Local-Only Data**: All data stored locally, never transmitted externally
- **Reviewed Templates**: Templates are authored via UI, giving you full control over what code can run

See [docs/SECURITY.md](docs/SECURITY.md) for the complete security model.

## Development

```bash
# Run in development mode (server + client with hot reload)
npm run dev

# Run server only
npm run dev:server

# Run client only
npm run dev:client

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
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
