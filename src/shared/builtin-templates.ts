import type { ParamDefinition } from './types.js';

/**
 * Definition for a built-in template
 */
export interface BuiltinTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  code: string;
  paramsSchema: ParamDefinition[];
  requiredCredentials: string[];
  suggestedSchedule?: string;
}

/**
 * Built-in templates that are seeded on first launch
 */
export const builtinTemplates: BuiltinTemplateDefinition[] = [
  {
    id: 'http-health-check',
    name: 'HTTP Health Check',
    description: 'Check if a URL is reachable and responding with expected status code',
    category: 'monitoring',
    paramsSchema: [
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'The URL to check',
      },
      {
        name: 'expectedStatus',
        type: 'number',
        required: false,
        default: 200,
        description: 'Expected HTTP status code',
      },
      {
        name: 'timeout',
        type: 'number',
        required: false,
        default: 30000,
        description: 'Request timeout in milliseconds',
      },
    ],
    requiredCredentials: [],
    suggestedSchedule: '*/5 * * * *',
    code: `// HTTP Health Check
// Checks if a URL is reachable and returns the expected status

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), params.timeout || 30000);

try {
  const startTime = Date.now();
  const response = await fetch(params.url, {
    method: 'GET',
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const duration = Date.now() - startTime;
  const expectedStatus = params.expectedStatus || 200;

  if (response.status !== expectedStatus) {
    throw new Error(\`Expected status \${expectedStatus}, got \${response.status}\`);
  }

  console.log(\`Health check passed: \${params.url}\`);
  console.log(\`Status: \${response.status}, Duration: \${duration}ms\`);

  return {
    healthy: true,
    status: response.status,
    duration,
    url: params.url,
  };
} catch (error) {
  clearTimeout(timeoutId);
  console.error(\`Health check failed: \${error.message}\`);
  throw error;
}`,
  },
  {
    id: 'webhook-trigger',
    name: 'Webhook Trigger',
    description: 'Send a POST request to a webhook URL with optional JSON payload',
    category: 'automation',
    paramsSchema: [
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'The webhook URL to call',
      },
      {
        name: 'payload',
        type: 'string',
        required: false,
        default: '{}',
        description: 'JSON payload to send',
      },
    ],
    requiredCredentials: [],
    code: `// Webhook Trigger
// Sends a POST request to the specified webhook URL

let payload;
try {
  payload = JSON.parse(params.payload || '{}');
} catch (e) {
  throw new Error('Invalid JSON payload: ' + e.message);
}

const response = await fetch(params.url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const responseText = await response.text();
let responseData;
try {
  responseData = JSON.parse(responseText);
} catch {
  responseData = responseText;
}

console.log(\`Webhook sent to: \${params.url}\`);
console.log(\`Response status: \${response.status}\`);
console.log(\`Response: \${JSON.stringify(responseData, null, 2)}\`);

if (!response.ok) {
  throw new Error(\`Webhook failed with status \${response.status}\`);
}

return {
  success: true,
  status: response.status,
  response: responseData,
};`,
  },
  {
    id: 'slack-notification',
    name: 'Slack Notification',
    description: 'Send a message to a Slack channel via webhook',
    category: 'notifications',
    paramsSchema: [
      {
        name: 'message',
        type: 'string',
        required: true,
        description: 'The message to send',
      },
      {
        name: 'channel',
        type: 'string',
        required: false,
        description: 'Override the default channel (optional)',
      },
      {
        name: 'username',
        type: 'string',
        required: false,
        default: 'Personal Automator',
        description: 'Bot username to display',
      },
    ],
    requiredCredentials: ['SLACK_WEBHOOK_URL'],
    code: `// Slack Notification
// Sends a message to Slack via incoming webhook

const webhookUrl = credentials.SLACK_WEBHOOK_URL;
if (!webhookUrl) {
  throw new Error('SLACK_WEBHOOK_URL credential is required');
}

const payload = {
  text: params.message,
  username: params.username || 'Personal Automator',
};

if (params.channel) {
  payload.channel = params.channel;
}

const response = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const error = await response.text();
  throw new Error(\`Slack notification failed: \${error}\`);
}

console.log('Slack notification sent successfully');
console.log(\`Message: \${params.message}\`);

return { success: true };`,
  },
  {
    id: 'discord-notification',
    name: 'Discord Notification',
    description: 'Send a message to a Discord channel via webhook',
    category: 'notifications',
    paramsSchema: [
      {
        name: 'content',
        type: 'string',
        required: true,
        description: 'The message content to send',
      },
      {
        name: 'username',
        type: 'string',
        required: false,
        default: 'Personal Automator',
        description: 'Bot username to display',
      },
    ],
    requiredCredentials: ['DISCORD_WEBHOOK_URL'],
    code: `// Discord Notification
// Sends a message to Discord via webhook

const webhookUrl = credentials.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  throw new Error('DISCORD_WEBHOOK_URL credential is required');
}

const payload = {
  content: params.content,
  username: params.username || 'Personal Automator',
};

const response = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const error = await response.text();
  throw new Error(\`Discord notification failed: \${error}\`);
}

console.log('Discord notification sent successfully');
console.log(\`Message: \${params.content}\`);

return { success: true };`,
  },
  {
    id: 'json-api-request',
    name: 'JSON API Request',
    description: 'Make an HTTP request to a JSON API with optional authentication',
    category: 'automation',
    paramsSchema: [
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'The API URL to call',
      },
      {
        name: 'method',
        type: 'string',
        required: false,
        default: 'GET',
        description: 'HTTP method (GET, POST, PUT, DELETE)',
      },
      {
        name: 'body',
        type: 'string',
        required: false,
        description: 'Request body as JSON string (for POST/PUT)',
      },
      {
        name: 'headers',
        type: 'string',
        required: false,
        default: '{}',
        description: 'Additional headers as JSON object',
      },
    ],
    requiredCredentials: ['API_TOKEN'],
    code: `// JSON API Request
// Makes an authenticated HTTP request to a JSON API

const apiToken = credentials.API_TOKEN;

let additionalHeaders = {};
try {
  additionalHeaders = JSON.parse(params.headers || '{}');
} catch (e) {
  throw new Error('Invalid headers JSON: ' + e.message);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': apiToken ? \`Bearer \${apiToken}\` : undefined,
  ...additionalHeaders,
};

// Remove undefined headers
Object.keys(headers).forEach(key => {
  if (headers[key] === undefined) delete headers[key];
});

const options = {
  method: (params.method || 'GET').toUpperCase(),
  headers,
};

if (params.body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
  options.body = params.body;
}

console.log(\`Making \${options.method} request to: \${params.url}\`);

const response = await fetch(params.url, options);
const responseText = await response.text();

let responseData;
try {
  responseData = JSON.parse(responseText);
} catch {
  responseData = responseText;
}

console.log(\`Response status: \${response.status}\`);
console.log(\`Response: \${JSON.stringify(responseData, null, 2).substring(0, 1000)}\`);

if (!response.ok) {
  throw new Error(\`API request failed with status \${response.status}\`);
}

return {
  status: response.status,
  data: responseData,
};`,
  },
  {
    id: 'run-shell-command',
    name: 'Run Shell Command',
    description: 'Execute a shell command and capture the output',
    category: 'automation',
    paramsSchema: [
      {
        name: 'command',
        type: 'string',
        required: true,
        description: 'The shell command to execute',
      },
      {
        name: 'cwd',
        type: 'string',
        required: false,
        description: 'Working directory for the command',
      },
      {
        name: 'timeout',
        type: 'number',
        required: false,
        default: 60000,
        description: 'Command timeout in milliseconds',
      },
    ],
    requiredCredentials: [],
    code: `// Run Shell Command
// Executes a shell command using Node.js child_process

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const options = {
  timeout: params.timeout || 60000,
  maxBuffer: 10 * 1024 * 1024, // 10MB
};

if (params.cwd) {
  options.cwd = params.cwd;
}

console.log(\`Executing command: \${params.command}\`);
if (params.cwd) {
  console.log(\`Working directory: \${params.cwd}\`);
}

try {
  const { stdout, stderr } = await execAsync(params.command, options);

  if (stdout) {
    console.log('stdout:', stdout);
  }
  if (stderr) {
    console.warn('stderr:', stderr);
  }

  return {
    success: true,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
} catch (error) {
  console.error('Command failed:', error.message);
  if (error.stdout) console.log('stdout:', error.stdout);
  if (error.stderr) console.error('stderr:', error.stderr);
  throw error;
}`,
  },
  {
    id: 'log-message',
    name: 'Log Message',
    description: 'Simple template that logs a message (useful for testing)',
    category: 'custom',
    paramsSchema: [
      {
        name: 'message',
        type: 'string',
        required: true,
        description: 'The message to log',
      },
      {
        name: 'level',
        type: 'string',
        required: false,
        default: 'info',
        description: 'Log level (info, warn, error)',
      },
    ],
    requiredCredentials: [],
    code: `// Log Message
// A simple template for logging messages

const level = params.level || 'info';
const message = params.message;
const timestamp = new Date().toISOString();

switch (level) {
  case 'error':
    console.error(\`[\${timestamp}] [ERROR] \${message}\`);
    break;
  case 'warn':
    console.warn(\`[\${timestamp}] [WARN] \${message}\`);
    break;
  default:
    console.log(\`[\${timestamp}] [INFO] \${message}\`);
}

return {
  timestamp,
  level,
  message,
};`,
  },
  {
    id: 'github-pr-creation',
    name: 'GitHub PR Creation',
    description: 'Create a pull request on a GitHub repository using the GitHub API',
    category: 'github',
    paramsSchema: [
      {
        name: 'owner',
        type: 'string',
        required: true,
        description: 'Repository owner (user or organization)',
      },
      {
        name: 'repo',
        type: 'string',
        required: true,
        description: 'Repository name',
      },
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Pull request title',
      },
      {
        name: 'head',
        type: 'string',
        required: true,
        description: 'The branch containing changes',
      },
      {
        name: 'base',
        type: 'string',
        required: false,
        default: 'main',
        description: 'The branch to merge into',
      },
      {
        name: 'body',
        type: 'string',
        required: false,
        default: '',
        description: 'Pull request description',
      },
    ],
    requiredCredentials: ['GITHUB_TOKEN'],
    code: `// GitHub PR Creation
// Creates a pull request using the GitHub REST API

const token = credentials.GITHUB_TOKEN;
if (!token) {
  throw new Error('GITHUB_TOKEN credential is required');
}

const apiUrl = \`https://api.github.com/repos/\${params.owner}/\${params.repo}/pulls\`;

const payload = {
  title: params.title,
  head: params.head,
  base: params.base || 'main',
  body: params.body || '',
};

console.log(\`Creating PR: \${params.title}\`);
console.log(\`Repository: \${params.owner}/\${params.repo}\`);
console.log(\`Branch: \${params.head} -> \${payload.base}\`);

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${token}\`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const data = await response.text();
let parsed;
try {
  parsed = JSON.parse(data);
} catch {
  parsed = data;
}

if (!response.ok) {
  console.error(\`GitHub API error: \${response.status}\`);
  console.error(JSON.stringify(parsed, null, 2));
  throw new Error(\`Failed to create PR: \${response.status} \${response.statusText}\`);
}

console.log(\`PR created successfully: #\${parsed.number}\`);
console.log(\`URL: \${parsed.html_url}\`);

return {
  number: parsed.number,
  url: parsed.html_url,
  state: parsed.state,
};`,
  },
  {
    id: 'database-backup',
    name: 'Database Backup',
    description: 'Create a backup copy of a SQLite or other file-based database',
    category: 'data',
    paramsSchema: [
      {
        name: 'sourcePath',
        type: 'string',
        required: true,
        description: 'Path to the database file to backup',
      },
      {
        name: 'backupDir',
        type: 'string',
        required: true,
        description: 'Directory to store backup files',
      },
      {
        name: 'maxBackups',
        type: 'number',
        required: false,
        default: 10,
        description: 'Maximum number of backup files to keep',
      },
    ],
    requiredCredentials: [],
    suggestedSchedule: '0 2 * * *',
    code: `// Database Backup
// Creates a timestamped backup of a file-based database

const fs = require('fs');
const path = require('path');

const sourcePath = params.sourcePath;
const backupDir = params.backupDir;
const maxBackups = params.maxBackups || 10;

// Verify source exists
if (!fs.existsSync(sourcePath)) {
  throw new Error(\`Source file not found: \${sourcePath}\`);
}

// Create backup directory if needed
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(\`Created backup directory: \${backupDir}\`);
}

// Generate backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const ext = path.extname(sourcePath);
const baseName = path.basename(sourcePath, ext);
const backupName = \`\${baseName}-\${timestamp}\${ext}\`;
const backupPath = path.join(backupDir, backupName);

// Copy file
fs.copyFileSync(sourcePath, backupPath);
const stats = fs.statSync(backupPath);
console.log(\`Backup created: \${backupName}\`);
console.log(\`Size: \${(stats.size / 1024).toFixed(1)} KB\`);

// Cleanup old backups
const backups = fs.readdirSync(backupDir)
  .filter(f => f.startsWith(baseName) && f.endsWith(ext))
  .sort()
  .reverse();

if (backups.length > maxBackups) {
  const toDelete = backups.slice(maxBackups);
  for (const old of toDelete) {
    fs.unlinkSync(path.join(backupDir, old));
    console.log(\`Deleted old backup: \${old}\`);
  }
  console.log(\`Cleaned up \${toDelete.length} old backup(s)\`);
}

return {
  backupPath,
  size: stats.size,
  totalBackups: Math.min(backups.length, maxBackups),
};`,
  },
  {
    id: 'file-watcher',
    name: 'File Watcher',
    description: 'Check if files in a directory have been modified since the last check',
    category: 'monitoring',
    paramsSchema: [
      {
        name: 'directory',
        type: 'string',
        required: true,
        description: 'Directory to watch for changes',
      },
      {
        name: 'pattern',
        type: 'string',
        required: false,
        default: '*',
        description: 'File glob pattern to match (e.g., *.log, *.json)',
      },
      {
        name: 'sinceMinutes',
        type: 'number',
        required: false,
        default: 60,
        description: 'Check for changes in the last N minutes',
      },
    ],
    requiredCredentials: [],
    suggestedSchedule: '*/30 * * * *',
    code: `// File Watcher
// Checks for recently modified files in a directory

const fs = require('fs');
const path = require('path');

const directory = params.directory;
const sinceMinutes = params.sinceMinutes || 60;
const pattern = params.pattern || '*';
const sinceTime = Date.now() - sinceMinutes * 60 * 1000;

if (!fs.existsSync(directory)) {
  throw new Error(\`Directory not found: \${directory}\`);
}

// Simple glob matching
function matchPattern(filename, pat) {
  if (pat === '*') return true;
  const regex = new RegExp('^' + pat.replace(/\\*/g, '.*').replace(/\\?/g, '.') + '$');
  return regex.test(filename);
}

const entries = fs.readdirSync(directory, { withFileTypes: true });
const modifiedFiles = [];

for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!matchPattern(entry.name, pattern)) continue;

  const filePath = path.join(directory, entry.name);
  const stats = fs.statSync(filePath);

  if (stats.mtimeMs > sinceTime) {
    modifiedFiles.push({
      name: entry.name,
      size: stats.size,
      modified: stats.mtime.toISOString(),
    });
  }
}

console.log(\`Checked directory: \${directory}\`);
console.log(\`Pattern: \${pattern}\`);
console.log(\`Time window: last \${sinceMinutes} minutes\`);
console.log(\`Modified files found: \${modifiedFiles.length}\`);

for (const file of modifiedFiles) {
  console.log(\`  - \${file.name} (\${(file.size / 1024).toFixed(1)} KB, modified: \${file.modified})\`);
}

if (modifiedFiles.length === 0) {
  console.log('No changes detected');
}

return {
  directory,
  pattern,
  sinceMinutes,
  modifiedCount: modifiedFiles.length,
  files: modifiedFiles,
};`,
  },
];

export default builtinTemplates;
