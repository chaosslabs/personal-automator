import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'ok',
    version: process.env['npm_package_version'] ?? '0.1.0',
    uptime: process.uptime(),
  });
});

// Template routes (placeholder)
app.get('/api/templates', (_req, res) => {
  res.json([]);
});

// Task routes (placeholder)
app.get('/api/tasks', (_req, res) => {
  res.json([]);
});

// Execution routes (placeholder)
app.get('/api/executions', (_req, res) => {
  res.json([]);
});

// Credential routes (placeholder)
app.get('/api/credentials', (_req, res) => {
  res.json([]);
});

// Serve static files in production
if (process.env['NODE_ENV'] === 'production') {
  const clientPath = join(__dirname, '../client');
  app.use(express.static(clientPath));

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(join(clientPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});
