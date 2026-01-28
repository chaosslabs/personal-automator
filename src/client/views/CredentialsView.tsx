import { useState, useEffect, useCallback } from 'react';
import type { Credential, CredentialType, Task } from '../../shared/types';
import { CREDENTIAL_TYPES } from '../../shared/constants';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { api } from '../utils/api';
import '../styles/credentials.css';

type CredentialWithValue = Credential & { hasValue: boolean };

interface CredentialFormState {
  name: string;
  type: CredentialType;
  description: string;
  value: string;
}

const EMPTY_FORM: CredentialFormState = {
  name: '',
  type: 'api_key',
  description: '',
  value: '',
};

const TYPE_LABELS: Record<CredentialType, string> = {
  api_key: 'API Key',
  oauth_token: 'OAuth Token',
  env_var: 'Environment Variable',
  secret: 'Secret',
};

export function CredentialsView() {
  const [credentials, setCredentials] = useState<CredentialWithValue[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit-value'>('create');
  const [editingCredential, setEditingCredential] = useState<CredentialWithValue | null>(null);
  const [form, setForm] = useState<CredentialFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadCredentials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getCredentials();
      setCredentials(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
    void loadTasks();
  }, [loadCredentials, loadTasks]);

  const getCredentialUsage = (credentialName: string): string[] => {
    return tasks
      .filter(
        (t) =>
          t.credentials.includes(credentialName) ||
          // Also check template required credentials
          credentials.some(
            (c) =>
              c.name === credentialName &&
              tasks.some((task) => task.credentials.includes(credentialName))
          )
      )
      .map((t) => t.name);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formMode === 'create') {
      if (!form.name.trim()) {
        errors['name'] = 'Name is required';
      } else if (!/^[A-Z0-9_]+$/.test(form.name.trim())) {
        errors['name'] = 'Name must be uppercase letters, numbers, and underscores only';
      } else if (credentials.some((c) => c.name === form.name.trim())) {
        errors['name'] = 'A credential with this name already exists';
      }

      if (!form.type) {
        errors['type'] = 'Type is required';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenCreateForm = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormMode('create');
    setEditingCredential(null);
    setShowForm(true);
  };

  const handleOpenEditValue = (credential: CredentialWithValue) => {
    setForm({
      name: credential.name,
      type: credential.type,
      description: credential.description ?? '',
      value: '',
    });
    setFormErrors({});
    setFormMode('edit-value');
    setEditingCredential(credential);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingCredential(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (formMode === 'create') {
        const createData: Parameters<typeof api.createCredential>[0] = {
          name: form.name.trim(),
          type: form.type,
        };
        if (form.description.trim()) {
          createData.description = form.description.trim();
        }
        if (form.value) {
          createData.value = form.value;
        }
        await api.createCredential(createData);
      } else if (editingCredential) {
        if (form.value) {
          await api.updateCredentialValue(editingCredential.name, form.value);
        } else {
          await api.clearCredentialValue(editingCredential.name);
        }
      }
      await loadCredentials();
      handleCloseForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save credential');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (credential: CredentialWithValue) => {
    const usage = getCredentialUsage(credential.name);
    let message = `Are you sure you want to delete "${credential.name}"?`;
    if (usage.length > 0) {
      message += `\n\nThis credential is used by: ${usage.join(', ')}`;
    }

    if (!confirm(message)) return;

    try {
      await api.deleteCredential(credential.id);
      await loadCredentials();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete credential');
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  // Loading state
  if (loading && credentials.length === 0) {
    return <LoadingSpinner message="Loading credentials..." />;
  }

  // Error state
  if (error && credentials.length === 0) {
    return (
      <ErrorMessage
        title="Error"
        message={error}
        onRetry={() => {
          void loadCredentials();
        }}
      />
    );
  }

  // Empty state
  if (credentials.length === 0 && !loading) {
    return (
      <EmptyState
        icon="🔐"
        title="No credentials yet"
        description="Add credentials to securely store API keys, tokens, and secrets for your tasks"
        action={{ label: 'Add Credential', onClick: handleOpenCreateForm }}
      />
    );
  }

  return (
    <div className="credentials-view">
      <div className="credentials-view__header">
        <h2 className="credentials-view__title">Credential Vault</h2>
        <div className="credentials-view__header-actions">
          <button className="btn btn--primary" onClick={handleOpenCreateForm}>
            Add Credential
          </button>
        </div>
      </div>

      <div className="credentials-table-container">
        <table className="credentials-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Usage</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((credential) => {
              const usage = getCredentialUsage(credential.name);
              return (
                <tr key={credential.id}>
                  <td>
                    <div className="credentials-table__name">{credential.name}</div>
                    {credential.description && (
                      <div className="credentials-table__description">{credential.description}</div>
                    )}
                  </td>
                  <td>
                    <span className={`credential-type credential-type--${credential.type}`}>
                      {TYPE_LABELS[credential.type]}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`credential-value-status ${credential.hasValue ? 'credential-value-status--set' : 'credential-value-status--empty'}`}
                    >
                      {credential.hasValue ? 'Set' : 'Not set'}
                    </span>
                  </td>
                  <td>{formatDate(credential.createdAt)}</td>
                  <td>{formatDate(credential.lastUsedAt)}</td>
                  <td>
                    {usage.length > 0 ? (
                      <span title={usage.join(', ')}>
                        {usage.length} task{usage.length !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="credential-value-status--empty">Unused</span>
                    )}
                  </td>
                  <td>
                    <div className="credentials-table__actions">
                      <button
                        className="btn btn--small btn--secondary"
                        onClick={() => handleOpenEditValue(credential)}
                        title={credential.hasValue ? 'Update value' : 'Set value'}
                      >
                        {credential.hasValue ? 'Update' : 'Set'}
                      </button>
                      <button
                        className="btn btn--small btn--secondary"
                        onClick={() => {
                          void handleDelete(credential);
                        }}
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="credential-form-overlay" onClick={handleCloseForm}>
          <div className="credential-form" onClick={(e) => e.stopPropagation()}>
            <h3 className="credential-form__title">
              {formMode === 'create'
                ? 'Add Credential'
                : `Update Value: ${editingCredential?.name}`}
            </h3>

            {formMode === 'create' && (
              <>
                <div className="credential-form__group">
                  <label className="credential-form__label">Name</label>
                  <input
                    className={`credential-form__input ${formErrors['name'] ? 'credential-form__input--error' : ''}`}
                    type="text"
                    placeholder="e.g. GITHUB_TOKEN"
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value.toUpperCase() }))
                    }
                    autoFocus
                  />
                  {formErrors['name'] && (
                    <span className="credential-form__error">{formErrors['name']}</span>
                  )}
                  <span className="credential-form__hint">
                    Uppercase letters, numbers, and underscores only
                  </span>
                </div>

                <div className="credential-form__group">
                  <label className="credential-form__label">Type</label>
                  <select
                    className="credential-form__select"
                    value={form.type}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, type: e.target.value as CredentialType }))
                    }
                  >
                    {CREDENTIAL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  {formErrors['type'] && (
                    <span className="credential-form__error">{formErrors['type']}</span>
                  )}
                </div>

                <div className="credential-form__group">
                  <label className="credential-form__label">Description (optional)</label>
                  <textarea
                    className="credential-form__textarea"
                    placeholder="Describe what this credential is used for"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="credential-form__group">
              <label className="credential-form__label">
                {formMode === 'create' ? 'Value (optional - can be set later)' : 'New Value'}
              </label>
              <input
                className="credential-form__input credential-form__value-input"
                type="password"
                placeholder={
                  formMode === 'edit-value'
                    ? 'Enter new value (leave empty to clear)'
                    : 'Enter value'
                }
                value={form.value}
                onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
                autoFocus={formMode === 'edit-value'}
              />
              <span className="credential-form__hint">
                Values are encrypted with AES-256-GCM and never displayed
              </span>
            </div>

            <div className="credential-form__actions">
              <button className="btn btn--secondary" onClick={handleCloseForm} disabled={saving}>
                Cancel
              </button>
              <button
                className="btn btn--primary"
                onClick={() => {
                  void handleSave();
                }}
                disabled={saving}
              >
                {saving ? 'Saving...' : formMode === 'create' ? 'Create' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
