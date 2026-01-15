import type { Credential, CredentialType } from '../../../shared/types.js';
import type { DatabaseInstance, CredentialRow } from '../types.js';

/**
 * Repository for credential metadata CRUD operations
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
}
