import { describe, it, expect } from 'vitest';
import { builtinTemplates } from './builtin-templates.js';

describe('builtinTemplates', () => {
  it('should have at least one template', () => {
    expect(builtinTemplates.length).toBeGreaterThan(0);
  });

  it('should have unique template ids', () => {
    const ids = builtinTemplates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have unique template names', () => {
    const names = builtinTemplates.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  describe('each template', () => {
    builtinTemplates.forEach((template) => {
      describe(`${template.name}`, () => {
        it('should have an id', () => {
          expect(template.id).toBeDefined();
          expect(template.id.length).toBeGreaterThan(0);
        });

        it('should have a name', () => {
          expect(template.name).toBeDefined();
          expect(template.name.length).toBeGreaterThan(0);
        });

        it('should have a description', () => {
          expect(template.description).toBeDefined();
          expect(template.description.length).toBeGreaterThan(0);
        });

        it('should have a category', () => {
          expect(template.category).toBeDefined();
          expect(template.category.length).toBeGreaterThan(0);
        });

        it('should have code', () => {
          expect(template.code).toBeDefined();
          expect(template.code.length).toBeGreaterThan(0);
        });

        it('should have valid paramsSchema', () => {
          expect(Array.isArray(template.paramsSchema)).toBe(true);
          template.paramsSchema.forEach((param) => {
            expect(param.name).toBeDefined();
            expect(['string', 'number', 'boolean']).toContain(param.type);
            expect(typeof param.required).toBe('boolean');
          });
        });

        it('should have valid requiredCredentials', () => {
          expect(Array.isArray(template.requiredCredentials)).toBe(true);
          template.requiredCredentials.forEach((cred) => {
            expect(typeof cred).toBe('string');
            expect(cred.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });
});
