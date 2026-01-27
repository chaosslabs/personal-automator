/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ExecutionsView } from '../src/client/views/ExecutionsView';
import { ExecutionDetail } from '../src/client/components/ExecutionDetail';
import type { Execution, Task, PaginatedResponse } from '../src/shared/types';

// Mock the api module
vi.mock('../src/client/utils/api', () => ({
  api: {
    getExecutions: vi.fn(),
    getExecution: vi.fn(),
    getTasks: vi.fn(),
  },
}));

// Import mocked api - use bound references to avoid unbound-method lint errors
import { api } from '../src/client/utils/api';

const mockApi = vi.mocked(api);


const mockTasks: Task[] = [
  {
    id: 1,
    templateId: 'test-template',
    name: 'Test Task',
    description: 'A test task',
    params: {},
    scheduleType: 'cron',
    scheduleValue: '* * * * *',
    credentials: [],
    enabled: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    lastRunAt: '2025-01-15T10:00:00Z',
    nextRunAt: '2025-01-16T10:00:00Z',
  },
  {
    id: 2,
    templateId: 'another-template',
    name: 'Another Task',
    description: null,
    params: {},
    scheduleType: 'interval',
    scheduleValue: '3600000',
    credentials: [],
    enabled: false,
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    lastRunAt: null,
    nextRunAt: null,
  },
];

const mockExecutions: Execution[] = [
  {
    id: 1,
    taskId: 1,
    startedAt: '2025-01-15T10:00:00Z',
    finishedAt: '2025-01-15T10:00:01Z',
    status: 'success',
    output: { console: ['Hello World'], result: 42 },
    error: null,
    durationMs: 1000,
  },
  {
    id: 2,
    taskId: 1,
    startedAt: '2025-01-14T10:00:00Z',
    finishedAt: '2025-01-14T10:00:05Z',
    status: 'failed',
    output: { console: ['Starting...', 'Error occurred'], result: null },
    error: 'TypeError: Cannot read property of undefined',
    durationMs: 5000,
  },
  {
    id: 3,
    taskId: 2,
    startedAt: '2025-01-13T10:00:00Z',
    finishedAt: '2025-01-13T10:01:00Z',
    status: 'timeout',
    output: null,
    error: 'Task timed out after 60000ms',
    durationMs: 60000,
  },
];

const mockPaginatedResponse: PaginatedResponse<Execution> = {
  data: mockExecutions,
  total: 3,
  limit: 25,
  offset: 0,
};

describe('ExecutionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getTasks.mockResolvedValue(mockTasks);
    mockApi.getExecutions.mockResolvedValue(mockPaginatedResponse);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    mockApi.getExecution.mockResolvedValue(mockExecutions[0]!);
  });

  it('should render loading state initially', () => {
    // Make the promise hang to see loading state
    mockApi.getExecutions.mockReturnValue(new Promise(() => {}));
    render(<ExecutionsView />);
    expect(screen.getByText('Loading executions...')).toBeInTheDocument();
  });

  it('should render execution history table', async () => {
    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('Execution History')).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('should display executions in the table', async () => {
    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();

    // Check task names are resolved (2 in table + 1 in filter dropdown)
    expect(screen.getAllByText('Test Task')).toHaveLength(3);
    // Another Task: 1 in table + 1 in filter dropdown
    expect(screen.getAllByText('Another Task')).toHaveLength(2);

    // Check status badges
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
  });

  it('should display duration in human-readable format', async () => {
    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('1.0s')).toBeInTheDocument();
    });
    expect(screen.getByText('5.0s')).toBeInTheDocument();
    expect(screen.getByText('1m 0s')).toBeInTheDocument();
  });

  it('should show empty state when no executions exist', async () => {
    mockApi.getExecutions.mockResolvedValue({
      data: [],
      total: 0,
      limit: 25,
      offset: 0,
    });

    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('No executions yet')).toBeInTheDocument();
    });
    expect(screen.getByText('Run a task to see execution logs here')).toBeInTheDocument();
  });

  it('should show error state when API fails', async () => {
    mockApi.getExecutions.mockRejectedValue(new Error('Network error'));

    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should filter by task', async () => {
    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('Execution History')).toBeInTheDocument();
    });

    const taskSelect = screen.getByDisplayValue('All Tasks');
    fireEvent.change(taskSelect, { target: { value: '1' } });

    await waitFor(() => {
      expect(mockApi.getExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 1 })
      );
    });
  });

  it('should filter by status', async () => {
    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('Execution History')).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue('All Statuses');
    fireEvent.change(statusSelect, { target: { value: 'failed' } });

    await waitFor(() => {
      expect(mockApi.getExecutions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
    });
  });

  it('should display pagination info', async () => {
    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('Showing 1-3 of 3')).toBeInTheDocument();
    });
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('should navigate to detail view on View click', async () => {
    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getAllByText('View')).toHaveLength(3);
    });

    const viewButtons = screen.getAllByText('View');
    fireEvent.click(viewButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(mockApi.getExecution).toHaveBeenCalledWith(1);
    });
  });

  it('should handle export button', async () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test');
    const mockRevokeObjectURL = vi.fn();
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    render(<ExecutionsView />);

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Export'));

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });
});

describe('ExecutionDetail', () => {
  const successExecution: Execution = {
    id: 1,
    taskId: 1,
    startedAt: '2025-01-15T10:00:00Z',
    finishedAt: '2025-01-15T10:00:01Z',
    status: 'success',
    output: { console: ['Line 1', 'Line 2', 'Line 3'], result: { key: 'value' } },
    error: null,
    durationMs: 1000,
  };

  const failedExecution: Execution = {
    id: 2,
    taskId: 1,
    startedAt: '2025-01-14T10:00:00Z',
    finishedAt: '2025-01-14T10:00:05Z',
    status: 'failed',
    output: { console: ['Starting...'], result: null },
    error: 'TypeError: Cannot read property of undefined\n    at Object.<anonymous> (script.js:1:1)',
    durationMs: 5000,
  };

  const emptyExecution: Execution = {
    id: 3,
    taskId: 2,
    startedAt: '2025-01-13T10:00:00Z',
    finishedAt: '2025-01-13T10:00:01Z',
    status: 'success',
    output: null,
    error: null,
    durationMs: 100,
  };

  it('should render execution detail header', () => {
    render(
      <ExecutionDetail execution={successExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    expect(screen.getByText('Execution #1')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('should display metadata section', () => {
    render(
      <ExecutionDetail execution={successExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    expect(screen.getByText('Test Task')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('1.0s')).toBeInTheDocument();
  });

  it('should display console output with line numbers', () => {
    render(
      <ExecutionDetail execution={successExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    expect(screen.getByText('Console Output')).toBeInTheDocument();
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
    expect(screen.getByText('Line 3')).toBeInTheDocument();
    // Line numbers
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should display return value for successful executions', () => {
    render(
      <ExecutionDetail execution={successExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    expect(screen.getByText('Return Value')).toBeInTheDocument();
    expect(screen.getByText(/"key": "value"/)).toBeInTheDocument();
  });

  it('should display error stack trace for failed executions', () => {
    render(
      <ExecutionDetail execution={failedExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(
      screen.getByText(/TypeError: Cannot read property of undefined/)
    ).toBeInTheDocument();
  });

  it('should show no output message when execution has no data', () => {
    render(
      <ExecutionDetail execution={emptyExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    expect(screen.getByText('No output captured for this execution.')).toBeInTheDocument();
  });

  it('should call onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    render(<ExecutionDetail execution={successExecution} taskName="Test Task" onBack={onBack} />);

    fireEvent.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('should handle export single execution', () => {
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test');
    const mockRevokeObjectURL = vi.fn();
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    render(
      <ExecutionDetail execution={successExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    fireEvent.click(screen.getByText('Export'));

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  it('should display running status for in-progress executions', () => {
    const runningExecution: Execution = {
      id: 4,
      taskId: 1,
      startedAt: '2025-01-15T10:00:00Z',
      finishedAt: null,
      status: 'running',
      output: null,
      error: null,
      durationMs: null,
    };

    render(
      <ExecutionDetail execution={runningExecution} taskName="Test Task" onBack={vi.fn()} />
    );

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });
});
