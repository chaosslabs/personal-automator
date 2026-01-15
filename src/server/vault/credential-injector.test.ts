import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseService } from '../database/index.js';
import { VaultService } from './index.js';
import { CredentialInjector, createCredentialsForExecution } from './credential-injector.js';

describe('CredentialInjector', () => {
  let db: DatabaseService;
  let vault: VaultService;
  let injector: CredentialInjector;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'personal-automator-injector-test-'));
    db = new DatabaseService(join(tempDir, 'test.db'));
    db.initialize();
    vault = new VaultService(tempDir);
    vault.initialize();
    injector = new CredentialInjector(db, vault);
  });

  afterEach(() => {
    vault.clearKey();
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('inject', () => {
    it('should return empty object for empty credential list', () => {
      const result = injector.inject([]);

      expect(result.success).toBe(true);
      expect(Object.keys(result.credentials)).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should inject a single credential', () => {
      // Create and store credential
      const encryptedValue = vault.encrypt('my-api-key-123');
      db.credentials.createWithValue(
        { name: 'API_KEY', type: 'api_key', description: 'Test API key' },
        encryptedValue
      );

      const result = injector.inject(['API_KEY']);

      expect(result.success).toBe(true);
      expect(result.credentials['API_KEY']).toBe('my-api-key-123');
      expect(result.missing).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should inject multiple credentials', () => {
      // Create multiple credentials
      db.credentials.createWithValue(
        { name: 'API_KEY', type: 'api_key', description: null },
        vault.encrypt('api-key-value')
      );
      db.credentials.createWithValue(
        { name: 'WEBHOOK_URL', type: 'secret', description: null },
        vault.encrypt('https://webhook.example.com')
      );
      db.credentials.createWithValue(
        { name: 'TOKEN', type: 'oauth_token', description: null },
        vault.encrypt('oauth-token-xyz')
      );

      const result = injector.inject(['API_KEY', 'WEBHOOK_URL', 'TOKEN']);

      expect(result.success).toBe(true);
      expect(result.credentials['API_KEY']).toBe('api-key-value');
      expect(result.credentials['WEBHOOK_URL']).toBe('https://webhook.example.com');
      expect(result.credentials['TOKEN']).toBe('oauth-token-xyz');
    });

    it('should report missing credentials', () => {
      db.credentials.createWithValue(
        { name: 'EXISTING', type: 'api_key', description: null },
        vault.encrypt('value')
      );

      const result = injector.inject(['EXISTING', 'MISSING']);

      expect(result.success).toBe(false);
      expect(result.credentials['EXISTING']).toBe('value');
      expect(result.missing).toContain('MISSING');
      expect(result.errors.some((e) => e.includes('MISSING'))).toBe(true);
    });

    it('should report credentials without values', () => {
      // Create credential metadata only (no value)
      db.createCredential({
        name: 'NO_VALUE',
        type: 'api_key',
        description: 'Has no value',
      });

      const result = injector.inject(['NO_VALUE']);

      expect(result.success).toBe(false);
      expect(result.missing).toContain('NO_VALUE');
      expect(result.errors.some((e) => e.includes('no value stored'))).toBe(true);
    });

    it('should update last used timestamp', () => {
      db.credentials.createWithValue(
        { name: 'TRACK_USAGE', type: 'api_key', description: null },
        vault.encrypt('value')
      );

      const before = db.getCredentialByName('TRACK_USAGE')?.lastUsedAt;
      expect(before).toBeNull();

      injector.inject(['TRACK_USAGE']);

      const after = db.getCredentialByName('TRACK_USAGE')?.lastUsedAt;
      expect(after).toBeDefined();
    });
  });

  describe('injectForTask', () => {
    it('should combine template and task credentials', () => {
      db.credentials.createWithValue(
        { name: 'TEMPLATE_CRED', type: 'api_key', description: null },
        vault.encrypt('template-value')
      );
      db.credentials.createWithValue(
        { name: 'TASK_CRED', type: 'secret', description: null },
        vault.encrypt('task-value')
      );

      const result = injector.injectForTask(['TEMPLATE_CRED'], ['TASK_CRED']);

      expect(result.success).toBe(true);
      expect(result.credentials['TEMPLATE_CRED']).toBe('template-value');
      expect(result.credentials['TASK_CRED']).toBe('task-value');
    });

    it('should deduplicate overlapping credentials', () => {
      db.credentials.createWithValue(
        { name: 'SHARED_CRED', type: 'api_key', description: null },
        vault.encrypt('shared-value')
      );

      // Same credential in both lists
      const result = injector.injectForTask(['SHARED_CRED'], ['SHARED_CRED']);

      expect(result.success).toBe(true);
      expect(result.credentials['SHARED_CRED']).toBe('shared-value');
      expect(Object.keys(result.credentials)).toHaveLength(1);
    });
  });

  describe('validate', () => {
    it('should validate all credentials exist with values', () => {
      db.credentials.createWithValue(
        { name: 'VALID1', type: 'api_key', description: null },
        vault.encrypt('value1')
      );
      db.credentials.createWithValue(
        { name: 'VALID2', type: 'api_key', description: null },
        vault.encrypt('value2')
      );

      const result = injector.validate(['VALID1', 'VALID2']);

      expect(result.valid).toContain('VALID1');
      expect(result.valid).toContain('VALID2');
      expect(result.missing).toHaveLength(0);
    });

    it('should report missing and no-value credentials', () => {
      db.credentials.createWithValue(
        { name: 'VALID', type: 'api_key', description: null },
        vault.encrypt('value')
      );
      db.createCredential({
        name: 'NO_VALUE',
        type: 'api_key',
        description: null,
      });

      const result = injector.validate(['VALID', 'NO_VALUE', 'MISSING']);

      expect(result.valid).toContain('VALID');
      expect(result.missing).toContain('NO_VALUE');
      expect(result.missing).toContain('MISSING');
    });
  });

  describe('clear', () => {
    it('should clear credentials object', () => {
      db.credentials.createWithValue(
        { name: 'CRED', type: 'api_key', description: null },
        vault.encrypt('sensitive-value')
      );

      const result = injector.inject(['CRED']);
      expect(result.credentials['CRED']).toBe('sensitive-value');

      injector.clear(result.credentials);

      expect(Object.keys(result.credentials)).toHaveLength(0);
      expect(result.credentials['CRED']).toBeUndefined();
    });
  });

  describe('createCredentialsForExecution', () => {
    it('should create credentials using convenience function', () => {
      db.credentials.createWithValue(
        { name: 'FUNC_CRED', type: 'api_key', description: null },
        vault.encrypt('func-value')
      );

      const result = createCredentialsForExecution(db, vault, ['FUNC_CRED'], []);

      expect(result.success).toBe(true);
      expect(result.credentials['FUNC_CRED']).toBe('func-value');
    });
  });

  describe('real-world scenarios', () => {
    beforeEach(() => {
      // Set up a realistic scenario with template and task
      db.createTemplate({
        id: 'slack-notify',
        name: 'Slack Notification',
        description: 'Send notification to Slack',
        category: 'notifications',
        code: 'console.log("Sending to Slack");',
        paramsSchema: [{ name: 'message', type: 'string', required: true }],
        requiredCredentials: ['SLACK_WEBHOOK_URL'],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      db.credentials.createWithValue(
        { name: 'SLACK_WEBHOOK_URL', type: 'secret', description: 'Slack incoming webhook' },
        vault.encrypt('https://hooks.slack.com/services/T00/B00/xxxxx')
      );
    });

    it('should inject credentials for a scheduled task', () => {
      const task = db.createTask({
        templateId: 'slack-notify',
        name: 'Daily Slack Alert',
        description: 'Send daily alert',
        params: { message: 'Daily check complete' },
        scheduleType: 'cron',
        scheduleValue: '0 9 * * *',
        credentials: [], // No additional task-level credentials
        enabled: true,
      });

      // Get template's required credentials
      const template = db.getTemplate(task.templateId);
      const result = injector.injectForTask(template?.requiredCredentials ?? [], task.credentials);

      expect(result.success).toBe(true);
      expect(result.credentials['SLACK_WEBHOOK_URL']).toBe(
        'https://hooks.slack.com/services/T00/B00/xxxxx'
      );
    });

    it('should handle task with additional credentials', () => {
      // Add an additional credential
      db.credentials.createWithValue(
        { name: 'EXTRA_TOKEN', type: 'api_key', description: 'Extra token for auth' },
        vault.encrypt('extra-token-value')
      );

      const task = db.createTask({
        templateId: 'slack-notify',
        name: 'Special Slack Alert',
        description: null,
        params: { message: 'Special alert' },
        scheduleType: 'once',
        scheduleValue: new Date(Date.now() + 60000).toISOString(),
        credentials: ['EXTRA_TOKEN'], // Task-level credential
        enabled: true,
      });

      const template = db.getTemplate(task.templateId);
      const result = injector.injectForTask(template?.requiredCredentials ?? [], task.credentials);

      expect(result.success).toBe(true);
      expect(result.credentials['SLACK_WEBHOOK_URL']).toBeDefined();
      expect(result.credentials['EXTRA_TOKEN']).toBe('extra-token-value');
    });

    it('should fail gracefully when credential is missing', () => {
      // Create task that requires a missing credential
      db.createTemplate({
        id: 'github-pr',
        name: 'GitHub PR',
        description: null,
        category: 'github',
        code: 'console.log("Creating PR");',
        paramsSchema: [],
        requiredCredentials: ['GITHUB_TOKEN'], // Not created
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const task = db.createTask({
        templateId: 'github-pr',
        name: 'Create PR',
        description: null,
        params: {},
        scheduleType: 'once',
        scheduleValue: new Date().toISOString(),
        credentials: [],
        enabled: true,
      });

      const template = db.getTemplate(task.templateId);
      const result = injector.injectForTask(template?.requiredCredentials ?? [], task.credentials);

      expect(result.success).toBe(false);
      expect(result.missing).toContain('GITHUB_TOKEN');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
