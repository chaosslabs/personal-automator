import type { Template } from '../../shared/types';

interface TemplateSelectorProps {
  templates: Template[];
  selectedTemplateId: string | null;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function TemplateSelector({
  templates,
  selectedTemplateId,
  onChange,
  disabled,
}: TemplateSelectorProps) {
  // Group templates by category
  const templatesByCategory = templates.reduce(
    (acc, template) => {
      const category = template.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
      return acc;
    },
    {} as Record<string, Template[]>
  );

  const categories = Object.keys(templatesByCategory).sort();

  return (
    <div className="template-selector">
      <label className="template-selector__label">Template *</label>
      <select
        className="template-selector__select"
        value={selectedTemplateId || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Select a template...</option>
        {categories.map((category) => {
          const categoryTemplates = templatesByCategory[category];
          if (!categoryTemplates) return null;
          return (
            <optgroup key={category} label={category}>
              {categoryTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      {selectedTemplateId && (
        <TemplatePreview template={templates.find((t) => t.id === selectedTemplateId) || null} />
      )}
    </div>
  );
}

interface TemplatePreviewProps {
  template: Template | null;
}

function TemplatePreview({ template }: TemplatePreviewProps) {
  if (!template) return null;

  return (
    <div className="template-selector__preview">
      {template.description && (
        <p className="template-selector__description">{template.description}</p>
      )}
      <div className="template-selector__meta">
        {template.paramsSchema.length > 0 && (
          <span className="template-selector__meta-item">
            {template.paramsSchema.length} parameter
            {template.paramsSchema.length !== 1 ? 's' : ''}
          </span>
        )}
        {template.requiredCredentials.length > 0 && (
          <span className="template-selector__meta-item">
            {template.requiredCredentials.length} credential
            {template.requiredCredentials.length !== 1 ? 's' : ''} required
          </span>
        )}
        {template.suggestedSchedule && (
          <span className="template-selector__meta-item">
            Suggested: {template.suggestedSchedule}
          </span>
        )}
      </div>
    </div>
  );
}
