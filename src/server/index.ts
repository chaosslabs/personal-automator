import express, { Request, Response } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDatabase, closeDatabase } from './database.js';
import type { TaskFilters, ExecutionFilters, ExecutionStatus } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// Initialize database
const db = getDatabase();
console.log('Database initialized');

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

app.post('/api/templates', (req: Request, res: Response): void => {
  try {
    const { id, name, description, category, code, paramsSchema, requiredCredentials, suggestedSchedule } = req.body;

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
});

app.put('/api/templates/:id', (req: Request, res: Response): void => {
  try {
    const id = req.params['id'];
    if (!id) {
      res.status(400).json({ error: 'Template ID is required' });
      return;
    }

    const { name, description, category, code, paramsSchema, requiredCredentials, suggestedSchedule } = req.body;

    const template = db.updateTemplate(id, {
      name,
      description,
      category,
      code,
      paramsSchema,
      requiredCredentials,
      suggestedSchedule,
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

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

app.post('/api/tasks', (req: Request, res: Response): void => {
  try {
    const { templateId, name, description, params, scheduleType, scheduleValue, credentials, enabled } = req.body;

    if (!templateId || !name || !scheduleType || !scheduleValue) {
      res.status(400).json({ error: 'templateId, name, scheduleType, and scheduleValue are required' });
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

app.put('/api/tasks/:id', (req: Request, res: Response): void => {
  try {
    const idParam = req.params['id'];
    if (!idParam) {
      res.status(400).json({ error: 'Task ID is required' });
      return;
    }

    const { name, description, params, scheduleType, scheduleValue, credentials, enabled } = req.body;

    const task = db.updateTask(parseInt(idParam, 10), {
      name,
      description,
      params,
      scheduleType,
      scheduleValue,
      credentials,
      enabled,
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

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
app.get('/api/credentials', (_req: Request, res: Response): void => {
  try {
    const credentials = db.getCredentials();
    res.json(credentials);
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

app.post('/api/credentials', (req: Request, res: Response): void => {
  try {
    const { name, type, description } = req.body;

    if (!name || !type) {
      res.status(400).json({ error: 'name and type are required' });
      return;
    }

    if (db.credentialExists(name)) {
      res.status(409).json({ error: 'Credential with this name already exists' });
      return;
    }

    // Note: Credential values are stored separately by the credential vault (Phase 1.3)
    // This only creates the metadata
    const credential = db.createCredential({
      name,
      type,
      description: description ?? null,
    });

    res.status(201).json(credential);
  } catch (error) {
    console.error('Error creating credential:', error);
    res.status(500).json({ error: 'Failed to create credential' });
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
    closeDatabase();
    console.log('Database closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
