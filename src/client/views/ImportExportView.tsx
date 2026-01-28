import { useState, useRef } from 'react';
import type { ParamDefinition, CredentialType } from '../../shared/types';
import { api } from '../utils/api';
import '../styles/import-export.css';

interface ExportData {
  version: string;
  exportedAt: string;
  tasks: TaskExport[];
  templates: TemplateExport[];
  credentials: CredentialExport[];
}

interface TaskExport {
  templateId: string;
  name: string;
  description: string | null;
  params: Record<string, unknown>;
  scheduleType: string;
  scheduleValue: string;
  credentials: string[];
  enabled: boolean;
}

interface TemplateExport {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  code: string;
  paramsSchema: unknown[];
  requiredCredentials: string[];
  suggestedSchedule: string | null;
  isBuiltin: boolean;
}

interface CredentialExport {
  name: string;
  type: string;
  description: string | null;
}

export function ImportExportView() {
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showStatus = (message: string, type: 'success' | 'error' | 'info') => {
    setStatus(message);
    setStatusType(type);
  };

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTasks = async () => {
    setExporting(true);
    try {
      const tasks = await api.getTasks();
      const exportData = tasks.map((task) => ({
        templateId: task.templateId,
        name: task.name,
        description: task.description,
        params: task.params,
        scheduleType: task.scheduleType,
        scheduleValue: task.scheduleValue,
        credentials: task.credentials,
        enabled: task.enabled,
      }));
      downloadJson(exportData, `tasks-${new Date().toISOString().slice(0, 10)}.json`);
      showStatus(`Exported ${tasks.length} tasks`, 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Failed to export tasks', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportTemplates = async () => {
    setExporting(true);
    try {
      const templates = await api.getTemplates();
      const exportData = templates
        .filter((t) => !t.isBuiltin)
        .map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          code: t.code,
          paramsSchema: t.paramsSchema,
          requiredCredentials: t.requiredCredentials,
          suggestedSchedule: t.suggestedSchedule,
          isBuiltin: false,
        }));
      downloadJson(exportData, `templates-${new Date().toISOString().slice(0, 10)}.json`);
      showStatus(`Exported ${exportData.length} custom templates`, 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Failed to export templates', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const [tasks, templates, credentials] = await Promise.all([
        api.getTasks(),
        api.getTemplates(),
        api.getCredentials(),
      ]);

      const exportData: ExportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        tasks: tasks.map((task) => ({
          templateId: task.templateId,
          name: task.name,
          description: task.description,
          params: task.params,
          scheduleType: task.scheduleType,
          scheduleValue: task.scheduleValue,
          credentials: task.credentials,
          enabled: task.enabled,
        })),
        templates: templates
          .filter((t) => !t.isBuiltin)
          .map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            category: t.category,
            code: t.code,
            paramsSchema: t.paramsSchema,
            requiredCredentials: t.requiredCredentials,
            suggestedSchedule: t.suggestedSchedule,
            isBuiltin: false,
          })),
        credentials: credentials.map((c) => ({
          name: c.name,
          type: c.type,
          description: c.description,
        })),
      };

      downloadJson(exportData, `backup-${new Date().toISOString().slice(0, 10)}.json`);
      showStatus(
        `Exported ${exportData.tasks.length} tasks, ${exportData.templates.length} templates, ${exportData.credentials.length} credentials`,
        'success'
      );
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const processImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData | TaskExport[] | TemplateExport[];

      // Detect format
      if (Array.isArray(data)) {
        // Array of tasks or templates
        const first = data[0] as Record<string, unknown> | undefined;
        if (first && 'templateId' in first) {
          // Import tasks
          let imported = 0;
          let skipped = 0;
          for (const taskData of data as TaskExport[]) {
            try {
              await api.createTask({
                templateId: taskData.templateId,
                name: taskData.name,
                ...(taskData.description ? { description: taskData.description } : {}),
                params: taskData.params,
                scheduleType: taskData.scheduleType as 'cron' | 'once' | 'interval',
                scheduleValue: taskData.scheduleValue,
                credentials: taskData.credentials,
                enabled: taskData.enabled,
              });
              imported++;
            } catch {
              skipped++;
            }
          }
          showStatus(`Imported ${imported} tasks (${skipped} skipped)`, 'success');
        } else if (first && 'code' in first) {
          // Import templates
          let imported = 0;
          let skipped = 0;
          for (const tmpl of data as TemplateExport[]) {
            try {
              await api.createTemplate({
                id: tmpl.id,
                name: tmpl.name,
                code: tmpl.code,
                ...(tmpl.description ? { description: tmpl.description } : {}),
                ...(tmpl.category ? { category: tmpl.category } : {}),
                paramsSchema: tmpl.paramsSchema as ParamDefinition[],
                requiredCredentials: tmpl.requiredCredentials,
                ...(tmpl.suggestedSchedule ? { suggestedSchedule: tmpl.suggestedSchedule } : {}),
              });
              imported++;
            } catch {
              skipped++;
            }
          }
          showStatus(`Imported ${imported} templates (${skipped} skipped)`, 'success');
        } else {
          showStatus('Unrecognized file format', 'error');
        }
      } else if (data.version) {
        // Full backup format
        let templatesImported = 0;
        let tasksImported = 0;
        let credentialsImported = 0;
        let skipped = 0;

        // Import templates first
        for (const tmpl of data.templates ?? []) {
          try {
            await api.createTemplate({
              id: tmpl.id,
              name: tmpl.name,
              code: tmpl.code,
              ...(tmpl.description ? { description: tmpl.description } : {}),
              ...(tmpl.category ? { category: tmpl.category } : {}),
              paramsSchema: tmpl.paramsSchema as ParamDefinition[],
              requiredCredentials: tmpl.requiredCredentials,
              ...(tmpl.suggestedSchedule ? { suggestedSchedule: tmpl.suggestedSchedule } : {}),
            });
            templatesImported++;
          } catch {
            skipped++;
          }
        }

        // Import credentials (metadata only)
        for (const cred of data.credentials ?? []) {
          try {
            await api.createCredential({
              name: cred.name,
              type: cred.type as CredentialType,
              ...(cred.description ? { description: cred.description } : {}),
            });
            credentialsImported++;
          } catch {
            skipped++;
          }
        }

        // Import tasks
        for (const taskData of data.tasks ?? []) {
          try {
            await api.createTask({
              templateId: taskData.templateId,
              name: taskData.name,
              ...(taskData.description ? { description: taskData.description } : {}),
              params: taskData.params,
              scheduleType: taskData.scheduleType as 'cron' | 'once' | 'interval',
              scheduleValue: taskData.scheduleValue,
              credentials: taskData.credentials,
              enabled: taskData.enabled,
            });
            tasksImported++;
          } catch {
            skipped++;
          }
        }

        showStatus(
          `Imported ${templatesImported} templates, ${credentialsImported} credentials, ${tasksImported} tasks (${skipped} skipped)`,
          'success'
        );
      } else {
        showStatus('Unrecognized file format', 'error');
      }
    } catch (err) {
      showStatus(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processImport(file);
    }
  };

  return (
    <div className="import-export-view">
      <h2 className="import-export-view__title">Import / Export</h2>

      {status && (
        <div className={`import-export-view__status import-export-view__status--${statusType}`}>
          {status}
          <button className="import-export-view__status-close" onClick={() => setStatus(null)}>
            ×
          </button>
        </div>
      )}

      <div className="import-export-view__sections">
        <div className="import-export-view__section">
          <h3 className="import-export-view__section-title">Export</h3>
          <p className="import-export-view__section-desc">
            Download your data as JSON files for backup or migration.
          </p>
          <div className="import-export-view__actions">
            <button
              className="btn btn--secondary"
              onClick={() => {
                void handleExportTasks();
              }}
              disabled={exporting}
            >
              Export Tasks
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => {
                void handleExportTemplates();
              }}
              disabled={exporting}
            >
              Export Templates
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                void handleExportAll();
              }}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Full Backup'}
            </button>
          </div>
        </div>

        <div className="import-export-view__section">
          <h3 className="import-export-view__section-title">Import</h3>
          <p className="import-export-view__section-desc">
            Restore data from a previously exported JSON file. Supports task files, template files,
            and full backup files. Duplicate entries will be skipped.
          </p>
          <p className="import-export-view__section-note">
            Note: Credential values are not included in exports for security. After importing, you
            will need to re-enter credential values.
          </p>
          <div className="import-export-view__actions">
            <button className="btn btn--primary" onClick={handleImportFile} disabled={importing}>
              {importing ? 'Importing...' : 'Import from JSON'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
