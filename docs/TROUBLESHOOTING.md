# Troubleshooting Guide

## Common Issues

### Server Won't Start

**Symptom**: Error when running `npm start` or `npm run dev`

**Possible causes**:

1. **Port already in use**
   ```
   Error: listen EADDRINUSE :::3000
   ```
   Solution: Change the port with `PORT=3001 npm start` or stop the other process.

2. **Node.js version too old**
   ```
   SyntaxError: Unexpected token
   ```
   Solution: Requires Node.js 20+. Check with `node --version`.

3. **Missing dependencies**
   ```
   Cannot find module 'better-sqlite3'
   ```
   Solution: Run `npm install` to install dependencies. For native modules, you may need build tools:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install build-essential python3

   # macOS
   xcode-select --install
   ```

### Database Issues

**Symptom**: Database errors or corruption

1. **Database locked**
   ```
   SqliteError: database is locked
   ```
   Solution: Ensure only one instance of Personal Automator is running.

2. **Database corruption**
   The database is stored at `~/.personal-automator/personal-automator.db`. If corrupted:
   ```bash
   # Backup the corrupted file
   cp ~/.personal-automator/personal-automator.db ~/.personal-automator/personal-automator.db.bak

   # Delete and restart (will create fresh database)
   rm ~/.personal-automator/personal-automator.db
   npm start
   ```

3. **Migration errors**
   If migrations fail, the database may be in an inconsistent state. Remove it and restart.

### Task Execution Issues

**Symptom**: Tasks fail or produce unexpected results

1. **Missing credentials**
   ```
   Failed to inject credentials: Credential 'API_KEY' is missing or has no value
   ```
   Solution: Navigate to Credentials view and add/update the required credential.

2. **Timeout errors**
   ```
   Execution timed out after 300000ms
   ```
   Solution: The default timeout is 5 minutes. For long-running tasks, pass a custom timeout or optimize the task code.

3. **Module not allowed**
   ```
   Module 'axios' is not allowed
   ```
   Solution: Only whitelisted Node.js modules can be used. Use `fetch` for HTTP requests or use one of the allowed modules: `child_process`, `util`, `path`, `fs`, `fs/promises`, `os`, `crypto`, `url`, `querystring`, `stream`, `events`, `buffer`, `string_decoder`, `http`, `https`, `zlib`, `assert`.

4. **Task runs but nothing happens**
   Check the execution logs in the Executions view. Look for:
   - Console output for debugging info
   - Return value for the result
   - Error details if the task failed

### Credential Issues

**Symptom**: Credential operations fail

1. **Vault initialization error**
   The credential vault creates a master key on first use at `~/.personal-automator/vault.key`. If this file is corrupted:
   ```bash
   # WARNING: This will make all existing credentials unreadable
   rm ~/.personal-automator/vault.key
   ```
   You'll need to re-enter all credential values.

2. **Credential in use**
   ```
   Credential is in use by one or more tasks
   ```
   Solution: Remove the credential from all tasks before deleting it, or modify the tasks to use a different credential.

### Scheduler Issues

**Symptom**: Tasks don't run on schedule

1. **Task is disabled**: Check the Tasks view - disabled tasks show as grayed out.

2. **Invalid cron expression**: Verify the cron expression in the task configuration. Common mistakes:
   - Using 6 fields (seconds) instead of 5 fields
   - Invalid ranges (e.g., month 13)

3. **Scheduler not running**: Check the status indicator in the sidebar footer. If it shows "Disconnected", restart the server.

4. **One-time tasks already executed**: Once-type tasks only run once. Create a new task or change to cron/interval schedule.

### UI Issues

**Symptom**: UI doesn't load or shows errors

1. **Blank page**: Open browser developer tools (F12) and check the Console tab for errors.

2. **API errors**: The UI communicates with the server via `/api/*` endpoints. If the server is down, you'll see "Disconnected" in the sidebar.

3. **Theme issues**: If the theme looks broken, try clearing localStorage:
   ```javascript
   localStorage.removeItem('theme');
   ```

### Docker Issues

**Symptom**: Docker container fails

1. **Permission denied**
   ```
   SQLITE_CANTOPEN: unable to open database file
   ```
   Solution: Ensure the data volume has correct permissions:
   ```bash
   docker run -v automator-data:/data personal-automator
   ```

2. **Health check failing**
   The container includes a health check. If it fails, check logs:
   ```bash
   docker logs personal-automator
   ```

### MCP Integration Issues

**Symptom**: MCP tools not available in client

1. **Path incorrect**: Verify the path to `dist/server/mcp/index.js` in your MCP client config.

2. **Not built**: Run `npm run build` before configuring MCP.

3. **Permission denied**: Ensure the MCP server binary is executable and the Node.js path is correct.

4. **Conflicting server**: The MCP server and HTTP server can run independently. The MCP server uses stdio transport.

## Getting Help

If you encounter an issue not covered here:

1. Check the console output of the server for error messages
2. Check browser developer tools for client-side errors
3. Review the execution logs in the Executions view
4. File an issue at the project repository
