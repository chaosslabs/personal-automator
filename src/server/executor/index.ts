import { createContext, runInContext, type Context } from 'vm';
import type { DatabaseService } from '../database/index.js';
import type { VaultService } from '../vault/index.js';
import { CredentialInjector, type CredentialsObject } from '../vault/credential-injector.js';
import type { Task, Template, Execution, ExecutionOutput } from '../../shared/types.js';
import {
  DEFAULT_EXECUTION_TIMEOUT_MS,
  MAX_EXECUTION_TIMEOUT_MS,
  MAX_CONSOLE_OUTPUT_SIZE,
} from '../../shared/constants.js';

/**
 * Result of task execution
 */
export interface ExecutionResult {
  success: boolean;
  execution: Execution;
  output: ExecutionOutput;
  error?: string;
}

/**
 * Options for task execution
 */
export interface ExecuteOptions {
  timeoutMs?: number;
}

/**
 * Console capture utility for capturing console output during execution
 */
class ConsoleCapture {
  private logs: string[] = [];
  private totalSize = 0;
  private truncated = false;

  /**
   * Create a console capture object with logging methods
   */
  createConsole(): Pick<Console, 'log' | 'warn' | 'error' | 'info' | 'debug'> {
    return {
      log: (...args: unknown[]) => this.capture('LOG', args),
      warn: (...args: unknown[]) => this.capture('WARN', args),
      error: (...args: unknown[]) => this.capture('ERROR', args),
      info: (...args: unknown[]) => this.capture('INFO', args),
      debug: (...args: unknown[]) => this.capture('DEBUG', args),
    };
  }

  private capture(level: string, args: unknown[]): void {
    if (this.truncated) return;

    const timestamp = new Date().toISOString();
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    const line = `[${timestamp}] [${level}] ${message}`;

    // Check if we've exceeded the max output size
    if (this.totalSize + line.length > MAX_CONSOLE_OUTPUT_SIZE) {
      this.logs.push('[OUTPUT TRUNCATED - exceeded maximum size]');
      this.truncated = true;
      return;
    }

    this.logs.push(line);
    this.totalSize += line.length;
  }

  /**
   * Get all captured logs
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Check if output was truncated
   */
  wasTruncated(): boolean {
    return this.truncated;
  }
}

/**
 * Execution error with additional context
 */
export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'EXECUTION_ERROR' | 'VALIDATION_ERROR' | 'CREDENTIAL_ERROR',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

/**
 * TaskExecutor handles the execution of tasks with proper isolation,
 * console capture, timeout handling, and result persistence.
 */
export class TaskExecutor {
  private db: DatabaseService;
  private credentialInjector: CredentialInjector;

  constructor(db: DatabaseService, vault: VaultService) {
    this.db = db;
    this.credentialInjector = new CredentialInjector(db, vault);
  }

  /**
   * Execute a task by ID
   * @param taskId The task ID to execute
   * @param options Execution options
   * @returns Execution result
   */
  async execute(taskId: number, options: ExecuteOptions = {}): Promise<ExecutionResult> {
    // Load task
    const task = this.db.getTask(taskId);
    if (!task) {
      throw new ExecutionError(`Task with ID ${taskId} not found`, 'VALIDATION_ERROR');
    }

    // Load template
    const template = this.db.getTemplate(task.templateId);
    if (!template) {
      throw new ExecutionError(
        `Template '${task.templateId}' not found for task '${task.name}'`,
        'VALIDATION_ERROR'
      );
    }

    return this.executeTask(task, template, options);
  }

  /**
   * Execute a task with its template
   * @param task The task to execute
   * @param template The template containing the code to run
   * @param options Execution options
   * @returns Execution result
   */
  async executeTask(
    task: Task,
    template: Template,
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    // Create execution record
    const execution = this.db.createExecution(task.id);

    // Set up console capture
    const consoleCapture = new ConsoleCapture();

    // Calculate timeout
    const timeoutMs = Math.min(
      options.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS,
      MAX_EXECUTION_TIMEOUT_MS
    );

    let credentials: CredentialsObject = {};

    try {
      // Inject credentials
      const credentialResult = this.credentialInjector.injectForTask(
        template.requiredCredentials,
        task.credentials
      );

      if (!credentialResult.success) {
        const errorMessage = credentialResult.errors.join('; ');
        throw new ExecutionError(
          `Failed to inject credentials: ${errorMessage}`,
          'CREDENTIAL_ERROR'
        );
      }

      credentials = credentialResult.credentials;

      // Execute the template code
      const result = await this.executeCode(
        template.code,
        task.params,
        credentials,
        consoleCapture,
        timeoutMs
      );

      // Build output
      const output: ExecutionOutput = {
        console: consoleCapture.getLogs(),
        result,
      };

      // Update execution record with success
      const finishedAt = new Date().toISOString();
      const updatedExecution = this.db.updateExecution(execution.id, {
        status: 'success',
        output,
        finishedAt,
      });

      // Update task last run time
      this.db.updateTaskLastRun(task.id, finishedAt, null);

      return {
        success: true,
        execution: updatedExecution ?? execution,
        output,
      };
    } catch (error) {
      // Determine error type and status
      const isTimeout =
        error instanceof ExecutionError && error.code === 'TIMEOUT';
      const status = isTimeout ? 'timeout' : 'failed';

      // Build error message
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Build output with any console logs captured before error
      const output: ExecutionOutput = {
        console: consoleCapture.getLogs(),
        result: null,
      };

      // Update execution record with failure
      const finishedAt = new Date().toISOString();
      const updatedExecution = this.db.updateExecution(execution.id, {
        status,
        output,
        error: errorMessage,
        finishedAt,
      });

      // Update task last run time even on failure
      this.db.updateTaskLastRun(task.id, finishedAt, null);

      return {
        success: false,
        execution: updatedExecution ?? execution,
        output,
        error: errorMessage,
      };
    } finally {
      // Clear credentials from memory
      this.credentialInjector.clear(credentials);
    }
  }

  /**
   * Execute template code in a sandboxed context
   */
  private async executeCode(
    code: string,
    params: Record<string, unknown>,
    credentials: CredentialsObject,
    consoleCapture: ConsoleCapture,
    timeoutMs: number
  ): Promise<unknown> {
    // Create sandbox context with available APIs
    const sandbox: Context = {
      // Task context
      params,
      credentials,

      // Console capture
      console: consoleCapture.createConsole(),

      // Node.js built-ins needed for templates
      require: this.createSafeRequire(),
      fetch: globalThis.fetch,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      Buffer: Buffer,
      URL: URL,
      URLSearchParams: URLSearchParams,
      AbortController: AbortController,

      // Promise support
      Promise: Promise,

      // Date for timestamps
      Date: Date,

      // JSON utilities
      JSON: JSON,

      // Error types
      Error: Error,
      TypeError: TypeError,
      RangeError: RangeError,
      SyntaxError: SyntaxError,

      // Common globals
      undefined: undefined,
      null: null,
      NaN: NaN,
      Infinity: Infinity,
      isNaN: isNaN,
      isFinite: isFinite,
      parseInt: parseInt,
      parseFloat: parseFloat,
      encodeURI: encodeURI,
      decodeURI: decodeURI,
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent,

      // Object utilities
      Object: Object,
      Array: Array,
      Map: Map,
      Set: Set,
      WeakMap: WeakMap,
      WeakSet: WeakSet,

      // Math and numbers
      Math: Math,
      Number: Number,
      BigInt: BigInt,

      // String and regex
      String: String,
      RegExp: RegExp,

      // Symbol
      Symbol: Symbol,

      // Typed arrays (useful for binary data)
      ArrayBuffer: ArrayBuffer,
      SharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined,
      DataView: DataView,
      Uint8Array: Uint8Array,
      Int8Array: Int8Array,
      Uint16Array: Uint16Array,
      Int16Array: Int16Array,
      Uint32Array: Uint32Array,
      Int32Array: Int32Array,
      Float32Array: Float32Array,
      Float64Array: Float64Array,
      BigInt64Array: BigInt64Array,
      BigUint64Array: BigUint64Array,

      // Text encoding
      TextEncoder: TextEncoder,
      TextDecoder: TextDecoder,

      // Console output reference for result
      __result: undefined as unknown,
    };

    // Create the execution context
    const context = createContext(sandbox);

    // Wrap the code in an async function to support await
    const wrappedCode = `
      (async () => {
        ${code}
      })()
    `;

    // Execute with timeout
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;
      let completed = false;

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(
            new ExecutionError(
              `Execution timed out after ${timeoutMs}ms`,
              'TIMEOUT'
            )
          );
        }
      }, timeoutMs);

      // Execute the code
      try {
        const resultPromise: unknown = runInContext(wrappedCode, context, {
          timeout: timeoutMs,
          displayErrors: true,
        });

        // Handle async result
        Promise.resolve(resultPromise)
          .then((result) => {
            if (!completed) {
              completed = true;
              if (timeoutId) clearTimeout(timeoutId);
              resolve(result);
            }
          })
          .catch((error: unknown) => {
            if (!completed) {
              completed = true;
              if (timeoutId) clearTimeout(timeoutId);
              const errorMessage = error instanceof Error ? error.message : 'Execution failed';
              const errorCause = error instanceof Error ? error : undefined;
              reject(
                new ExecutionError(
                  errorMessage,
                  'EXECUTION_ERROR',
                  errorCause
                )
              );
            }
          });
      } catch (error) {
        if (!completed) {
          completed = true;
          if (timeoutId) clearTimeout(timeoutId);
          const err = error as Error;
          reject(
            new ExecutionError(
              err.message || 'Execution failed',
              'EXECUTION_ERROR',
              err
            )
          );
        }
      }
    });
  }

  /**
   * Create a safe require function that only allows whitelisted modules
   */
  private createSafeRequire(): NodeRequire {
    // Whitelist of allowed modules
    const allowedModules = new Set([
      // Node.js built-ins commonly needed for tasks
      'child_process',
      'util',
      'path',
      'fs',
      'fs/promises',
      'os',
      'crypto',
      'url',
      'querystring',
      'stream',
      'events',
      'buffer',
      'string_decoder',
      'http',
      'https',
      'zlib',
      'assert',
    ]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const originalRequire = require;

    const safeRequire = ((id: string): unknown => {
      if (!allowedModules.has(id)) {
        throw new Error(`Module '${id}' is not allowed. Allowed modules: ${[...allowedModules].join(', ')}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return originalRequire(id);
    }) as NodeRequire;

    // Copy over require properties
    safeRequire.resolve = originalRequire.resolve;
    safeRequire.cache = originalRequire.cache;
    safeRequire.extensions = originalRequire.extensions;
    safeRequire.main = originalRequire.main;

    return safeRequire;
  }

  /**
   * Validate task parameters against template schema
   */
  validateParams(task: Task, template: Template): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const param of template.paramsSchema) {
      const value = task.params[param.name];

      if (param.required && value === undefined) {
        errors.push(`Required parameter '${param.name}' is missing`);
        continue;
      }

      if (value !== undefined) {
        const actualType = typeof value;
        if (actualType !== param.type) {
          errors.push(
            `Parameter '${param.name}' has type '${actualType}', expected '${param.type}'`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Pre-flight check for task execution (validates without running)
   */
  preflight(taskId: number): {
    valid: boolean;
    task: Task | null;
    template: Template | null;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Load task
    const task = this.db.getTask(taskId);
    if (!task) {
      return {
        valid: false,
        task: null,
        template: null,
        errors: [`Task with ID ${taskId} not found`],
        warnings,
      };
    }

    // Load template
    const template = this.db.getTemplate(task.templateId);
    if (!template) {
      return {
        valid: false,
        task,
        template: null,
        errors: [`Template '${task.templateId}' not found`],
        warnings,
      };
    }

    // Validate parameters
    const paramValidation = this.validateParams(task, template);
    errors.push(...paramValidation.errors);

    // Validate credentials (without decrypting)
    const allCredentials = [...new Set([...template.requiredCredentials, ...task.credentials])];
    const credentialValidation = this.credentialInjector.validate(allCredentials);

    for (const missing of credentialValidation.missing) {
      errors.push(`Credential '${missing}' is missing or has no value`);
    }

    // Add warnings for disabled task
    if (!task.enabled) {
      warnings.push('Task is currently disabled');
    }

    return {
      valid: errors.length === 0,
      task,
      template,
      errors,
      warnings,
    };
  }
}

// Singleton instance
let executorInstance: TaskExecutor | null = null;

/**
 * Get the task executor instance
 */
export function getExecutor(db: DatabaseService, vault: VaultService): TaskExecutor {
  if (!executorInstance) {
    executorInstance = new TaskExecutor(db, vault);
  }
  return executorInstance;
}

/**
 * Close/clear the executor (for testing/cleanup)
 */
export function closeExecutor(): void {
  executorInstance = null;
}

export default TaskExecutor;
