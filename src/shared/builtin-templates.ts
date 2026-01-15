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
];

export default builtinTemplates;
