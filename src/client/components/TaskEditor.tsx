import { useState, useEffect } from 'react';
import type { Task, Template, Credential, ScheduleType } from '../../shared/types';
import { TemplateSelector } from './TemplateSelector';
import { DynamicParameterForm, validateParameters } from './DynamicParameterForm';
import { ScheduleEditor, validateSchedule } from './ScheduleEditor';
import { TaskCredentialSelector, validateCredentials } from './TaskCredentialSelector';
import '../styles/task-editor.css';

interface TaskEditorProps {
  task: Task | null;
  templates: Template[];
  credentials: Array<Credential & { hasValue: boolean }>;
  onSave: (taskData: TaskFormData) => Promise<void>;
  onCancel: () => void;
}

export interface TaskFormData {
  templateId: string;
  name: string;
  description: string | null;
  params: Record<string, unknown>;
  scheduleType: ScheduleType;
  scheduleValue: string;
  credentials: string[];
  enabled: boolean;
}

interface ValidationErrors {
  name?: string;
  template?: string;
  params?: Record<string, string>;
  schedule?: string;
  credentials?: string[];
}

export function TaskEditor({ task, templates, credentials, onSave, onCancel }: TaskEditorProps) {
  const isEdit = task !== null;

  // Form state
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');
  const [templateId, setTemplateId] = useState(task?.templateId || '');
  const [params, setParams] = useState<Record<string, unknown>>(task?.params || {});
  const [scheduleType, setScheduleType] = useState<ScheduleType>(task?.scheduleType || 'cron');
  const [scheduleValue, setScheduleValue] = useState(task?.scheduleValue || '');
  const [selectedCredentials, setSelectedCredentials] = useState<string[]>(task?.credentials || []);
  const [enabled, setEnabled] = useState(task?.enabled ?? true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showValidation, setShowValidation] = useState(false);

  // Get selected template
  const selectedTemplate = templates.find((t) => t.id === templateId) || null;

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description || '');
      setTemplateId(task.templateId);
      setParams(task.params);
      setScheduleType(task.scheduleType);
      setScheduleValue(task.scheduleValue);
      setSelectedCredentials(task.credentials);
      setEnabled(task.enabled);
    } else {
      setName('');
      setDescription('');
      setTemplateId('');
      setParams({});
      setScheduleType('cron');
      setScheduleValue('');
      setSelectedCredentials([]);
      setEnabled(true);
    }
    setShowValidation(false);
    setErrors({});
  }, [task]);

  // When template changes, reset params and auto-select required credentials
  const handleTemplateChange = (newTemplateId: string) => {
    setTemplateId(newTemplateId);
    const template = templates.find((t) => t.id === newTemplateId);

    if (template) {
      // Initialize params with defaults
      const newParams: Record<string, unknown> = {};
      for (const paramDef of template.paramsSchema) {
        if (paramDef.default !== undefined) {
          newParams[paramDef.name] = paramDef.default;
        }
      }
      setParams(newParams);

      // Auto-select required credentials
      const requiredCreds = template.requiredCredentials.filter((name) =>
        credentials.some((c) => c.name === name)
      );
      setSelectedCredentials(requiredCreds);

      // Use suggested schedule if available
      if (template.suggestedSchedule && !scheduleValue) {
        setScheduleValue(template.suggestedSchedule);
        setScheduleType('cron');
      }
    } else {
      setParams({});
      setSelectedCredentials([]);
    }
  };

  // When schedule type changes, reset value
  const handleScheduleTypeChange = (newType: ScheduleType) => {
    setScheduleType(newType);
    // Keep value if switching to cron and template has suggestion
    if (newType === 'cron' && selectedTemplate?.suggestedSchedule) {
      setScheduleValue(selectedTemplate.suggestedSchedule);
    } else {
      setScheduleValue('');
    }
  };

  // Validate the form
  const validate = (): ValidationErrors => {
    const newErrors: ValidationErrors = {};

    // Name validation
    if (!name.trim()) {
      newErrors.name = 'Task name is required';
    }

    // Template validation
    if (!templateId) {
      newErrors.template = 'Please select a template';
    }

    // Parameter validation
    if (selectedTemplate) {
      const paramValidation = validateParameters(selectedTemplate.paramsSchema, params);
      if (!paramValidation.valid) {
        newErrors.params = paramValidation.errors;
      }
    }

    // Schedule validation
    const scheduleValidation = validateSchedule(scheduleType, scheduleValue);
    if (!scheduleValidation.valid) {
      newErrors.schedule = scheduleValidation.error || 'Invalid schedule';
    }

    // Credential validation
    if (selectedTemplate) {
      const credValidation = validateCredentials(
        selectedCredentials,
        selectedTemplate.requiredCredentials,
        credentials
      );
      if (!credValidation.valid) {
        newErrors.credentials = credValidation.errors;
      }
    }

    return newErrors;
  };

  // Handle save
  const handleSave = async () => {
    setShowValidation(true);
    const validationErrors = validate();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        templateId,
        name: name.trim(),
        description: description.trim() || null,
        params,
        scheduleType,
        scheduleValue,
        credentials: selectedCredentials,
        enabled,
      });
    } finally {
      setSaving(false);
    }
  };

  const hasErrors = showValidation && Object.keys(errors).length > 0;

  return (
    <div className="task-editor">
      <div className="task-editor__header">
        <h2 className="task-editor__title">
          {isEdit ? `Edit Task: ${task?.name}` : 'Create New Task'}
        </h2>
        <div className="task-editor__header-actions">
          <button className="btn btn--secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>

      {hasErrors && (
        <div className="task-editor__error-summary">
          <h3>Please fix the following errors:</h3>
          <ul>
            {errors.name && <li>{errors.name}</li>}
            {errors.template && <li>{errors.template}</li>}
            {errors.params && Object.values(errors.params).map((err, i) => <li key={i}>{err}</li>)}
            {errors.schedule && <li>{errors.schedule}</li>}
            {errors.credentials?.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="task-editor__content">
        <div className="task-editor__main">
          {/* Basic Info */}
          <div className="task-editor__section">
            <div className="task-editor__form-group">
              <label className="task-editor__label">Task Name *</label>
              <input
                type="text"
                className={`task-editor__input ${showValidation && errors.name ? 'task-editor__input--error' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Daily Health Check"
                disabled={saving}
              />
              {showValidation && errors.name && (
                <span className="task-editor__field-error">{errors.name}</span>
              )}
            </div>

            <div className="task-editor__form-group">
              <label className="task-editor__label">Description</label>
              <textarea
                className="task-editor__textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this task do?"
                rows={3}
                disabled={saving}
              />
            </div>

            <div className="task-editor__form-group">
              <label className="task-editor__checkbox-label">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={saving}
                />
                Enable task after saving
              </label>
            </div>
          </div>

          {/* Template Selection */}
          <div
            className={`task-editor__section ${showValidation && errors.template ? 'task-editor__section--error' : ''}`}
          >
            <TemplateSelector
              templates={templates}
              selectedTemplateId={templateId}
              onChange={handleTemplateChange}
              disabled={saving || isEdit}
            />
            {showValidation && errors.template && (
              <span className="task-editor__field-error">{errors.template}</span>
            )}
            {isEdit && (
              <p className="task-editor__hint">Template cannot be changed after task creation.</p>
            )}
          </div>

          {/* Schedule Configuration */}
          <div
            className={`task-editor__section ${showValidation && errors.schedule ? 'task-editor__section--error' : ''}`}
          >
            <ScheduleEditor
              scheduleType={scheduleType}
              scheduleValue={scheduleValue}
              suggestedSchedule={selectedTemplate?.suggestedSchedule ?? null}
              onTypeChange={handleScheduleTypeChange}
              onValueChange={setScheduleValue}
              disabled={saving}
            />
            {showValidation && errors.schedule && (
              <span className="task-editor__field-error">{errors.schedule}</span>
            )}
          </div>
        </div>

        <div className="task-editor__sidebar">
          {/* Parameters */}
          {selectedTemplate && (
            <div
              className={`task-editor__section ${showValidation && errors.params ? 'task-editor__section--error' : ''}`}
            >
              <DynamicParameterForm
                paramsSchema={selectedTemplate.paramsSchema}
                values={params}
                onChange={setParams}
                disabled={saving}
              />
              {showValidation && errors.params && (
                <div className="task-editor__field-errors">
                  {Object.entries(errors.params).map(([field, error]) => (
                    <span key={field} className="task-editor__field-error">
                      {error}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Credentials */}
          <div
            className={`task-editor__section ${showValidation && errors.credentials ? 'task-editor__section--error' : ''}`}
          >
            <TaskCredentialSelector
              credentials={credentials}
              selectedCredentials={selectedCredentials}
              requiredCredentials={selectedTemplate?.requiredCredentials || []}
              onChange={setSelectedCredentials}
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
