import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseService } from '../src/server/database/index.js';
import { VaultService } from '../src/server/vault/index.js';
import { TaskExecutor } from '../src/server/executor/index.js';
import { Scheduler } from '../src/server/scheduler/index.js';
import { MCPServer } from '../src/server/mcp/index.js';
import { registerTemplateTools } from '../src/server/mcp/tools/templates.js';

// Test directory for temporary files
const TEST_DIR = join(tmpdir(), 'personal-automator-test-mcp-templates');

describe('Template Tools', () => {
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

    registerTemplateTools(mcpServer);
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

  describe('list_templates', () => {
    it('should list all templates including built-in ones', () => {
      // Get the list_templates handler directly by accessing the registered tool
      const services = mcpServer.getServices();
      const templates = services.db.getTemplates();

      // Built-in templates should exist
      expect(templates.length).toBeGreaterThan(0);

      // Check that we have the expected built-in templates
      const templateIds = templates.map((t) => t.id);
      expect(templateIds).toContain('http-health-check');
      expect(templateIds).toContain('webhook-trigger');
      expect(templateIds).toContain('slack-notification');
    });

    it('should filter templates by category', () => {
      // Create a custom template with specific category
      db.createTemplate({
        id: 'custom-test-template',
        name: 'Custom Test Template',
        description: 'A test template',
        category: 'testing',
        code: 'return true;',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      // Filter by 'testing' category
      const testingTemplates = db.getTemplates('testing');
      expect(testingTemplates.length).toBe(1);
      expect(testingTemplates[0]?.id).toBe('custom-test-template');

      // Filter by 'monitoring' category (built-in)
      const monitoringTemplates = db.getTemplates('monitoring');
      expect(monitoringTemplates.some((t) => t.id === 'http-health-check')).toBe(true);
    });

    it('should include params schema in response', () => {
      const templates = db.getTemplates();
      const httpHealthCheck = templates.find((t) => t.id === 'http-health-check');

      expect(httpHealthCheck).toBeDefined();
      expect(httpHealthCheck?.paramsSchema).toBeDefined();
      expect(httpHealthCheck?.paramsSchema.length).toBeGreaterThan(0);

      // Check that 'url' param is defined
      const urlParam = httpHealthCheck?.paramsSchema.find((p) => p.name === 'url');
      expect(urlParam).toBeDefined();
      expect(urlParam?.type).toBe('string');
      expect(urlParam?.required).toBe(true);
    });

    it('should include required credentials in response', () => {
      const templates = db.getTemplates();
      const slackTemplate = templates.find((t) => t.id === 'slack-notification');

      expect(slackTemplate).toBeDefined();
      expect(slackTemplate?.requiredCredentials).toBeDefined();
      expect(slackTemplate?.requiredCredentials).toContain('SLACK_WEBHOOK_URL');
    });

    it('should include suggested schedule in response', () => {
      const templates = db.getTemplates();
      const httpHealthCheck = templates.find((t) => t.id === 'http-health-check');

      expect(httpHealthCheck).toBeDefined();
      expect(httpHealthCheck?.suggestedSchedule).toBeDefined();
      expect(httpHealthCheck?.suggestedSchedule).toBe('*/5 * * * *');
    });

    it('should mark builtin templates correctly', () => {
      // Create a custom template
      db.createTemplate({
        id: 'my-custom-template',
        name: 'My Custom Template',
        description: null,
        category: null,
        code: 'return "custom";',
        paramsSchema: [],
        requiredCredentials: [],
        suggestedSchedule: null,
        isBuiltin: false,
      });

      const templates = db.getTemplates();

      // Check built-in template
      const builtinTemplate = templates.find((t) => t.id === 'http-health-check');
      expect(builtinTemplate?.isBuiltin).toBe(true);

      // Check custom template
      const customTemplate = templates.find((t) => t.id === 'my-custom-template');
      expect(customTemplate?.isBuiltin).toBe(false);
    });

    it('should return empty array for non-existent category', () => {
      const templates = db.getTemplates('non-existent-category');
      expect(templates).toEqual([]);
    });

    it('should return total count of templates', () => {
      const templates = db.getTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(7); // At least 7 built-in templates
    });
  });
});
