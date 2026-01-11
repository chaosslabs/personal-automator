# Security Model

Personal Automator is designed as a local-first, single-user application. This document describes the security model and trust assumptions.

## Trust Model

### What Personal Automator Trusts

1. **The User**: You have full control over all code that runs. There is no sandboxing—your tasks run with full Node.js capabilities.

2. **The Local Machine**: All data is stored locally. The application trusts the security of the host operating system.

3. **MCP Clients**: Any MCP client that can connect via stdio has full access to all capabilities.

### What Personal Automator Protects

1. **Credentials at Rest**: API keys and secrets are encrypted using AES-256-GCM with keys derived from the OS keychain.

2. **Credential Values in Transit**: Credential values are never returned in API responses or logged.

3. **Local-Only Operation**: No data is transmitted to external servers (except by user-written task code).

---

## Credential Security

### Encryption

Credentials are encrypted using a two-layer approach:

```
┌─────────────────────────────────────────────────────┐
│                  OS Keychain                         │
│         (Master Key - never leaves keychain)         │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Key Derivation                       │
│    PBKDF2(master_key, app_salt, 100000 iterations)  │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              AES-256-GCM Encryption                  │
│     Each credential encrypted with unique IV         │
└─────────────────────────────────────────────────────┘
```

**Implementation Details:**

- **Master Key Storage**: Stored in OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations
- **Encryption**: AES-256-GCM with random 12-byte IV per credential
- **Authentication**: GCM provides authenticated encryption

### Credential Lifecycle

1. **Storage**: Value encrypted immediately, plaintext never written to disk
2. **At Rest**: Only encrypted blob stored in database
3. **Access**: Decrypted in-memory only during task execution
4. **Cleanup**: Decrypted values cleared from memory after execution
5. **Deletion**: Encrypted blob removed from database

### What Credentials Can Access

When a task runs with assigned credentials, those credentials are available as `credentials.NAME`. The credential value is only accessible to:

- The specific task execution
- Only while the task is running
- Only credentials explicitly assigned to that task

---

## MCP Server Security

### Transport

The MCP server uses **stdio transport only**. This means:

- No network ports are opened
- Only processes that can spawn the server have access
- Connection requires local execution privileges

### No Authentication

The MCP server does not implement authentication. Security relies on:

1. **Local Access**: Only local processes can connect
2. **OS Permissions**: File system permissions on the server binary
3. **User Trust**: The user controls which MCP clients connect

### Tool Access

All MCP tools have full access to:

- Create, read, update, delete tasks
- Execute tasks immediately
- Access credential metadata (not values)
- Add and remove credentials

---

## Task Execution

### No Sandboxing

Task code runs directly in the Node.js process with full capabilities:

- File system access
- Network access
- Process spawning
- All Node.js APIs

**This is intentional.** Personal Automator is a power-user tool for developers who want to automate tasks on their own machine. The user writes and controls all code.

### Timeout Protection

Tasks have a configurable timeout (default: 5 minutes) to prevent runaway execution. When timeout is reached:

1. Execution is terminated
2. Status is set to "timeout"
3. Partial output is preserved

### Console Capture

Console output is captured and stored with execution records:

- `console.log`, `console.warn`, `console.error` captured
- Output truncated at 1MB to prevent storage issues
- Credentials are NOT automatically redacted from output

**Important**: Avoid logging credential values in your task code.

---

## Data Security

### Local Storage

All data is stored locally:

| Data | Location | Protection |
|------|----------|------------|
| Database | `~/.personal-automator/data.db` | File permissions |
| Credentials | Database (encrypted) + OS keychain | AES-256-GCM |
| Logs | Database | File permissions |
| Config | `~/.personal-automator/config.json` | File permissions |

### Database Encryption

The SQLite database itself is not encrypted. Sensitive data protection relies on:

1. **Credential Values**: Always encrypted in the database
2. **File Permissions**: Database file is user-readable only
3. **OS Security**: Full disk encryption recommended

### Backup Considerations

When backing up Personal Automator data:

- Database contains encrypted credentials (safe to backup)
- Master key in OS keychain must be available to decrypt
- Recommend backing up both database AND exporting keychain entry

---

## Threat Model

### In Scope

| Threat | Mitigation |
|--------|------------|
| Credential theft from disk | AES-256-GCM encryption |
| Credential exposure in API | Values never returned in responses |
| Credential exposure in logs | User responsibility (don't log secrets) |
| Runaway task execution | Configurable timeouts |
| Data loss | SQLite with WAL mode, backup/export features |

### Out of Scope

| Threat | Reason |
|--------|--------|
| Malicious task code | User writes/controls all code |
| MCP client attacks | User controls which clients connect |
| Local privilege escalation | Relies on OS security |
| Memory inspection | Standard process security |
| Physical access | Relies on device security |

---

## Best Practices

### For Users

1. **Don't log credentials**: Avoid `console.log(credentials.API_KEY)`
2. **Use specific credentials**: Only assign credentials tasks need
3. **Enable full disk encryption**: Protects database at rest
4. **Review task code**: Understand what your tasks do
5. **Rotate credentials**: Periodically update API keys
6. **Backup securely**: Include keychain when backing up

### Credential Naming

Use descriptive names that don't reveal the value:

```
Good:
- GITHUB_TOKEN
- SLACK_WEBHOOK_ALERTS
- AWS_DEPLOY_KEY

Bad:
- ghp_xxxxxxxxxxxx
- https://hooks.slack.com/...
- AKIAIOSFODNN7EXAMPLE
```

### Task Code Security

```javascript
// Good: Use credentials object
const response = await fetch(url, {
  headers: { 'Authorization': `Bearer ${credentials.API_TOKEN}` }
});

// Bad: Hardcoded secrets
const response = await fetch(url, {
  headers: { 'Authorization': 'Bearer ghp_xxxxx' }
});

// Bad: Logging credentials
console.log('Using token:', credentials.API_TOKEN);

// Good: Log success/failure only
console.log('Request completed:', response.status);
```

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public GitHub issue
2. Email security concerns to [security contact - TBD]
3. Include steps to reproduce
4. Allow reasonable time for a fix before disclosure
