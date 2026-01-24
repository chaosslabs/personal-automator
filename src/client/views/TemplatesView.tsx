import { useState, useEffect } from 'react';
import type { Template, Credential, ParamDefinition } from '../../shared/types';
import { TemplateList } from '../components/TemplateList';
import { TemplateEditor } from '../components/TemplateEditor';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { api } from '../utils/api';
import { exportTemplate, importTemplate } from '../utils/templateImportExport';

export function TemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const loadCredentials = async () => {
    try {
      const data = await api.getCredentials();
      setCredentials(data);
    } catch (err) {
      console.error('Failed to load credentials:', err);
    }
  };

  useEffect(() => {
    void loadTemplates();
    void loadCredentials();
  }, []);

  const handleCreate = () => {
    setEditingTemplate(null);
    setIsCreating(true);
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setIsCreating(false);
  };

  const handleDelete = async (template: Template) => {
    if (template.isBuiltin) {
      alert('Cannot delete built-in templates');
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete "${template.name}"?\n\n` +
        'This will also delete any tasks using this template.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.deleteTemplate(template.id);
      await loadTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleSave = async (templateData: Partial<Template>) => {
    if (editingTemplate) {
      await api.updateTemplate(editingTemplate.id, templateData);
    } else {
      // Generate a unique ID for new templates
      const id = `template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const createData: {
        id: string;
        name: string;
        code: string;
        description?: string;
        category?: string;
        paramsSchema?: ParamDefinition[];
        requiredCredentials?: string[];
        suggestedSchedule?: string;
      } = {
        id,
        name: templateData.name || '',
        code: templateData.code || '',
      };

      if (templateData.description) {
        createData.description = templateData.description;
      }
      if (templateData.category) {
        createData.category = templateData.category;
      }
      if (templateData.paramsSchema) {
        createData.paramsSchema = templateData.paramsSchema;
      }
      if (templateData.requiredCredentials) {
        createData.requiredCredentials = templateData.requiredCredentials;
      }
      if (templateData.suggestedSchedule) {
        createData.suggestedSchedule = templateData.suggestedSchedule;
      }

      await api.createTemplate(createData);
    }

    await loadTemplates();
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setEditingTemplate(null);
    setIsCreating(false);
  };

  const handleExport = (template: Template) => {
    exportTemplate(template);
  };

  const handleImport = async () => {
    try {
      const templateData = await importTemplate();
      setEditingTemplate(null);
      setIsCreating(true);

      // We'll pass the imported data to the editor by creating a pseudo-template
      const pseudoTemplate: Template = {
        id: '',
        name: templateData.name || '',
        description: templateData.description || null,
        category: templateData.category || null,
        code: templateData.code || '',
        paramsSchema: templateData.paramsSchema || [],
        requiredCredentials: templateData.requiredCredentials || [],
        suggestedSchedule: templateData.suggestedSchedule || null,
        isBuiltin: false,
        createdAt: '',
        updatedAt: '',
      };

      setEditingTemplate(pseudoTemplate);
    } catch (err) {
      if (err instanceof Error && err.message !== 'No file selected') {
        alert(err.message);
      }
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading templates..." />;
  }

  if (error) {
    return (
      <ErrorMessage
        title="Error"
        message={error}
        onRetry={() => {
          void loadTemplates();
        }}
      />
    );
  }

  if (isCreating || editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        credentials={credentials}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn--secondary btn--small"
          onClick={() => {
            void handleImport();
          }}
        >
          Import Template
        </button>
      </div>
      <TemplateList
        templates={templates}
        onEdit={handleEdit}
        onDelete={(template) => {
          void handleDelete(template);
        }}
        onCreate={handleCreate}
        onExport={handleExport}
      />
    </div>
  );
}
