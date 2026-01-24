import type { ParamDefinition } from '../../shared/types';

interface DynamicParameterFormProps {
  paramsSchema: ParamDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function DynamicParameterForm({
  paramsSchema,
  values,
  onChange,
  disabled,
}: DynamicParameterFormProps) {
  const handleChange = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value });
  };

  if (paramsSchema.length === 0) {
    return (
      <div className="dynamic-param-form">
        <label className="dynamic-param-form__section-label">Parameters</label>
        <p className="dynamic-param-form__empty">This template has no configurable parameters.</p>
      </div>
    );
  }

  return (
    <div className="dynamic-param-form">
      <label className="dynamic-param-form__section-label">Parameters</label>
      <div className="dynamic-param-form__fields">
        {paramsSchema.map((param) => (
          <ParameterField
            key={param.name}
            param={param}
            value={values[param.name]}
            onChange={(value) => handleChange(param.name, value)}
            disabled={disabled ?? false}
          />
        ))}
      </div>
    </div>
  );
}

interface ParameterFieldProps {
  param: ParamDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

function ParameterField({ param, value, onChange, disabled }: ParameterFieldProps) {
  const getValue = (): string | number | boolean => {
    if (value !== undefined && value !== null) {
      return value as string | number | boolean;
    }
    if (param.default !== undefined) {
      return param.default;
    }
    // Return appropriate default based on type
    switch (param.type) {
      case 'boolean':
        return false;
      case 'number':
        return 0;
      default:
        return '';
    }
  };

  const currentValue = getValue();

  const renderInput = () => {
    switch (param.type) {
      case 'boolean':
        return (
          <div className="dynamic-param-form__checkbox-wrapper">
            <input
              type="checkbox"
              id={`param-${param.name}`}
              checked={Boolean(currentValue)}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
            />
            <label htmlFor={`param-${param.name}`} className="dynamic-param-form__checkbox-label">
              {param.name}
              {param.required && <span className="dynamic-param-form__required">*</span>}
            </label>
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            id={`param-${param.name}`}
            className="dynamic-param-form__input"
            value={currentValue as number}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder={param.default !== undefined ? `Default: ${param.default}` : ''}
            disabled={disabled}
          />
        );

      default: // string
        return (
          <input
            type="text"
            id={`param-${param.name}`}
            className="dynamic-param-form__input"
            value={String(currentValue)}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder={param.default !== undefined ? `Default: ${param.default}` : ''}
            disabled={disabled}
          />
        );
    }
  };

  // Boolean fields have their own label inline
  if (param.type === 'boolean') {
    return (
      <div className="dynamic-param-form__field">
        {renderInput()}
        {param.description && <span className="dynamic-param-form__help">{param.description}</span>}
      </div>
    );
  }

  return (
    <div className="dynamic-param-form__field">
      <label htmlFor={`param-${param.name}`} className="dynamic-param-form__label">
        {param.name}
        {param.required && <span className="dynamic-param-form__required">*</span>}
      </label>
      {renderInput()}
      {param.description && <span className="dynamic-param-form__help">{param.description}</span>}
    </div>
  );
}

// Validation helper function
export function validateParameters(
  paramsSchema: ParamDefinition[],
  values: Record<string, unknown>
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const param of paramsSchema) {
    const value = values[param.name];
    const hasValue = value !== undefined && value !== null && value !== '';

    // Check required fields
    if (param.required && !hasValue && param.default === undefined) {
      errors[param.name] = `${param.name} is required`;
      continue;
    }

    // Type validation
    if (hasValue) {
      switch (param.type) {
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors[param.name] = `${param.name} must be a valid number`;
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors[param.name] = `${param.name} must be a boolean`;
          }
          break;
        case 'string':
          if (typeof value !== 'string') {
            errors[param.name] = `${param.name} must be a string`;
          }
          break;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
