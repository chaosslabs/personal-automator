/**
 * MCP Credential Tools
 *
 * Provides tools for managing credentials securely.
 * Values are encrypted at rest and never returned in API responses.
 */

import type { MCPServer } from '../index.js';
import { createSuccessResponse, createErrorResponse } from '../index.js';
import type { CredentialType } from '../../../shared/types.js';

/**
 * Add credential request arguments
 */
interface AddCredentialArgs {
  name: string;
  value: string;
  type?: CredentialType;
  description?: string;
}

/**
 * Delete credential request arguments
 */
interface DeleteCredentialArgs {
  name: string;
  force?: boolean;
}

/**
 * Register credential tools with the MCP server
 */
export function registerCredentialTools(server: MCPServer): void {
  const { db, vault } = server.getServices();

  // add_credential tool
  server.registerTool({
    tool: {
      name: 'add_credential',
      description: 'Store a new credential securely. The value is encrypted at rest.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Unique credential name (e.g., GITHUB_TOKEN, SLACK_WEBHOOK_URL)',
          },
          value: {
            type: 'string',
            description: 'Secret value (will be encrypted)',
          },
          type: {
            type: 'string',
            enum: ['api_key', 'oauth_token', 'env_var', 'secret'],
            description: 'Credential type (default: secret)',
          },
          description: {
            type: 'string',
            description: 'Human-readable description of what this credential is for',
          },
        },
        required: ['name', 'value'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { name, value, type, description } = args as unknown as AddCredentialArgs;

      try {
        // Check if credential already exists
        if (db.credentialExists(name)) {
          return Promise.resolve(
            createErrorResponse('credential_exists', `Credential '${name}' already exists`)
          );
        }

        // Encrypt the value
        const encryptedValue = vault.encrypt(value);

        // Create credential with encrypted value
        const credential = db.credentials.createWithValue(
          {
            name,
            type: type ?? 'secret',
            description: description ?? null,
          },
          encryptedValue
        );

        return Promise.resolve(
          createSuccessResponse({
            success: true,
            credential: {
              name: credential.name,
              type: credential.type,
              created_at: credential.createdAt,
            },
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add credential';
        return Promise.resolve(createErrorResponse('add_credential_error', message));
      }
    },
  });

  // list_credentials tool
  server.registerTool({
    tool: {
      name: 'list_credentials',
      description: 'List all stored credentials (values are never returned).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    handler: () => {
      try {
        // Get credentials with value status (but not actual values)
        const credentials = db.credentials.getAllWithValueStatus();

        // Get all tasks to determine credential usage
        const tasks = db.getTasks({});

        // Build usage map
        const usageMap = new Map<string, string[]>();
        for (const task of tasks) {
          for (const credName of task.credentials) {
            const existing = usageMap.get(credName) ?? [];
            existing.push(task.name);
            usageMap.set(credName, existing);
          }
          // Also check template required credentials
          const template = db.getTemplate(task.templateId);
          if (template) {
            for (const credName of template.requiredCredentials) {
              const existing = usageMap.get(credName) ?? [];
              if (!existing.includes(task.name)) {
                existing.push(task.name);
                usageMap.set(credName, existing);
              }
            }
          }
        }

        const response = {
          credentials: credentials.map((c) => ({
            name: c.name,
            type: c.type,
            description: c.description,
            has_value: c.hasValue,
            created_at: c.createdAt,
            last_used_at: c.lastUsedAt,
            used_by_tasks: usageMap.get(c.name) ?? [],
          })),
          total: credentials.length,
        };

        return Promise.resolve(createSuccessResponse(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list credentials';
        return Promise.resolve(createErrorResponse('list_credentials_error', message));
      }
    },
  });

  // delete_credential tool
  server.registerTool({
    tool: {
      name: 'delete_credential',
      description: 'Remove a credential from the vault.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Credential name to delete',
          },
          force: {
            type: 'boolean',
            description: 'Delete even if used by tasks (default: false)',
          },
        },
        required: ['name'],
      },
    },
    handler: (args: Record<string, unknown>) => {
      const { name, force } = args as unknown as DeleteCredentialArgs;

      try {
        const credential = db.getCredentialByName(name);
        if (!credential) {
          return Promise.resolve(
            createErrorResponse('credential_not_found', `Credential '${name}' not found`)
          );
        }

        // Check if credential is in use
        const inUse = db.getCredentialsInUse();
        if (inUse.includes(name)) {
          // Find which tasks use this credential
          const tasks = db.getTasks({});
          const usingTasks: string[] = [];

          for (const task of tasks) {
            // Check task credentials
            if (task.credentials.includes(name)) {
              usingTasks.push(task.name);
              continue;
            }
            // Check template required credentials
            const template = db.getTemplate(task.templateId);
            if (template?.requiredCredentials.includes(name)) {
              usingTasks.push(task.name);
            }
          }

          if (!force) {
            return Promise.resolve(
              createErrorResponse(
                'credential_in_use',
                `Credential '${name}' is used by ${usingTasks.length} tasks: ${usingTasks.join(', ')}. Use force=true to delete anyway.`
              )
            );
          }
        }

        // Delete the credential
        const deleted = db.deleteCredential(credential.id);
        if (!deleted) {
          return Promise.resolve(
            createErrorResponse('delete_credential_error', 'Failed to delete credential')
          );
        }

        return Promise.resolve(
          createSuccessResponse({
            success: true,
            deleted: {
              name,
            },
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete credential';
        return Promise.resolve(createErrorResponse('delete_credential_error', message));
      }
    },
  });
}
