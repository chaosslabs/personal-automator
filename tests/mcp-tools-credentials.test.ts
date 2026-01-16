import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor } from '../src/server/executor/index.js';
import { Scheduler } from '../src/server/scheduler/index.js';
import { MCPServer } from '../src/server/mcp/index.js';
import { registerCredentialTools } from '../src/server/mcp/tools/credentials.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-mcp-credentials');

describe('Credential Tools', () => {
  let db: DatabaseService;
  let vault: VaultService;
  let executor: TaskExecutor;
  let scheduler: Scheduler;
  let mcpServer: MCPServer;

  beforeEach(() => {
    // Clean up test directory if it exists
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Initialize test services
    const dbPath = join(TEST_DIR, 'test.db');
    db = new DatabaseService(dbPath);
    db.initialize();

    vault = new VaultService(TEST_DIR);
    vault.initialize();

    executor = new TaskExecutor(db, vault);
    scheduler = new Scheduler(db, executor);

    // Create MCP server and register tools
    mcpServer = new MCPServer({
      db,
      vault,
      executor,
      scheduler,
    });

    registerCredentialTools(mcpServer);
  });

  afterEach(() => {
    // Stop scheduler
    if (scheduler.isRunning()) {
      scheduler.stop();
    }

    // Clean up
    db.close();
    vault.clearKey();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('add_credential', () => {
    it('should add a new credential', () => {
      const encryptedValue = vault.encrypt('my-secret-value');
      const credential = db.credentials.createWithValue(
        {
          name: 'MY_API_KEY',
          type: 'api_key',
          description: 'Test API key',
        },
        encryptedValue
      );

      expect(credential).toBeDefined();
      expect(credential.name).toBe('MY_API_KEY');
      expect(credential.type).toBe('api_key');
    });

    it('should encrypt credential value', () => {
      const secretValue = 'super-secret-token-12345';
      const encryptedValue = vault.encrypt(secretValue);

      // Encrypted value should be different from original
      expect(encryptedValue).not.toBe(secretValue);

      // Should be able to decrypt back
      const decrypted = vault.decrypt(encryptedValue);
      expect(decrypted).toBe(secretValue);
    });

    it('should reject duplicate credential names', () => {
      db.credentials.createWithValue(
        {
          name: 'DUPLICATE_KEY',
          type: 'api_key',
          description: null,
        },
        vault.encrypt('value1')
      );

      // Check if exists
      expect(db.credentialExists('DUPLICATE_KEY')).toBe(true);
    });

    it('should support different credential types', () => {
      const apiKey = db.credentials.createWithValue(
        { name: 'API_KEY', type: 'api_key', description: null },
        vault.encrypt('key')
      );
      const oauthToken = db.credentials.createWithValue(
        { name: 'OAUTH_TOKEN', type: 'oauth_token', description: null },
        vault.encrypt('token')
      );
      const envVar = db.credentials.createWithValue(
        { name: 'ENV_VAR', type: 'env_var', description: null },
        vault.encrypt('var')
      );
      const secret = db.credentials.createWithValue(
        { name: 'SECRET', type: 'secret', description: null },
        vault.encrypt('secret')
      );

      expect(apiKey.type).toBe('api_key');
      expect(oauthToken.type).toBe('oauth_token');
      expect(envVar.type).toBe('env_var');
      expect(secret.type).toBe('secret');
    });
  });

  describe('list_credentials', () => {
    beforeEach(() => {
      // Create some test credentials
      db.credentials.createWithValue(
        { name: 'GITHUB_TOKEN', type: 'api_key', description: 'GitHub API token' },
        vault.encrypt('ghp_xxx')
      );
      db.credentials.createWithValue(
        { name: 'SLACK_WEBHOOK', type: 'env_var', description: 'Slack webhook URL' },
        vault.encrypt('https://hooks.slack.com/xxx')
      );
    });

    it('should list all credentials', () => {
      const credentials = db.credentials.getAllWithValueStatus();
      expect(credentials.length).toBe(2);
    });

    it('should not return credential values', () => {
      const credentials = db.credentials.getAllWithValueStatus();

      for (const cred of credentials) {
        // Should not have actual value, just hasValue indicator
        expect(cred.hasValue).toBe(true);
        expect((cred as { value?: string })['value']).toBeUndefined();
      }
    });

    it('should include credential metadata', () => {
      const credentials = db.credentials.getAllWithValueStatus();
      const githubToken = credentials.find((c) => c.name === 'GITHUB_TOKEN');

      expect(githubToken).toBeDefined();
      expect(githubToken?.type).toBe('api_key');
      expect(githubToken?.description).toBe('GitHub API token');
      expect(githubToken?.createdAt).toBeDefined();
    });

    it('should indicate which credentials have values', () => {
      // Create credential without value
      db.createCredential({
        name: 'EMPTY_CRED',
        type: 'secret',
        description: null,
      });

      const credentials = db.credentials.getAllWithValueStatus();
      const emptyCred = credentials.find((c) => c.name === 'EMPTY_CRED');
      const filledCred = credentials.find((c) => c.name === 'GITHUB_TOKEN');

      expect(emptyCred?.hasValue).toBe(false);
      expect(filledCred?.hasValue).toBe(true);
    });
  });

  describe('delete_credential', () => {
    it('should delete a credential', () => {
      const credential = db.credentials.createWithValue(
        { name: 'DELETE_ME', type: 'api_key', description: null },
        vault.encrypt('value')
      );

      const deleted = db.deleteCredential(credential.id);
      expect(deleted).toBe(true);

      expect(db.getCredentialByName('DELETE_ME')).toBeNull();
    });

    it('should return false for non-existent credential', () => {
      const deleted = db.deleteCredential(99999);
      expect(deleted).toBe(false);
    });

    it('should check if credential is in use', () => {
      db.credentials.createWithValue(
        { name: 'IN_USE_CRED', type: 'api_key', description: null },
        vault.encrypt('value')
      );

      // Create a task using this credential
      db.createTask({
        templateId: 'http-health-check',
        name: 'task-using-cred',
        description: null,
        params: { url: 'https://example.com' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: ['IN_USE_CRED'],
        enabled: true,
      });

      const inUse = db.getCredentialsInUse();
      expect(inUse).toContain('IN_USE_CRED');
    });

    it('should check template required credentials for in-use status', () => {
      db.credentials.createWithValue(
        { name: 'SLACK_WEBHOOK_URL', type: 'env_var', description: null },
        vault.encrypt('https://hooks.slack.com/xxx')
      );

      // Create a task using slack template (requires SLACK_WEBHOOK_URL)
      db.createTask({
        templateId: 'slack-notification',
        name: 'slack-task',
        description: null,
        params: { text: 'Hello' },
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [], // Not explicitly adding, but template requires it
        enabled: true,
      });

      const inUse = db.getCredentialsInUse();
      expect(inUse).toContain('SLACK_WEBHOOK_URL');
    });
  });

  describe('credential injection', () => {
    it('should inject credentials into task execution', async () => {
      // Create credential
      db.credentials.createWithValue(
        { name: 'TEST_TOKEN', type: 'api_key', description: null },
        vault.encrypt('secret-test-token')
      );

      // Create template that uses credentials
      db.createTemplate({
        id: 'cred-test-template',
        name: 'Credential Test Template',
        description: null,
        category: 'test',
        code: 'return { token: credentials.TEST_TOKEN };',
        paramsSchema: [],
        requiredCredentials: ['TEST_TOKEN'],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      // Create task
      const task = db.createTask({
        templateId: 'cred-test-template',
        name: 'cred-test-task',
        description: null,
        params: {},
        scheduleType: 'interval',
        scheduleValue: '60',
        credentials: [],
        enabled: true,
      });

      // Execute task
      const result = await executor.execute(task.id);

      expect(result.success).toBe(true);
      expect(result.output?.result).toEqual({ token: 'secret-test-token' });
    });
  });
});
