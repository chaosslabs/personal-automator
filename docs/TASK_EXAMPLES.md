# Task Code Examples

Examples of template code for common automation scenarios.

## HTTP & API

### Health Check with Custom Headers

```javascript
const headers = {};
if (credentials.API_TOKEN) {
  headers['Authorization'] = `Bearer ${credentials.API_TOKEN}`;
}

const response = await fetch(params.url, {
  method: 'GET',
  headers,
  signal: AbortSignal.timeout(params.timeout || 10000),
});

console.log(`Status: ${response.status}`);
console.log(`Response time: within timeout`);

if (!response.ok) {
  throw new Error(`Health check failed: ${response.status}`);
}

return { healthy: true, status: response.status };
```

### REST API Polling

```javascript
// Poll an API endpoint and log new items
const response = await fetch(params.apiUrl, {
  headers: {
    'Authorization': `Bearer ${credentials.API_TOKEN}`,
    'Accept': 'application/json',
  },
});

const data = await response.json();
const items = data.items || data.results || data;

console.log(`Fetched ${items.length} items from ${params.apiUrl}`);

for (const item of items.slice(0, 10)) {
  console.log(`- ${item.id}: ${item.title || item.name}`);
}

return { count: items.length, items: items.slice(0, 10) };
```

## File System

### Log File Size Monitor

```javascript
const fs = require('fs');
const path = require('path');

const logDir = params.logDirectory;
const maxSizeMB = params.maxSizeMB || 100;

const files = fs.readdirSync(logDir);
let totalSize = 0;
const largeFiles = [];

for (const file of files) {
  const filePath = path.join(logDir, file);
  const stats = fs.statSync(filePath);
  const sizeMB = stats.size / (1024 * 1024);
  totalSize += sizeMB;

  if (sizeMB > maxSizeMB) {
    largeFiles.push({ file, sizeMB: sizeMB.toFixed(2) });
    console.warn(`Large file: ${file} (${sizeMB.toFixed(2)} MB)`);
  }
}

console.log(`Total size: ${totalSize.toFixed(2)} MB`);
console.log(`Files checked: ${files.length}`);

if (largeFiles.length > 0) {
  console.warn(`${largeFiles.length} file(s) exceed ${maxSizeMB} MB`);
}

return { totalSizeMB: totalSize.toFixed(2), largeFiles };
```

### Directory Sync Check

```javascript
const fs = require('fs');
const path = require('path');

const sourceDir = params.sourceDir;
const targetDir = params.targetDir;

const sourceFiles = new Set(fs.readdirSync(sourceDir));
const targetFiles = new Set(fs.readdirSync(targetDir));

const missing = [...sourceFiles].filter(f => !targetFiles.has(f));
const extra = [...targetFiles].filter(f => !sourceFiles.has(f));

console.log(`Source files: ${sourceFiles.size}`);
console.log(`Target files: ${targetFiles.size}`);

if (missing.length > 0) {
  console.warn(`Missing in target: ${missing.join(', ')}`);
}
if (extra.length > 0) {
  console.log(`Extra in target: ${extra.join(', ')}`);
}

return {
  inSync: missing.length === 0,
  missingCount: missing.length,
  extraCount: extra.length,
  missing,
  extra,
};
```

## Shell Commands

### Git Repository Status

```javascript
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const repoPath = params.repoPath;

const { stdout: status } = await execAsync('git status --porcelain', { cwd: repoPath });
const { stdout: branch } = await execAsync('git branch --show-current', { cwd: repoPath });
const { stdout: log } = await execAsync('git log --oneline -5', { cwd: repoPath });

console.log(`Branch: ${branch.trim()}`);
console.log(`Recent commits:`);
console.log(log.trim());

const changes = status.trim().split('\n').filter(Boolean);
if (changes.length > 0) {
  console.warn(`Uncommitted changes: ${changes.length}`);
  for (const change of changes) {
    console.log(`  ${change}`);
  }
}

return {
  branch: branch.trim(),
  uncommittedChanges: changes.length,
  clean: changes.length === 0,
};
```

### Disk Space Check

```javascript
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const { stdout } = await execAsync('df -h /');
const lines = stdout.trim().split('\n');
const data = lines[1].split(/\s+/);

const filesystem = data[0];
const size = data[1];
const used = data[2];
const available = data[3];
const usePercent = parseInt(data[4], 10);

console.log(`Filesystem: ${filesystem}`);
console.log(`Total: ${size}, Used: ${used}, Available: ${available}`);
console.log(`Usage: ${usePercent}%`);

const threshold = params.thresholdPercent || 90;
if (usePercent >= threshold) {
  console.error(`WARNING: Disk usage ${usePercent}% exceeds threshold ${threshold}%`);
  throw new Error(`Disk usage critical: ${usePercent}%`);
}

return { filesystem, size, used, available, usePercent };
```

## Notifications

### Send Conditional Slack Alert

```javascript
// Check a condition and send Slack alert if triggered
const response = await fetch(params.checkUrl);
const data = await response.json();

const isAlertCondition = data.status !== 'ok' || data.errorCount > 0;

if (isAlertCondition) {
  const webhookUrl = credentials.SLACK_WEBHOOK_URL;
  const message = `Alert: ${params.serviceName} - Status: ${data.status}, Errors: ${data.errorCount}`;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message,
      username: 'Personal Automator',
    }),
  });

  console.log(`Alert sent: ${message}`);
  return { alerted: true, message };
}

console.log(`${params.serviceName} is healthy - no alert needed`);
return { alerted: false, status: data.status };
```

## Data Processing

### JSON File Aggregator

```javascript
const fs = require('fs');
const path = require('path');

const inputDir = params.inputDir;
const outputFile = params.outputFile;

const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));
const allData = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(inputDir, file), 'utf-8');
  const data = JSON.parse(content);
  allData.push({ source: file, data });
  console.log(`Processed: ${file}`);
}

fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));
console.log(`Aggregated ${files.length} files to ${outputFile}`);

return { filesProcessed: files.length, outputFile };
```

## Tips

- Use `console.log` for informational output and `console.error` for errors
- The return value is stored as the execution result
- Throw errors to mark execution as failed
- Use `credentials.KEY_NAME` to access encrypted credentials
- Use `params.paramName` to access task parameters
- Template code supports `async`/`await`
- Available Node.js modules: `fs`, `path`, `child_process`, `crypto`, `http`, `https`, `os`, `url`, `util`, `stream`, `events`, `buffer`, `zlib`, `assert`, `querystring`, `string_decoder`
