import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDatabase, closeDatabase } from './database/index.js';
import { getVault, closeVault } from './vault/index.js';
import type {
  TaskFilters,
  ExecutionFilters,
  ExecutionStatus,
  ParamDefinition,
  CredentialType,
  ScheduleType,
} from '../shared/types.js';

// Request body types
interface CreateTemplateBody {
  id?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  code?: string;
  paramsSchema?: ParamDefinition[];
  requiredCredentials?: string[];
  suggestedSchedule?: string | null;
}

interface UpdateTemplateBody {
  name?: string;
  description?: string | null;
  category?: string | null;
  code?: string;
  paramsSchema?: ParamDefinition[];
  requiredCredentials?: string[];
  suggestedSchedule?: string | null;
}

interface CreateTaskBody {
  templateId?: string;
  name?: string;
  description?: string | null;
  params?: Record<string, unknown>;
  scheduleType?: ScheduleType;
  scheduleValue?: string;
  credentials?: string[];
  enabled?: boolean;
}

interface UpdateTaskBody {
  name?: string;
  description?: string | null;
  params?: Record<string, unknown>;
  scheduleType?: ScheduleType;
  scheduleValue?: string;
  credentials?: string[];
  enabled?: boolean;
}

interface CreateCredentialBody {
  name?: string;
  type?: CredentialType;
  description?: string | null;
  value?: string; // The plaintext value to encrypt and store
}

interface UpdateCredentialValueBody {
  value?: string; // The new plaintext value to encrypt and store
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// Initialize database and vault
const db = getDatabase();
console.log('Database initialized');

const vault = getVault();
console.log('Credential vault initialized');

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/status', (_req: Request, res: Response): void => {
  const stats = db.getStats();
  res.json({
    status: 'ok',
    version: process.env['npm_package_version'] ?? '0.1.0',
    uptime: process.uptime(),
    schedulerRunning: false, // Will be implemented in 1.5
    databaseConnected: db.isConnected(),
    tasksCount: stats.tasksCount,
    enabledTasksCount: stats.enabledTasksCount,
    pendingExecutions: stats.pendingExecutions,
    recentErrors: stats.recentErrors,
  });
});

// Template routes
app.get('/api/templates', (req: Request, res: Response): void => {
  try {
    const category = req.query['category'] as string | undefined;
    const templates = db.getTemplates(category);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

app.get('/api/templates/:id', (req: Request, res: Response): void => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Template ID is required' });
      return;
    }
    const template = db.getTemplate(id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

app.post(
  '/api/templates',
  (req: Request<unknown, unknown, CreateTemplateBody>, res: Response): void => {
    try {
      const {
        id,
        name,
        description,
        category,
        code,
        paramsSchema,
        requiredCredentials,
        suggestedSchedule,
      } = req.body;

      if (!id || !name || !code) {
        res.status(400).json({ error: 'id, name, and code are required' });
        return;
      }

      if (db.templateExists(id)) {
        res.status(409).json({ error: 'Template with this ID already exists' });
        return;
      }

      const template = db.createTemplate({
        id,
        name,
        description: description ?? null,
        category: category ?? null,
        code,
        paramsSchema: paramsSchema ?? [],
        requiredCredentials: requiredCredentials ?? [],
        suggestedSchedule: suggestedSchedule ?? null,
        isBuiltin: false,
      });

      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating template:', error);
      res.status(500).json({ error: 'Failed to create template' });
    }
  }
);

app.put(
  '/api/templates/:id',
  (req: Request<{ id: string }, unknown, UpdateTemplateBody>, res: Response): void => {
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ error: 'Template ID is required' });
        return;
      }

      const {
        name,
        description,
        category,
        code,
        paramsSchema,
        requiredCredentials,
        suggestedSchedule,
      } = req.body;

      // Build updates object, only including defined properties
      const updates: Parameters<typeof db.updateTemplate>[1] = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (code !== undefined) updates.code = code;
      if (paramsSchema !== undefined) updates.paramsSchema = paramsSchema;
      if (requiredCredentials !== undefined) updates.requiredCredentials = requiredCredentials;
      if (suggestedSchedule !== undefined) updates.suggestedSchedule = suggestedSchedule;

      const template = db.updateTemplate(id, updates);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      res.json(template);
    } catch (error) {
      console.error('Error updating template:', error);
      res.status(500).json({ error: 'Failed to update template' });
    }
  }
);

app.delete('/api/templates/:id', (req: Request, res: Response): void => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Template ID is required' });
      return;
    }
    const deleted = db.deleteTemplate(id);
    if (!deleted) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Task routes
app.get('/api/tasks', (req: Request, res: Response): void => {
  try {
    const filters: TaskFilters = {};

    if (req.query['enabled'] !== undefined) {
      filters.enabled = req.query['enabled'] === 'true';
    }
    if (req.query['hasErrors'] === 'true') {
      filters.hasErrors = true;
    }
    if (req.query['templateId']) {
      filters.templateId = req.query['templateId'] as string;
    }

    const tasks = db.getTasks(filters);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.get('/api/tasks/:id', (req: Request, res: Response): void => {
  try {
    const idParam = req.params['id'];
    if (!idParam) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }
    const task = db.getTask(parseInt(idParam, 10));
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

app.post('/api/tasks', (req: Request<unknown, unknown, CreateTaskBody>, res: Response): void => {
  try {
    const {
      templateId,
      name,
      description,
      params,
      scheduleType,
      scheduleValue,
      credentials,
      enabled,
    } = req.body;

    if (!templateId || !name || !scheduleType || !scheduleValue) {
      res
        .status(400)
        .json({ error: 'templateId, name, scheduleType, and scheduleValue are required' });
      return;
    }

    if (!db.templateExists(templateId)) {
      res.status(400).json({ error: 'Template not found' });
      return;
    }

    if (db.getTaskByName(name)) {
      res.status(409).json({ error: 'Task with this name already exists' });
      return;
    }

    const task = db.createTask({
      templateId,
      name,
      description: description ?? null,
      params: params ?? {},
      scheduleType,
      scheduleValue,
      credentials: credentials ?? [],
      enabled: enabled ?? true,
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put(
  '/api/tasks/:id',
  (req: Request<{ id: string }, unknown, UpdateTaskBody>, res: Response): void => {
    try {
      const idParam = req.params['id'];
      if (!idParam) {
        res.status(400).json({ error: 'Task ID is required' });
        return;
      }

      const { name, description, params, scheduleType, scheduleValue, credentials, enabled } =
        req.body;

      // Build updates object, only including defined properties
      const updates: Parameters<typeof db.updateTask>[1] = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (params !== undefined) updates.params = params;
      if (scheduleType !== undefined) updates.scheduleType = scheduleType;
      if (scheduleValue !== undefined) updates.scheduleValue = scheduleValue;
      if (credentials !== undefined) updates.credentials = credentials;
      if (enabled !== undefined) updates.enabled = enabled;

      const task = db.updateTask(parseInt(idParam, 10), updates);

      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json(task);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }
);

app.delete('/api/tasks/:id', (req: Request, res: Response): void => {
  try {
    const idParam = req.params['id'];
    if (!idParam) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }
    const deleted = db.deleteTask(parseInt(idParam, 10));
    if (!deleted) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.post('/api/tasks/:id/toggle', (req: Request, res: Response): void => {
  try {
    const idParam = req.params['id'];
    if (!idParam) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }
    const task = db.toggleTask(parseInt(idParam, 10));
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  } catch (error) {
    console.error('Error toggling task:', error);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

// Execution routes
app.get('/api/executions', (req: Request, res: Response): void => {
  try {
    const filters: ExecutionFilters = {
      limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50,
      offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : 0,
    };

    if (req.query['taskId']) {
      filters.taskId = parseInt(req.query['taskId'] as string, 10);
    }
    if (req.query['status']) {
      filters.status = req.query['status'] as ExecutionStatus;
    }
    if (req.query['startDate']) {
      filters.startDate = req.query['startDate'] as string;
    }
    if (req.query['endDate']) {
      filters.endDate = req.query['endDate'] as string;
    }

    const result = db.getExecutions(filters);
    res.json({
      data: result.executions,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

app.get('/api/executions/:id', (req: Request, res: Response): void => {
  try {
    const idParam = req.params['id'];
    if (!idParam) {
      res.status(400).json({ error: 'Execution ID is required' });
      return;
    }
    const execution = db.getExecution(parseInt(idParam, 10));
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }
    res.json(execution);
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

// Credential routes
// Note: Credential values are NEVER returned in API responses (security requirement)
app.get('/api/credentials', (_req: Request, res: Response): void => {
  try {
    // Returns credentials with hasValue indicator (but not actual values)
    const credentials = db.credentials.getAllWithValueStatus();
    res.json(credentials);
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

app.post(
  '/api/credentials',
  (req: Request<unknown, unknown, CreateCredentialBody>, res: Response): void => {
    try {
      const { name, type, description, value } = req.body;

      if (!name || !type) {
        res.status(400).json({ error: 'name and type are required' });
        return;
      }

      if (db.credentialExists(name)) {
        res.status(409).json({ error: 'Credential with this name already exists' });
        return;
      }

      let credential;

      if (value) {
        // Encrypt and store the value along with metadata
        const encryptedValue = vault.encrypt(value);
        credential = db.credentials.createWithValue(
          {
            name,
            type,
            description: description ?? null,
          },
          encryptedValue
        );
      } else {
        // Create metadata only (value can be added later)
        credential = db.createCredential({
          name,
          type,
          description: description ?? null,
        });
      }

      // Return credential with hasValue indicator
      res.status(201).json({
        ...credential,
        hasValue: !!value,
      });
    } catch (error) {
      console.error('Error creating credential:', error);
      res.status(500).json({ error: 'Failed to create credential' });
    }
  }
);

// Update credential value (encrypt and store new value)
app.put(
  '/api/credentials/:name/value',
  (req: Request<{ name: string }, unknown, UpdateCredentialValueBody>, res: Response): void => {
    try {
      const name = req.params['name'];
      if (!name) {
        res.status(400).json({ error: 'Credential name is required' });
        return;
      }

      const { value } = req.body;
      if (!value) {
        res.status(400).json({ error: 'value is required' });
        return;
      }

      const credential = db.getCredentialByName(name);
      if (!credential) {
        res.status(404).json({ error: 'Credential not found' });
        return;
      }

      // Encrypt and store the new value
      const encryptedValue = vault.encrypt(value);
      const updated = db.credentials.updateValue(name, encryptedValue);

      if (!updated) {
        res.status(500).json({ error: 'Failed to update credential value' });
        return;
      }

      res.json({
        ...credential,
        hasValue: true,
        message: 'Credential value updated successfully',
      });
    } catch (error) {
      console.error('Error updating credential value:', error);
      res.status(500).json({ error: 'Failed to update credential value' });
    }
  }
);

// Clear credential value (remove encrypted value but keep metadata)
app.delete('/api/credentials/:name/value', (req: Request, res: Response): void => {
  try {
    const name = req.params['name'];
    if (!name) {
      res.status(400).json({ error: 'Credential name is required' });
      return;
    }

    const credential = db.getCredentialByName(name);
    if (!credential) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const cleared = db.credentials.clearEncryptedValue(name);
    if (!cleared) {
      res.status(500).json({ error: 'Failed to clear credential value' });
      return;
    }

    res.json({
      ...credential,
      hasValue: false,
      message: 'Credential value cleared successfully',
    });
  } catch (error) {
    console.error('Error clearing credential value:', error);
    res.status(500).json({ error: 'Failed to clear credential value' });
  }
});

app.delete('/api/credentials/:id', (req: Request, res: Response): void => {
  try {
    const idParam = req.params['id'];
    if (!idParam) {
      res.status(400).json({ error: 'Credential ID is required' });
      return;
    }
    const id = parseInt(idParam, 10);
    const credential = db.getCredential(id);

    if (!credential) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    // Check if credential is in use
    const inUse = db.getCredentialsInUse();
    if (inUse.includes(credential.name)) {
      res.status(409).json({
        error: 'Credential is in use by one or more tasks',
        message: 'Delete or modify the tasks using this credential first',
      });
      return;
    }

    const deleted = db.deleteCredential(id);
    if (!deleted) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// Serve static files in production
if (process.env['NODE_ENV'] === 'production') {
  const clientPath = join(__dirname, '../client');
  app.use(express.static(clientPath));

  // SPA fallback
  app.get('*', (_req: Request, res: Response): void => {
    res.sendFile(join(clientPath, 'index.html'));
  });
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
const shutdown = (): void => {
  console.log('Shutting down...');
  server.close(() => {
    console.log('HTTP server closed');
    closeVault();
    console.log('Vault closed');
    closeDatabase();
    console.log('Database closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
