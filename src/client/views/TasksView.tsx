import { useState, useEffect } from 'react';
import type { Task, Template, Credential, TaskFilters } from '../../shared/types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { TaskEditor, type TaskFormData } from '../components/TaskEditor';
import { api } from '../utils/api';
import '../styles/tasks.css';

type ViewMode = 'list' | 'create' | 'edit';

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [credentials, setCredentials] = useState<Array<Credential & { hasValue: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());

  // Editor state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: TaskFilters = {};
      if (statusFilter === 'enabled') filters.enabled = true;
      if (statusFilter === 'disabled') filters.enabled = false;
      if (templateFilter !== 'all') filters.templateId = templateFilter;

      const data = await api.getTasks(filters);
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
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
    void loadTasks();
    void loadTemplates();
    void loadCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when filters change
  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, templateFilter]);

  const handleToggle = async (task: Task) => {
    try {
      await api.toggleTask(task.id);
      await loadTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle task');
    }
  };

  const handleDelete = async (task: Task) => {
    const confirmed = confirm(
      `Are you sure you want to delete "${task.name}"?\n\n` +
        'This will also delete all execution history for this task.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.deleteTask(task.id);
      await loadTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const handleRun = async (task: Task) => {
    try {
      const result = await api.executeTask(task.id);
      if (result.success) {
        alert(`Task executed successfully!\n\nExecution ID: ${result.executionId}`);
      } else {
        alert(`Task failed:\n${result.error ?? 'Unknown error'}`);
      }
      await loadTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to execute task');
    }
  };

  const handleSelectTask = (taskId: number, selected: boolean) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedTasks(new Set(filteredTasks.map((t) => t.id)));
    } else {
      setSelectedTasks(new Set());
    }
  };

  const handleBulkEnable = async () => {
    const taskIds = Array.from(selectedTasks);
    if (taskIds.length === 0) return;

    try {
      for (const id of taskIds) {
        const task = tasks.find((t) => t.id === id);
        if (task && !task.enabled) {
          await api.toggleTask(id);
        }
      }
      await loadTasks();
      setSelectedTasks(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to enable tasks');
    }
  };

  const handleBulkDisable = async () => {
    const taskIds = Array.from(selectedTasks);
    if (taskIds.length === 0) return;

    try {
      for (const id of taskIds) {
        const task = tasks.find((t) => t.id === id);
        if (task && task.enabled) {
          await api.toggleTask(id);
        }
      }
      await loadTasks();
      setSelectedTasks(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to disable tasks');
    }
  };

  const handleBulkDelete = async () => {
    const taskIds = Array.from(selectedTasks);
    if (taskIds.length === 0) return;

    const confirmed = confirm(
      `Are you sure you want to delete ${taskIds.length} task(s)?\n\n` +
        'This will also delete all execution history for these tasks.'
    );

    if (!confirmed) {
      return;
    }

    try {
      for (const id of taskIds) {
        await api.deleteTask(id);
      }
      await loadTasks();
      setSelectedTasks(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete tasks');
    }
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setViewMode('create');
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setViewMode('edit');
  };

  const handleCancelEdit = () => {
    setEditingTask(null);
    setViewMode('list');
  };

  const handleSaveTask = async (data: TaskFormData) => {
    try {
      if (editingTask) {
        // Update existing task
        await api.updateTask(editingTask.id, {
          name: data.name,
          description: data.description,
          params: data.params,
          scheduleType: data.scheduleType,
          scheduleValue: data.scheduleValue,
          credentials: data.credentials,
          enabled: data.enabled,
        });
      } else {
        // Create new task
        await api.createTask({
          templateId: data.templateId,
          name: data.name,
          ...(data.description ? { description: data.description } : {}),
          params: data.params,
          scheduleType: data.scheduleType,
          scheduleValue: data.scheduleValue,
          credentials: data.credentials,
          enabled: data.enabled,
        });
      }
      await loadTasks();
      setViewMode('list');
      setEditingTask(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save task');
      throw err;
    }
  };

  // Filter tasks by search query
  const filteredTasks = tasks.filter((task) => {
    const template = templates.find((t) => t.id === task.templateId);
    const matchesSearch =
      searchQuery === '' ||
      task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (template?.name.toLowerCase() || '').includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const getTemplateName = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    return template?.name ?? templateId;
  };

  const formatNextRun = (nextRunAt: string | null) => {
    if (!nextRunAt) return 'Never';
    const date = new Date(nextRunAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) return 'Overdue';
    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffMins < 1440) return `in ${Math.floor(diffMins / 60)}h`;
    return `in ${Math.floor(diffMins / 1440)}d`;
  };

  // Show editor view
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <TaskEditor
        task={editingTask}
        templates={templates}
        credentials={credentials}
        onSave={handleSaveTask}
        onCancel={handleCancelEdit}
      />
    );
  }

  // List view
  if (loading) {
    return <LoadingSpinner message="Loading tasks..." />;
  }

  if (error) {
    return (
      <ErrorMessage
        title="Error"
        message={error}
        onRetry={() => {
          void loadTasks();
        }}
      />
    );
  }

  if (tasks.length === 0 && statusFilter === 'all' && templateFilter === 'all') {
    return (
      <EmptyState
        icon="📋"
        title="No tasks yet"
        description="Create your first scheduled task to automate your workflows"
        action={{ label: 'Create Task', onClick: handleCreateTask }}
      />
    );
  }

  return (
    <div className="tasks-view">
      <div className="tasks-view__header">
        <h2 className="tasks-view__title">Tasks</h2>
        <button className="btn btn--primary" onClick={handleCreateTask}>
          Create Task
        </button>
      </div>

      <div className="tasks-view__filters">
        <input
          type="text"
          className="tasks-view__search"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="tasks-view__filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
        >
          <option value="all">All Status</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>

        <select
          className="tasks-view__filter"
          value={templateFilter}
          onChange={(e) => setTemplateFilter(e.target.value)}
        >
          <option value="all">All Templates</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {selectedTasks.size > 0 && (
        <div className="tasks-view__bulk-actions">
          <span className="tasks-view__bulk-count">{selectedTasks.size} selected</span>
          <button
            className="btn btn--small btn--secondary"
            onClick={() => {
              void handleBulkEnable();
            }}
          >
            Enable
          </button>
          <button
            className="btn btn--small btn--secondary"
            onClick={() => {
              void handleBulkDisable();
            }}
          >
            Disable
          </button>
          <button
            className="btn btn--small btn--secondary tasks-view__bulk-delete"
            onClick={() => {
              void handleBulkDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <EmptyState icon="🔍" title="No tasks found" description="Try adjusting your filters" />
      ) : (
        <div className="tasks-table-container">
          <table className="tasks-table">
            <thead>
              <tr>
                <th className="tasks-table__checkbox-col">
                  <input
                    type="checkbox"
                    checked={
                      selectedTasks.size === filteredTasks.length && filteredTasks.length > 0
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th>Name</th>
                <th>Template</th>
                <th>Status</th>
                <th>Next Run</th>
                <th>Last Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr key={task.id} className={task.enabled ? '' : 'tasks-table__row--disabled'}>
                  <td className="tasks-table__checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={(e) => handleSelectTask(task.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <div className="tasks-table__task-name">{task.name}</div>
                    {task.description && (
                      <div className="tasks-table__task-description">{task.description}</div>
                    )}
                  </td>
                  <td>{getTemplateName(task.templateId)}</td>
                  <td>
                    <span
                      className={`task-status task-status--${task.enabled ? 'enabled' : 'disabled'}`}
                    >
                      {task.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>{task.enabled ? formatNextRun(task.nextRunAt) : '-'}</td>
                  <td>{task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : 'Never'}</td>
                  <td>
                    <div className="tasks-table__actions">
                      <button
                        className="btn btn--small btn--secondary"
                        onClick={() => {
                          void handleRun(task);
                        }}
                        title="Run now"
                      >
                        ▶
                      </button>
                      <button
                        className="btn btn--small btn--secondary"
                        onClick={() => handleEditTask(task)}
                        title="Edit"
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn--small btn--secondary"
                        onClick={() => {
                          void handleToggle(task);
                        }}
                        title={task.enabled ? 'Disable' : 'Enable'}
                      >
                        {task.enabled ? '⏸' : '▶️'}
                      </button>
                      <button
                        className="btn btn--small btn--secondary"
                        onClick={() => {
                          void handleDelete(task);
                        }}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
