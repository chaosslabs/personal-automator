import type { Credential } from '../../shared/types';

interface TaskCredentialSelectorProps {
  credentials: Array<Credential & { hasValue: boolean }>;
  selectedCredentials: string[];
  requiredCredentials: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

export function TaskCredentialSelector({
  credentials,
  selectedCredentials,
  requiredCredentials,
  onChange,
  disabled,
}: TaskCredentialSelectorProps) {
  const toggleCredential = (name: string) => {
    if (selectedCredentials.includes(name)) {
      onChange(selectedCredentials.filter((c) => c !== name));
    } else {
      onChange([...selectedCredentials, name]);
    }
  };

  // Check if required credentials are missing
  const missingRequired = requiredCredentials.filter((req) => !selectedCredentials.includes(req));

  // Check if any selected credentials don't have values
  const credentialsWithoutValue = selectedCredentials.filter((name) => {
    const cred = credentials.find((c) => c.name === name);
    return cred && !cred.hasValue;
  });

  return (
    <div className="task-credential-selector">
      <label className="task-credential-selector__label">Credentials</label>

      {requiredCredentials.length > 0 && (
        <div className="task-credential-selector__required-notice">
          <span className="task-credential-selector__required-label">Required by template:</span>
          <span className="task-credential-selector__required-list">
            {requiredCredentials.join(', ')}
          </span>
        </div>
      )}

      {credentials.length === 0 ? (
        <div className="task-credential-selector__empty">
          No credentials available. Create credentials in the Credentials section first.
        </div>
      ) : (
        <div className="task-credential-selector__list">
          {credentials.map((credential) => {
            const isRequired = requiredCredentials.includes(credential.name);
            const isSelected = selectedCredentials.includes(credential.name);
            const hasWarning = isSelected && !credential.hasValue;

            return (
              <div
                key={credential.id}
                className={`task-credential-selector__item ${isRequired ? 'task-credential-selector__item--required' : ''} ${hasWarning ? 'task-credential-selector__item--warning' : ''}`}
              >
                <input
                  type="checkbox"
                  id={`cred-${credential.id}`}
                  checked={isSelected}
                  onChange={() => toggleCredential(credential.name)}
                  disabled={disabled}
                />
                <label
                  htmlFor={`cred-${credential.id}`}
                  className="task-credential-selector__item-label"
                >
                  <span className="task-credential-selector__item-name">
                    {credential.name}
                    {isRequired && (
                      <span className="task-credential-selector__item-badge">required</span>
                    )}
                  </span>
                  {credential.description && (
                    <span className="task-credential-selector__item-description">
                      {credential.description}
                    </span>
                  )}
                  {hasWarning && (
                    <span className="task-credential-selector__item-warning">No value set</span>
                  )}
                </label>
              </div>
            );
          })}
        </div>
      )}

      {missingRequired.length > 0 && (
        <div className="task-credential-selector__error">
          Missing required credentials: {missingRequired.join(', ')}
        </div>
      )}

      {credentialsWithoutValue.length > 0 && (
        <div className="task-credential-selector__warning">
          The following credentials have no value set: {credentialsWithoutValue.join(', ')}
        </div>
      )}
    </div>
  );
}

// Validation helper
export function validateCredentials(
  selectedCredentials: string[],
  requiredCredentials: string[],
  availableCredentials: Array<Credential & { hasValue: boolean }>
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for missing required credentials
  const missing = requiredCredentials.filter((req) => !selectedCredentials.includes(req));
  if (missing.length > 0) {
    errors.push(`Missing required credentials: ${missing.join(', ')}`);
  }

  // Check for credentials without values
  for (const name of selectedCredentials) {
    const cred = availableCredentials.find((c) => c.name === name);
    if (cred && !cred.hasValue) {
      warnings.push(`Credential "${name}" has no value set`);
    }
    if (!cred) {
      errors.push(`Credential "${name}" does not exist`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
