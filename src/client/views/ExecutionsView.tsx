import { useState, useEffect, useCallback } from 'react';
import type { Execution, Task, ExecutionFilters, ExecutionStatus } from '../../shared/types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { ExecutionDetail } from '../components/ExecutionDetail';
import { api } from '../utils/api';
import '../styles/executions.css';

const PAGE_SIZE = 25;

export function ExecutionsView() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [taskFilter, setTaskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);

  // Detail view
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);

  const loadExecutions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: ExecutionFilters = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };

      if (taskFilter !== 'all') {
        filters.taskId = parseInt(taskFilter, 10);
      }
      if (statusFilter !== 'all') {
        filters.status = statusFilter as ExecutionStatus;
      }
      if (startDate) {
        filters.startDate = startDate;
      }
      if (endDate) {
        filters.endDate = endDate;
      }

      const result = await api.getExecutions(filters);
      setExecutions(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load executions');
    } finally {
      setLoading(false);
    }
  }, [page, taskFilter, statusFilter, startDate, endDate]);

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadExecutions();
  }, [loadExecutions]);

  // Reset page when filters change
  const handleFilterChange = useCallback(
    (setter: (value: string) => void) => (value: string) => {
      setter(value);
      setPage(0);
    },
    []
  );

  const getTaskName = (taskId: number): string => {
    const task = tasks.find((t) => t.id === taskId);
    return task?.name ?? `Task #${taskId}`;
  };

  const formatDuration = (ms: number | null): string => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const formatDateTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusClass = (status: ExecutionStatus): string => {
    switch (status) {
      case 'success':
        return 'exec-status--success';
      case 'failed':
        return 'exec-status--failed';
      case 'running':
        return 'exec-status--running';
      case 'timeout':
        return 'exec-status--timeout';
      default:
        return '';
    }
  };

  const handleExport = () => {
    const exportData = executions.map((exec) => ({
      id: exec.id,
      taskId: exec.taskId,
      taskName: getTaskName(exec.taskId),
      status: exec.status,
      startedAt: exec.startedAt,
      finishedAt: exec.finishedAt,
      durationMs: exec.durationMs,
      output: exec.output,
      error: exec.error,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `executions-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleViewDetail = (execution: Execution) => {
    // Fetch full execution details (with output)
    api
      .getExecution(execution.id)
      .then((full) => {
        setSelectedExecution(full);
      })
      .catch((err: unknown) => {
        console.error('Failed to load execution details:', err);
        // Fall back to the summary data we already have
        setSelectedExecution(execution);
      });
  };

  const handleCloseDetail = () => {
    setSelectedExecution(null);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Detail view
  if (selectedExecution) {
    return (
      <ExecutionDetail
        execution={selectedExecution}
        taskName={getTaskName(selectedExecution.taskId)}
        onBack={handleCloseDetail}
      />
    );
  }

  // Loading state
  if (loading && executions.length === 0) {
    return <LoadingSpinner message="Loading executions..." />;
  }

  // Error state
  if (error && executions.length === 0) {
    return (
      <ErrorMessage
        title="Error"
        message={error}
        onRetry={() => {
          void loadExecutions();
        }}
      />
    );
  }

  // Empty state (no filters applied)
  if (
    total === 0 &&
    taskFilter === 'all' &&
    statusFilter === 'all' &&
    !startDate &&
    !endDate &&
    !loading
  ) {
    return (
      <EmptyState
        icon="📊"
        title="No executions yet"
        description="Run a task to see execution logs here"
      />
    );
  }

  return (
    <div className="executions-view">
      <div className="executions-view__header">
        <h2 className="executions-view__title">Execution History</h2>
        <button
          className="btn btn--secondary"
          onClick={handleExport}
          disabled={executions.length === 0}
          title="Export current view as JSON"
        >
          Export
        </button>
      </div>

      <div className="executions-view__filters">
        <select
          className="executions-view__filter"
          value={taskFilter}
          onChange={(e) => handleFilterChange(setTaskFilter)(e.target.value)}
        >
          <option value="all">All Tasks</option>
          {tasks.map((task) => (
            <option key={task.id} value={String(task.id)}>
              {task.name}
            </option>
          ))}
        </select>

        <select
          className="executions-view__filter"
          value={statusFilter}
          onChange={(e) => handleFilterChange(setStatusFilter)(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="timeout">Timeout</option>
        </select>

        <input
          type="date"
          className="executions-view__filter executions-view__date-input"
          value={startDate}
          onChange={(e) => handleFilterChange(setStartDate)(e.target.value)}
          title="Start date"
          placeholder="From"
        />

        <input
          type="date"
          className="executions-view__filter executions-view__date-input"
          value={endDate}
          onChange={(e) => handleFilterChange(setEndDate)(e.target.value)}
          title="End date"
          placeholder="To"
        />

        {(taskFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
          <button
            className="btn btn--small btn--secondary"
            onClick={() => {
              setTaskFilter('all');
              setStatusFilter('all');
              setStartDate('');
              setEndDate('');
              setPage(0);
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading && <div className="executions-view__loading-bar" />}

      {executions.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No executions found"
          description="Try adjusting your filters"
        />
      ) : (
        <>
          <div className="executions-table-container">
            <table className="executions-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr
                    key={execution.id}
                    className={`executions-table__row ${execution.status === 'running' ? 'executions-table__row--running' : ''}`}
                  >
                    <td className="executions-table__id">#{execution.id}</td>
                    <td className="executions-table__task">{getTaskName(execution.taskId)}</td>
                    <td>
                      <span className={`exec-status ${getStatusClass(execution.status)}`}>
                        {execution.status}
                      </span>
                    </td>
                    <td>{formatDateTime(execution.startedAt)}</td>
                    <td>{formatDuration(execution.durationMs)}</td>
                    <td>
                      <button
                        className="btn btn--small btn--secondary"
                        onClick={() => handleViewDetail(execution)}
                        title="View details"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="executions-view__pagination">
            <span className="executions-view__page-info">
              Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="executions-view__page-controls">
              <button
                className="btn btn--small btn--secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="executions-view__page-number">
                Page {page + 1} of {totalPages}
              </span>
              <button
                className="btn btn--small btn--secondary"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
