import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type { Template, ParamDefinition, Credential } from '../../shared/types';
import { useTheme } from '../contexts/ThemeContext';
import '../styles/templates.css';

interface TemplateEditorProps {
  template: Template | null;
  credentials: Credential[];
  onSave: (template: Partial<Template>) => Promise<void>;
  onCancel: () => void;
}

export function TemplateEditor({ template, credentials, onSave, onCancel }: TemplateEditorProps) {
  const { theme } = useTheme();
  const isEdit = template !== null;

  // Form state
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState(template?.category || '');
  const [code, setCode] = useState(template?.code || '');
  const [paramsSchema, setParamsSchema] = useState<ParamDefinition[]>(template?.paramsSchema || []);
  const [requiredCredentials, setRequiredCredentials] = useState<string[]>(
    template?.requiredCredentials || []
  );
  const [suggestedSchedule, setSuggestedSchedule] = useState(template?.suggestedSchedule || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setCategory(template.category || '');
      setCode(template.code);
      setParamsSchema(template.paramsSchema);
      setRequiredCredentials(template.requiredCredentials);
      setSuggestedSchedule(template.suggestedSchedule || '');
    }
  }, [template]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...(template ? { id: template.id } : {}),
        name,
        description: description || null,
        category: category || null,
        code,
        paramsSchema,
        requiredCredentials,
        suggestedSchedule: suggestedSchedule || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim() !== '' && code.trim() !== '';

  return (
    <div className="template-editor">
      <div className="template-editor__header">
        <h2 className="template-editor__title">
          {isEdit ? `Edit Template: ${template?.name}` : 'Create New Template'}
        </h2>
        <div className="template-editor__header-actions">
          <button className="btn btn--secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              void handleSave();
            }}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      <div className="template-editor__content">
        <div className="template-editor__left">
          <div className="template-editor__form-group">
            <label className="template-editor__label">Name *</label>
            <input
              type="text"
              className="template-editor__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Daily Backup Task"
              disabled={saving}
            />
          </div>

          <div className="template-editor__form-group">
            <label className="template-editor__label">Description</label>
            <textarea
              className="template-editor__textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this template do?"
              disabled={saving}
            />
          </div>

          <div className="template-editor__form-group">
            <label className="template-editor__label">Category</label>
            <input
              type="text"
              className="template-editor__input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Automation, Monitoring, Backup"
              disabled={saving}
            />
          </div>

          <div className="template-editor__code-section">
            <label className="template-editor__label">Code *</label>
            <div className="template-editor__code-wrapper">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                value={code}
                onChange={(value) => setCode(value || '')}
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                }}
              />
            </div>
          </div>
        </div>

        <div className="template-editor__right">
          <div className="template-editor__form-group">
            <label className="template-editor__label">Suggested Schedule</label>
            <input
              type="text"
              className="template-editor__input"
              value={suggestedSchedule}
              onChange={(e) => setSuggestedSchedule(e.target.value)}
              placeholder="e.g., 0 0 * * * (daily at midnight)"
              disabled={saving}
            />
          </div>

          <ParameterSchemaBuilder
            params={paramsSchema}
            onChange={setParamsSchema}
            disabled={saving}
          />

          <CredentialSelector
            credentials={credentials}
            selected={requiredCredentials}
            onChange={setRequiredCredentials}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}

interface ParameterSchemaBuilderProps {
  params: ParamDefinition[];
  onChange: (params: ParamDefinition[]) => void;
  disabled?: boolean;
}

function ParameterSchemaBuilder({ params, onChange, disabled }: ParameterSchemaBuilderProps) {
  const addParam = () => {
    onChange([
      ...params,
      {
        name: '',
        type: 'string',
        required: false,
      },
    ]);
  };

  const removeParam = (index: number) => {
    onChange(params.filter((_, i) => i !== index));
  };

  const updateParam = (index: number, updates: Partial<ParamDefinition>) => {
    onChange(params.map((param, i) => (i === index ? { ...param, ...updates } : param)));
  };

  return (
    <div className="template-editor__section">
      <h3 className="template-editor__section-title">Parameters</h3>
      <div className="param-builder__list">
        {params.map((param, index) => (
          <div key={index} className="param-builder__item">
            <div className="param-builder__item-header">
              <span className="param-builder__item-name">
                {param.name || `Parameter ${index + 1}`}
              </span>
              <button
                className="param-builder__item-remove"
                onClick={() => removeParam(index)}
                disabled={disabled}
              >
                Remove
              </button>
            </div>
            <div className="param-builder__item-fields">
              <div className="param-builder__field">
                <label className="param-builder__field-label">Name</label>
                <input
                  type="text"
                  className="param-builder__field-input"
                  value={param.name}
                  onChange={(e) => updateParam(index, { name: e.target.value })}
                  placeholder="paramName"
                  disabled={disabled}
                />
              </div>
              <div className="param-builder__field">
                <label className="param-builder__field-label">Type</label>
                <select
                  className="param-builder__field-select"
                  value={param.type}
                  onChange={(e) =>
                    updateParam(index, { type: e.target.value as 'string' | 'number' | 'boolean' })
                  }
                  disabled={disabled}
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>
              <div className="param-builder__field">
                <label className="param-builder__field-label">Description</label>
                <input
                  type="text"
                  className="param-builder__field-input"
                  value={param.description || ''}
                  onChange={(e) => updateParam(index, { description: e.target.value })}
                  placeholder="Parameter description"
                  disabled={disabled}
                />
              </div>
              <div className="param-builder__field">
                <label className="param-builder__field-label">Default Value</label>
                <input
                  type={param.type === 'number' ? 'number' : 'text'}
                  className="param-builder__field-input"
                  value={param.default !== undefined ? String(param.default) : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      const { default: _, ...rest } = param;
                      updateParam(index, rest);
                    } else if (param.type === 'number') {
                      updateParam(index, { default: Number(value) });
                    } else if (param.type === 'boolean') {
                      updateParam(index, { default: value === 'true' });
                    } else {
                      updateParam(index, { default: value });
                    }
                  }}
                  placeholder={param.type === 'boolean' ? 'true or false' : 'Default value'}
                  disabled={disabled}
                />
              </div>
              <div className="param-builder__field-checkbox">
                <input
                  type="checkbox"
                  checked={param.required}
                  onChange={(e) => updateParam(index, { required: e.target.checked })}
                  disabled={disabled}
                />
                <label className="param-builder__field-label">Required</label>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="param-builder__add-btn" onClick={addParam} disabled={disabled}>
        + Add Parameter
      </button>
    </div>
  );
}

interface CredentialSelectorProps {
  credentials: Credential[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

function CredentialSelector({
  credentials,
  selected,
  onChange,
  disabled,
}: CredentialSelectorProps) {
  const toggleCredential = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((c) => c !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="template-editor__section">
      <h3 className="template-editor__section-title">Required Credentials</h3>
      {credentials.length === 0 ? (
        <div className="credential-selector__empty">
          No credentials available. Create credentials first.
        </div>
      ) : (
        <div className="credential-selector__list">
          {credentials.map((credential) => (
            <div key={credential.id} className="credential-selector__item">
              <input
                type="checkbox"
                checked={selected.includes(credential.name)}
                onChange={() => toggleCredential(credential.name)}
                disabled={disabled}
              />
              <label
                className="credential-selector__item-label"
                onClick={() => !disabled && toggleCredential(credential.name)}
              >
                {credential.name}
                {credential.description && ` - ${credential.description}`}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
