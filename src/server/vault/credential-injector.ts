import type { DatabaseService } from '../database/index.js';
import type { VaultService } from './index.js';

/**
 * Decrypted credentials object for task execution
 * Maps credential name to plaintext value
 */
export type CredentialsObject = Record<string, string>;

/**
 * Result of credential injection attempt
 */
export interface CredentialInjectionResult {
  success: boolean;
  credentials: CredentialsObject;
  missing: string[];
  errors: string[];
}

/**
 * CredentialInjector handles the secure retrieval and decryption of credentials
 * for task execution.
 *
 * Security Model:
 * - Credentials are decrypted in-memory only during task execution
 * - Decrypted values should be cleared from memory after execution
 * - Only explicitly requested credentials are decrypted
 * - Missing or invalid credentials are reported but don't halt execution
 *
 * Usage:
 * ```
 * const injector = new CredentialInjector(db, vault);
 * const result = injector.inject(['GITHUB_TOKEN', 'SLACK_WEBHOOK']);
 *
 * if (result.success) {
 *   // Execute task with result.credentials
 *   runTask(params, result.credentials);
 * }
 *
 * // After execution, clear from memory
 * injector.clear(result.credentials);
 * ```
 */
export class CredentialInjector {
  constructor(
    private db: DatabaseService,
    private vault: VaultService
  ) {}

  /**
   * Inject credentials for task execution
   * @param credentialNames List of credential names required for the task
   * @returns Injection result with decrypted credentials or error information
   */
  inject(credentialNames: string[]): CredentialInjectionResult {
    const credentials: CredentialsObject = {};
    const missing: string[] = [];
    const errors: string[] = [];

    if (credentialNames.length === 0) {
      return { success: true, credentials, missing, errors };
    }

    // Get all encrypted values in one query
    const encryptedValues = this.db.credentials.getEncryptedValues(credentialNames);

    for (const name of credentialNames) {
      const encryptedValue = encryptedValues.get(name);

      if (!encryptedValue) {
        // Check if credential exists but has no value vs doesn't exist at all
        if (this.db.credentials.exists(name)) {
          missing.push(name);
          errors.push(`Credential '${name}' exists but has no value stored`);
        } else {
          missing.push(name);
          errors.push(`Credential '${name}' not found`);
        }
        continue;
      }

      try {
        // Decrypt the credential value
        credentials[name] = this.vault.decrypt(encryptedValue);

        // Update last used timestamp (async-safe, non-blocking)
        this.db.credentials.updateLastUsed(name);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown decryption error';
        errors.push(`Failed to decrypt credential '${name}': ${errorMessage}`);
      }
    }

    return {
      success: missing.length === 0 && errors.length === 0,
      credentials,
      missing,
      errors,
    };
  }

  /**
   * Inject credentials required by a task (combines template and task-level credentials)
   * @param templateCredentials Credentials required by the template
   * @param taskCredentials Additional credentials specified at task level
   * @returns Injection result with all required credentials
   */
  injectForTask(
    templateCredentials: string[],
    taskCredentials: string[]
  ): CredentialInjectionResult {
    // Combine and deduplicate credential names
    const allCredentials = [...new Set([...templateCredentials, ...taskCredentials])];
    return this.inject(allCredentials);
  }

  /**
   * Validate that all required credentials are available (without decrypting)
   * Useful for pre-flight validation before task execution
   * @param credentialNames List of credential names to validate
   * @returns Object indicating which credentials are valid/missing
   */
  validate(credentialNames: string[]): { valid: string[]; missing: string[] } {
    const valid: string[] = [];
    const missing: string[] = [];

    for (const name of credentialNames) {
      if (this.db.credentials.hasValue(name)) {
        valid.push(name);
      } else {
        missing.push(name);
      }
    }

    return { valid, missing };
  }

  /**
   * Clear decrypted credentials from memory
   * Call this after task execution to minimize credential exposure time
   * @param credentials The credentials object to clear
   */
  clear(credentials: CredentialsObject): void {
    for (const key of Object.keys(credentials)) {
      // Overwrite the string value with empty string
      // Note: Due to JavaScript string immutability, this doesn't truly "zero out"
      // the original memory, but it removes the reference
      credentials[key] = '';
      delete credentials[key];
    }
  }
}

/**
 * Create a credentials object for task execution
 * This is a convenience function that combines injection and validation
 */
export function createCredentialsForExecution(
  db: DatabaseService,
  vault: VaultService,
  templateCredentials: string[],
  taskCredentials: string[]
): CredentialInjectionResult {
  const injector = new CredentialInjector(db, vault);
  return injector.injectForTask(templateCredentials, taskCredentials);
}

export default CredentialInjector;
