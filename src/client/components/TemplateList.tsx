import { useState, useMemo } from 'react';
import type { Template } from '../../shared/types';
import { EmptyState } from './EmptyState';
import '../styles/templates.css';

interface TemplateListProps {
  templates: Template[];
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
  onCreate: () => void;
  onExport: (template: Template) => void;
}

export function TemplateList({
  templates,
  onEdit,
  onDelete,
  onCreate,
  onExport,
}: TemplateListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category || 'Uncategorized'));
    return ['all', ...Array.from(cats).sort()];
  }, [templates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesSearch =
        searchQuery === '' ||
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (template.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      const matchesCategory =
        categoryFilter === 'all' || (template.category || 'Uncategorized') === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [templates, searchQuery, categoryFilter]);

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, Template[]> = {};
    filteredTemplates.forEach((template) => {
      const category = template.category || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(template);
    });
    return groups;
  }, [filteredTemplates]);

  if (templates.length === 0) {
    return (
      <EmptyState
        icon="📝"
        title="No templates yet"
        description="Create your first template to get started with task automation"
        action={{ label: 'Create Template', onClick: onCreate }}
      />
    );
  }

  return (
    <div className="template-list">
      <div className="template-list__header">
        <div className="template-list__title-row">
          <h2 className="template-list__title">Templates</h2>
          <button className="btn btn--primary" onClick={onCreate}>
            + Create Template
          </button>
        </div>

        <div className="template-list__filters">
          <input
            type="text"
            className="template-list__search"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            className="template-list__category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === 'all' ? 'All Categories' : category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No templates found"
          description="Try adjusting your search or filters"
        />
      ) : (
        <div className="template-list__content">
          {Object.entries(groupedTemplates)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryTemplates]) => (
              <div key={category} className="template-category">
                <h3 className="template-category__title">{category}</h3>
                <div className="template-category__grid">
                  {categoryTemplates.map((template) => (
                    <div key={template.id} className="template-card">
                      <div className="template-card__header">
                        <div className="template-card__header-left">
                          <h4 className="template-card__name">{template.name}</h4>
                          {template.isBuiltin && (
                            <span className="template-card__badge">Built-in</span>
                          )}
                        </div>
                      </div>

                      {template.description && (
                        <p className="template-card__description">{template.description}</p>
                      )}

                      <div className="template-card__meta">
                        {template.paramsSchema.length > 0 && (
                          <div className="template-card__meta-item">
                            <span className="template-card__meta-icon">⚙️</span>
                            <span className="template-card__meta-text">
                              {template.paramsSchema.length} parameter
                              {template.paramsSchema.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {template.requiredCredentials.length > 0 && (
                          <div className="template-card__meta-item">
                            <span className="template-card__meta-icon">🔑</span>
                            <span className="template-card__meta-text">
                              {template.requiredCredentials.length} credential
                              {template.requiredCredentials.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="template-card__actions">
                        <button
                          className="btn btn--secondary btn--small"
                          onClick={() => onEdit(template)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn--secondary btn--small"
                          onClick={() => onExport(template)}
                        >
                          Export
                        </button>
                        {!template.isBuiltin && (
                          <button
                            className="btn btn--secondary btn--small template-card__delete-btn"
                            onClick={() => onDelete(template)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
