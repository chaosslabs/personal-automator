import type { Template, ParamDefinition } from '../../../shared/types.js';
import type { DatabaseInstance, TemplateRow } from '../types.js';

/**
 * Repository for template CRUD operations
 */
export class TemplateRepository {
  constructor(private db: DatabaseInstance) {}

  private rowToTemplate(row: TemplateRow): Template {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      code: row.code,
      paramsSchema: JSON.parse(row.params_schema) as ParamDefinition[],
      requiredCredentials: JSON.parse(row.required_credentials) as string[],
      suggestedSchedule: row.suggested_schedule,
      isBuiltin: row.is_builtin === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all templates, optionally filtered by category
   */
  getAll(category?: string): Template[] {
    let rows: TemplateRow[];

    if (category) {
      const query = 'SELECT * FROM templates WHERE category = ? ORDER BY name';
      rows = this.db.prepare<[string], TemplateRow>(query).all(category) as TemplateRow[];
    } else {
      const query = 'SELECT * FROM templates ORDER BY name';
      rows = this.db.prepare<[], TemplateRow>(query).all() as TemplateRow[];
    }

    return rows.map((row) => this.rowToTemplate(row));
  }

  /**
   * Get a single template by ID
   */
  getById(id: string): Template | null {
    const row = this.db
      .prepare<[string], TemplateRow>('SELECT * FROM templates WHERE id = ?')
      .get(id);
    return row ? this.rowToTemplate(row) : null;
  }

  /**
   * Create a new template
   */
  create(template: Omit<Template, 'createdAt' | 'updatedAt'>): Template {
    const now = new Date().toISOString();
    this.db
      .prepare<
        [string, string, string | null, string | null, string, string, string, string | null, number]
      >(
        `INSERT INTO templates (id, name, description, category, code, params_schema, required_credentials, suggested_schedule, is_builtin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        template.id,
        template.name,
        template.description,
        template.category,
        template.code,
        JSON.stringify(template.paramsSchema),
        JSON.stringify(template.requiredCredentials),
        template.suggestedSchedule,
        template.isBuiltin ? 1 : 0
      );

    return {
      ...template,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update an existing template
   */
  update(
    id: string,
    updates: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltin'>>
  ): Template | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = { ...existing, ...updates, updatedAt: now };

    this.db
      .prepare<[string, string | null, string | null, string, string, string, string | null, string, string]>(
        `UPDATE templates
       SET name = ?, description = ?, category = ?, code = ?,
           params_schema = ?, required_credentials = ?, suggested_schedule = ?, updated_at = ?
       WHERE id = ?`
      )
      .run(
        updated.name,
        updated.description,
        updated.category,
        updated.code,
        JSON.stringify(updated.paramsSchema),
        JSON.stringify(updated.requiredCredentials),
        updated.suggestedSchedule,
        now,
        id
      );

    return updated;
  }

  /**
   * Delete a template by ID
   */
  delete(id: string): boolean {
    const result = this.db.prepare<[string]>('DELETE FROM templates WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Check if a template exists
   */
  exists(id: string): boolean {
    const row = this.db
      .prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM templates WHERE id = ?')
      .get(id);
    return (row?.count ?? 0) > 0;
  }
}
