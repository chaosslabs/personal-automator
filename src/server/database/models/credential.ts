import type { Credential, CredentialType } from '../../../shared/types.js';
import type { DatabaseInstance, CredentialRow } from '../types.js';

/**
 * Extended credential with encrypted value presence indicator
 */
export interface CredentialWithValueStatus extends Credential {
  hasValue: boolean;
}

/**
 * Repository for credential metadata and encrypted value CRUD operations
 *
 * Security Note:
 * - Credential values are stored encrypted (AES-256-GCM)
 * - Encrypted values should NEVER be returned in public API responses
 * - Only use getEncryptedValue() internally for task execution
 */
export class CredentialRepository {
  constructor(private db: DatabaseInstance) {}

  private rowToCredential(row: CredentialRow): Credential {
    return {
      id: row.id,
      name: row.name,
      type: row.type as CredentialType,
      description: row.description,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  private rowToCredentialWithValueStatus(row: CredentialRow): CredentialWithValueStatus {
    return {
      ...this.rowToCredential(row),
      hasValue: row.encrypted_value !== null,
    };
  }

  /**
   * Get all credentials (metadata only, not values)
   */
  getAll(): Credential[] {
    const rows = this.db
      .prepare<[], CredentialRow>('SELECT * FROM credentials ORDER BY name')
      .all();
    return rows.map((row) => this.rowToCredential(row));
  }

  /**
   * Get a single credential by ID
   */
  getById(id: number): Credential | null {
    const row = this.db
      .prepare<[number], CredentialRow>('SELECT * FROM credentials WHERE id = ?')
      .get(id);
    return row ? this.rowToCredential(row) : null;
  }

  /**
   * Get a credential by name
   */
  getByName(name: string): Credential | null {
    const row = this.db
      .prepare<[string], CredentialRow>('SELECT * FROM credentials WHERE name = ?')
      .get(name);
    return row ? this.rowToCredential(row) : null;
  }

  /**
   * Create credential metadata (value stored separately)
   */
  create(credential: Omit<Credential, 'id' | 'createdAt' | 'lastUsedAt'>): Credential {
    const now = new Date().toISOString();
    const result = this.db
      .prepare<
        [string, string, string | null]
      >('INSERT INTO credentials (name, type, description) VALUES (?, ?, ?)')
      .run(credential.name, credential.type, credential.description);

    return {
      id: Number(result.lastInsertRowid),
      name: credential.name,
      type: credential.type,
      description: credential.description,
      createdAt: now,
      lastUsedAt: null,
    };
  }

  /**
   * Update credential metadata
   */
  update(id: number, updates: Partial<Omit<Credential, 'id' | 'createdAt'>>): Credential | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };

    this.db
      .prepare<
        [string | null, string | null, number]
      >('UPDATE credentials SET description = ?, last_used_at = ? WHERE id = ?')
      .run(updated.description, updated.lastUsedAt, id);

    return updated;
  }

  /**
   * Delete credential metadata
   */
  delete(id: number): boolean {
    const result = this.db.prepare<[number]>('DELETE FROM credentials WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Check if credential exists by name
   */
  exists(name: string): boolean {
    const row = this.db
      .prepare<
        [string],
        { count: number }
      >('SELECT COUNT(*) as count FROM credentials WHERE name = ?')
      .get(name);
    return (row?.count ?? 0) > 0;
  }

  /**
   * Update credential last used time
   */
  updateLastUsed(name: string): void {
    this.db
      .prepare<[string]>("UPDATE credentials SET last_used_at = datetime('now') WHERE name = ?")
      .run(name);
  }

  /**
   * Get credentials that are in use by tasks
   */
  getInUse(): string[] {
    const rows = this.db
      .prepare<
        [],
        { credentials: string }
      >("SELECT DISTINCT credentials FROM tasks WHERE credentials != '[]'")
      .all();

    const allCredentials = new Set<string>();
    for (const row of rows) {
      const creds = JSON.parse(row.credentials) as string[];
      for (const cred of creds) {
        allCredentials.add(cred);
      }
    }

    // Also check required_credentials in templates that are used by tasks
    const templateRows = this.db
      .prepare<[], { required_credentials: string }>(
        `SELECT DISTINCT t.required_credentials
         FROM templates t
         INNER JOIN tasks tk ON tk.template_id = t.id
         WHERE t.required_credentials != '[]'`
      )
      .all();

    for (const row of templateRows) {
      const creds = JSON.parse(row.required_credentials) as string[];
      for (const cred of creds) {
        allCredentials.add(cred);
      }
    }

    return Array.from(allCredentials);
  }

  // ============================================
  // Encrypted Value Operations
  // These methods handle the secure storage of credential values
  // ============================================

  /**
   * Get all credentials with value status (indicates if value is stored)
   * Does NOT return the actual encrypted values
   */
  getAllWithValueStatus(): CredentialWithValueStatus[] {
    const rows = this.db
      .prepare<[], CredentialRow>('SELECT * FROM credentials ORDER BY name')
      .all();
    return rows.map((row) => this.rowToCredentialWithValueStatus(row));
  }

  /**
   * Store an encrypted credential value
   * @param name Credential name
   * @param encryptedValue Base64-encoded encrypted value
   */
  storeEncryptedValue(name: string, encryptedValue: string): boolean {
    const result = this.db
      .prepare<[string, string]>('UPDATE credentials SET encrypted_value = ? WHERE name = ?')
      .run(encryptedValue, name);
    return result.changes > 0;
  }

  /**
   * Get the encrypted value for a credential
   * WARNING: Only use internally for task execution, never expose via API
   * @param name Credential name
   * @returns Base64-encoded encrypted value or null if not found
   */
  getEncryptedValue(name: string): string | null {
    const row = this.db
      .prepare<
        [string],
        { encrypted_value: string | null }
      >('SELECT encrypted_value FROM credentials WHERE name = ?')
      .get(name);
    return row?.encrypted_value ?? null;
  }

  /**
   * Get encrypted values for multiple credentials
   * WARNING: Only use internally for task execution, never expose via API
   * @param names List of credential names
   * @returns Map of credential name to encrypted value
   */
  getEncryptedValues(names: string[]): Map<string, string> {
    const result = new Map<string, string>();
    if (names.length === 0) return result;

    const placeholders = names.map(() => '?').join(',');
    const rows = this.db
      .prepare<
        string[],
        { name: string; encrypted_value: string | null }
      >(`SELECT name, encrypted_value FROM credentials WHERE name IN (${placeholders})`)
      .all(...names);

    for (const row of rows) {
      if (row.encrypted_value !== null) {
        result.set(row.name, row.encrypted_value);
      }
    }

    return result;
  }

  /**
   * Check if a credential has a stored value
   */
  hasValue(name: string): boolean {
    const row = this.db
      .prepare<
        [string],
        { has_value: number }
      >('SELECT (encrypted_value IS NOT NULL) as has_value FROM credentials WHERE name = ?')
      .get(name);
    return row?.has_value === 1;
  }

  /**
   * Clear the encrypted value for a credential (without deleting metadata)
   */
  clearEncryptedValue(name: string): boolean {
    const result = this.db
      .prepare<[string]>('UPDATE credentials SET encrypted_value = NULL WHERE name = ?')
      .run(name);
    return result.changes > 0;
  }

  /**
   * Create credential with encrypted value in a single operation
   */
  createWithValue(
    credential: Omit<Credential, 'id' | 'createdAt' | 'lastUsedAt'>,
    encryptedValue: string
  ): Credential {
    const now = new Date().toISOString();
    const result = this.db
      .prepare<
        [string, string, string | null, string]
      >('INSERT INTO credentials (name, type, description, encrypted_value) VALUES (?, ?, ?, ?)')
      .run(credential.name, credential.type, credential.description, encryptedValue);

    return {
      id: Number(result.lastInsertRowid),
      name: credential.name,
      type: credential.type,
      description: credential.description,
      createdAt: now,
      lastUsedAt: null,
    };
  }

  /**
   * Update credential value (store new encrypted value)
   */
  updateValue(name: string, encryptedValue: string): boolean {
    const result = this.db
      .prepare<
        [string, string]
      >("UPDATE credentials SET encrypted_value = ?, last_used_at = datetime('now') WHERE name = ?")
      .run(encryptedValue, name);
    return result.changes > 0;
  }
}
