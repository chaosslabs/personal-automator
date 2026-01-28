import type { User, AuthProvider } from '../../../shared/types.js';
import type { DatabaseInstance, UserRow } from '../types.js';

/**
 * Repository for user CRUD operations
 */
export class UserRepository {
  constructor(private db: DatabaseInstance) {}

  private rowToUser(row: UserRow): User {
    return {
      id: row.id,
      provider: row.provider as AuthProvider,
      providerId: row.provider_id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }

  /**
   * Get all users
   */
  getAll(): User[] {
    const rows = this.db.prepare<[], UserRow>('SELECT * FROM users ORDER BY created_at DESC').all();
    return rows.map((row) => this.rowToUser(row));
  }

  /**
   * Get a user by ID
   */
  getById(id: number): User | null {
    const row = this.db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this.rowToUser(row) : null;
  }

  /**
   * Get a user by provider and provider ID (used for OAuth)
   */
  getByProviderId(provider: AuthProvider, providerId: string): User | null {
    const row = this.db
      .prepare<
        [string, string],
        UserRow
      >('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
      .get(provider, providerId);
    return row ? this.rowToUser(row) : null;
  }

  /**
   * Get a user by email
   */
  getByEmail(email: string): User | null {
    const row = this.db
      .prepare<[string], UserRow>('SELECT * FROM users WHERE email = ?')
      .get(email);
    return row ? this.rowToUser(row) : null;
  }

  /**
   * Create a new user
   */
  create(user: Omit<User, 'id' | 'createdAt' | 'lastLoginAt'>): User {
    const now = new Date().toISOString();
    const result = this.db
      .prepare<
        [string, string, string | null, string | null, string | null]
      >('INSERT INTO users (provider, provider_id, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)')
      .run(user.provider, user.providerId, user.email, user.name, user.avatarUrl);

    return {
      id: Number(result.lastInsertRowid),
      provider: user.provider,
      providerId: user.providerId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: now,
      lastLoginAt: now,
    };
  }

  /**
   * Update user's last login time
   */
  updateLastLogin(id: number): void {
    this.db
      .prepare<[number]>("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
      .run(id);
  }

  /**
   * Update user profile information
   */
  update(id: number, updates: Partial<Pick<User, 'email' | 'name' | 'avatarUrl'>>): User | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };

    this.db
      .prepare<
        [string | null, string | null, string | null, number]
      >('UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE id = ?')
      .run(updated.email, updated.name, updated.avatarUrl, id);

    return updated;
  }

  /**
   * Delete a user
   */
  delete(id: number): boolean {
    const result = this.db.prepare<[number]>('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Find or create a user based on OAuth profile
   * This is the main method used during OAuth authentication
   */
  findOrCreate(profile: Omit<User, 'id' | 'createdAt' | 'lastLoginAt'>): User {
    const existing = this.getByProviderId(profile.provider, profile.providerId);

    if (existing) {
      // Update last login time
      this.updateLastLogin(existing.id);
      // Optionally update profile info if changed
      return (
        this.update(existing.id, {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        }) ?? existing
      );
    }

    return this.create(profile);
  }

  /**
   * Get user count
   */
  getCount(): number {
    const row = this.db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM users').get();
    return row?.count ?? 0;
  }
}
