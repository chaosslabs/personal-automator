import type {
  Template,
  Task,
  Execution,
  Credential,
  SystemStatus,
  ExecutionFilters,
  TaskFilters,
  PaginatedResponse,
  ParamDefinition,
  ScheduleType,
  CredentialType,
} from '../../shared/types.js';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = (await response.json()) as { error?: string };
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Ignore JSON parse errors for error responses
    }
    throw new ApiError(errorMessage, response.status);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  // System
  async getStatus(): Promise<SystemStatus> {
    return fetchJSON<SystemStatus>(`${API_BASE}/status`);
  },

  // Templates
  async getTemplates(category?: string): Promise<Template[]> {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetchJSON<Template[]>(`${API_BASE}/templates${params}`);
  },

  async getTemplate(id: string): Promise<Template> {
    return fetchJSON<Template>(`${API_BASE}/templates/${encodeURIComponent(id)}`);
  },

  async createTemplate(data: {
    id: string;
    name: string;
    code: string;
    description?: string;
    category?: string;
    paramsSchema?: ParamDefinition[];
    requiredCredentials?: string[];
    suggestedSchedule?: string;
  }): Promise<Template> {
    return fetchJSON<Template>(`${API_BASE}/templates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTemplate(
    id: string,
    updates: {
      name?: string;
      description?: string | null;
      category?: string | null;
      code?: string;
      paramsSchema?: ParamDefinition[];
      requiredCredentials?: string[];
      suggestedSchedule?: string | null;
    }
  ): Promise<Template> {
    return fetchJSON<Template>(`${API_BASE}/templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteTemplate(id: string): Promise<void> {
    return fetchJSON<void>(`${API_BASE}/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Tasks
  async getTasks(filters?: TaskFilters): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.enabled !== undefined) params.append('enabled', String(filters.enabled));
    if (filters?.hasErrors) params.append('hasErrors', 'true');
    if (filters?.templateId) params.append('templateId', filters.templateId);

    const queryString = params.toString();
    return fetchJSON<Task[]>(`${API_BASE}/tasks${queryString ? `?${queryString}` : ''}`);
  },

  async getTask(id: number): Promise<Task> {
    return fetchJSON<Task>(`${API_BASE}/tasks/${id}`);
  },

  async createTask(data: {
    templateId: string;
    name: string;
    scheduleType: ScheduleType;
    scheduleValue: string;
    description?: string;
    params?: Record<string, unknown>;
    credentials?: string[];
    enabled?: boolean;
  }): Promise<Task> {
    return fetchJSON<Task>(`${API_BASE}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTask(
    id: number,
    updates: {
      name?: string;
      description?: string | null;
      params?: Record<string, unknown>;
      scheduleType?: ScheduleType;
      scheduleValue?: string;
      credentials?: string[];
      enabled?: boolean;
    }
  ): Promise<Task> {
    return fetchJSON<Task>(`${API_BASE}/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteTask(id: number): Promise<void> {
    return fetchJSON<void>(`${API_BASE}/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  async toggleTask(id: number): Promise<Task> {
    return fetchJSON<Task>(`${API_BASE}/tasks/${id}/toggle`, {
      method: 'POST',
    });
  },

  async executeTask(
    id: number,
    options?: { timeoutMs?: number }
  ): Promise<{
    success: boolean;
    executionId: number;
    status: string;
    output?: unknown;
    error?: string;
    durationMs?: number;
  }> {
    return fetchJSON(`${API_BASE}/tasks/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  async preflightCheck(id: number): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    return fetchJSON(`${API_BASE}/tasks/${id}/preflight`);
  },

  // Executions
  async getExecutions(filters?: ExecutionFilters): Promise<PaginatedResponse<Execution>> {
    const params = new URLSearchParams();
    if (filters?.taskId !== undefined) params.append('taskId', String(filters.taskId));
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.append('offset', String(filters.offset));

    const queryString = params.toString();
    return fetchJSON<PaginatedResponse<Execution>>(
      `${API_BASE}/executions${queryString ? `?${queryString}` : ''}`
    );
  },

  async getExecution(id: number): Promise<Execution> {
    return fetchJSON<Execution>(`${API_BASE}/executions/${id}`);
  },

  // Credentials
  async getCredentials(): Promise<Array<Credential & { hasValue: boolean }>> {
    return fetchJSON<Array<Credential & { hasValue: boolean }>>(`${API_BASE}/credentials`);
  },

  async createCredential(data: {
    name: string;
    type: CredentialType;
    description?: string;
    value?: string;
  }): Promise<Credential & { hasValue: boolean }> {
    return fetchJSON<Credential & { hasValue: boolean }>(`${API_BASE}/credentials`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCredentialValue(name: string, value: string): Promise<Credential> {
    return fetchJSON<Credential>(`${API_BASE}/credentials/${encodeURIComponent(name)}/value`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  },

  async clearCredentialValue(name: string): Promise<Credential> {
    return fetchJSON<Credential>(`${API_BASE}/credentials/${encodeURIComponent(name)}/value`, {
      method: 'DELETE',
    });
  },

  async deleteCredential(id: number): Promise<void> {
    return fetchJSON<void>(`${API_BASE}/credentials/${id}`, {
      method: 'DELETE',
    });
  },
};

export { ApiError };
