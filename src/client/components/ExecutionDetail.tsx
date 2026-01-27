import type { Execution, ExecutionOutput } from '../../shared/types';
import '../styles/executions.css';

interface ExecutionDetailProps {
  execution: Execution;
  taskName: string;
  onBack: () => void;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatOutput(output: ExecutionOutput | null): { console: string[]; result: unknown } {
  if (!output) return { console: [], result: undefined };
  return {
    console: output.console ?? [],
    result: output.result,
  };
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return 'Success';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'timeout':
      return 'Timeout';
    default:
      return status;
  }
}

function getStatusClass(status: string): string {
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
}

function handleExportSingle(execution: Execution, taskName: string): void {
  const exportData = {
    id: execution.id,
    taskId: execution.taskId,
    taskName,
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    durationMs: execution.durationMs,
    output: execution.output,
    error: execution.error,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `execution-${execution.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExecutionDetail({ execution, taskName, onBack }: ExecutionDetailProps) {
  const { console: consoleLines, result } = formatOutput(execution.output);
  const hasResult = result !== undefined && result !== null;

  return (
    <div className="execution-detail">
      <div className="execution-detail__header">
        <button className="btn btn--secondary" onClick={onBack}>
          Back
        </button>
        <h2 className="execution-detail__title">Execution #{execution.id}</h2>
        <button
          className="btn btn--secondary"
          onClick={() => handleExportSingle(execution, taskName)}
          title="Export as JSON"
        >
          Export
        </button>
      </div>

      <div className="execution-detail__meta">
        <div className="execution-detail__meta-grid">
          <div className="execution-detail__meta-item">
            <span className="execution-detail__meta-label">Task</span>
            <span className="execution-detail__meta-value">{taskName}</span>
          </div>
          <div className="execution-detail__meta-item">
            <span className="execution-detail__meta-label">Status</span>
            <span className={`exec-status ${getStatusClass(execution.status)}`}>
              {getStatusLabel(execution.status)}
            </span>
          </div>
          <div className="execution-detail__meta-item">
            <span className="execution-detail__meta-label">Started</span>
            <span className="execution-detail__meta-value">
              {formatDateTime(execution.startedAt)}
            </span>
          </div>
          <div className="execution-detail__meta-item">
            <span className="execution-detail__meta-label">Finished</span>
            <span className="execution-detail__meta-value">
              {execution.finishedAt ? formatDateTime(execution.finishedAt) : 'In progress'}
            </span>
          </div>
          <div className="execution-detail__meta-item">
            <span className="execution-detail__meta-label">Duration</span>
            <span className="execution-detail__meta-value">
              {formatDuration(execution.durationMs)}
            </span>
          </div>
        </div>
      </div>

      {consoleLines.length > 0 && (
        <div className="execution-detail__section">
          <h3 className="execution-detail__section-title">Console Output</h3>
          <pre className="execution-detail__console">
            {consoleLines.map((line, index) => (
              <div key={index} className="execution-detail__console-line">
                <span className="execution-detail__line-number">{index + 1}</span>
                <span className="execution-detail__line-content">{line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}

      {hasResult && (
        <div className="execution-detail__section">
          <h3 className="execution-detail__section-title">Return Value</h3>
          <pre className="execution-detail__result">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {execution.error && (
        <div className="execution-detail__section execution-detail__section--error">
          <h3 className="execution-detail__section-title">Error</h3>
          <pre className="execution-detail__error">{execution.error}</pre>
        </div>
      )}

      {consoleLines.length === 0 && !hasResult && !execution.error && (
        <div className="execution-detail__section">
          <p className="execution-detail__no-output">No output captured for this execution.</p>
        </div>
      )}
    </div>
  );
}
