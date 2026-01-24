import type { Template } from '../../shared/types';

interface ExportTemplate {
  name: string;
  description: string | null;
  category: string | null;
  code: string;
  paramsSchema: Template['paramsSchema'];
  requiredCredentials: string[];
  suggestedSchedule: string | null;
}

export function exportTemplate(template: Template): void {
  const exportData: ExportTemplate = {
    name: template.name,
    description: template.description,
    category: template.category,
    code: template.code,
    paramsSchema: template.paramsSchema,
    requiredCredentials: template.requiredCredentials,
    suggestedSchedule: template.suggestedSchedule,
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${template.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importTemplate(): Promise<Partial<Template>> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data: unknown = JSON.parse(event.target?.result as string);

          // Validate that data is an object
          if (typeof data !== 'object' || data === null) {
            throw new Error('Invalid template: must be an object');
          }

          const obj = data as Record<string, unknown>;

          // Validate required fields
          if (!obj['name'] || typeof obj['name'] !== 'string') {
            throw new Error('Invalid template: missing or invalid name');
          }
          if (!obj['code'] || typeof obj['code'] !== 'string') {
            throw new Error('Invalid template: missing or invalid code');
          }

          // Validate paramsSchema
          if (obj['paramsSchema'] && !Array.isArray(obj['paramsSchema'])) {
            throw new Error('Invalid template: paramsSchema must be an array');
          }

          // Validate requiredCredentials
          if (obj['requiredCredentials'] && !Array.isArray(obj['requiredCredentials'])) {
            throw new Error('Invalid template: requiredCredentials must be an array');
          }

          const template: Partial<Template> = {
            name: obj['name'],
            description: (obj['description'] as string | null | undefined) || null,
            category: (obj['category'] as string | null | undefined) || null,
            code: obj['code'],
            paramsSchema: (obj['paramsSchema'] as Template['paramsSchema'] | undefined) || [],
            requiredCredentials: (obj['requiredCredentials'] as string[] | undefined) || [],
            suggestedSchedule: (obj['suggestedSchedule'] as string | null | undefined) || null,
          };

          resolve(template);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    };

    input.click();
  });
}

export function exportMultipleTemplates(templates: Template[]): void {
  const exportData = templates.map((template) => ({
    name: template.name,
    description: template.description,
    category: template.category,
    code: template.code,
    paramsSchema: template.paramsSchema,
    requiredCredentials: template.requiredCredentials,
    suggestedSchedule: template.suggestedSchedule,
  }));

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'templates.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importMultipleTemplates(): Promise<Partial<Template>[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data: unknown = JSON.parse(event.target?.result as string);

          if (!Array.isArray(data)) {
            throw new Error('Invalid file: expected an array of templates');
          }

          const templates: Partial<Template>[] = data.map((item: unknown, index) => {
            if (typeof item !== 'object' || item === null) {
              throw new Error(`Invalid template at index ${index}: must be an object`);
            }

            const obj = item as Record<string, unknown>;

            if (!obj['name'] || typeof obj['name'] !== 'string') {
              throw new Error(`Invalid template at index ${index}: missing or invalid name`);
            }
            if (!obj['code'] || typeof obj['code'] !== 'string') {
              throw new Error(`Invalid template at index ${index}: missing or invalid code`);
            }

            return {
              name: obj['name'],
              description: (obj['description'] as string | null | undefined) || null,
              category: (obj['category'] as string | null | undefined) || null,
              code: obj['code'],
              paramsSchema: (obj['paramsSchema'] as Template['paramsSchema'] | undefined) || [],
              requiredCredentials: (obj['requiredCredentials'] as string[] | undefined) || [],
              suggestedSchedule: (obj['suggestedSchedule'] as string | null | undefined) || null,
            };
          });

          resolve(templates);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    };

    input.click();
  });
}
