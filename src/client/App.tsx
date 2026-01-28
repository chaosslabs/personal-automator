import { useState, useEffect } from 'react';
import './styles/index.css';
import { useTheme } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TemplatesView } from './views/TemplatesView';
import { TasksView } from './views/TasksView';
import { ExecutionsView } from './views/ExecutionsView';
import { CredentialsView } from './views/CredentialsView';
import { ImportExportView } from './views/ImportExportView';
import type { SystemStatus } from '../shared/types.js';

type View = 'tasks' | 'templates' | 'executions' | 'credentials' | 'import-export';

function App() {
  const [currentView, setCurrentView] = useState<View>('tasks');
  const [serverStatus, setServerStatus] = useState<SystemStatus | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const loadServerStatus = async () => {
      try {
        const response = await fetch('/api/status');
        const data = (await response.json()) as SystemStatus;
        setServerStatus(data);
      } catch (error) {
        console.error('Failed to load server status:', error);
      }
    };
    void loadServerStatus();
  }, []);

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>Personal Automator</h1>
          <span className="version">{serverStatus?.version ?? ''}</span>
        </div>

        <ul className="nav-list">
          <li>
            <button
              className={`nav-item ${currentView === 'tasks' ? 'active' : ''}`}
              onClick={() => setCurrentView('tasks')}
            >
              Tasks
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${currentView === 'templates' ? 'active' : ''}`}
              onClick={() => setCurrentView('templates')}
            >
              Templates
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${currentView === 'executions' ? 'active' : ''}`}
              onClick={() => setCurrentView('executions')}
            >
              Executions
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${currentView === 'credentials' ? 'active' : ''}`}
              onClick={() => setCurrentView('credentials')}
            >
              Credentials
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${currentView === 'import-export' ? 'active' : ''}`}
              onClick={() => setCurrentView('import-export')}
            >
              Import/Export
            </button>
          </li>
        </ul>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="status">
            {serverStatus?.status === 'ok' ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </nav>

      <main className="content">
        <ErrorBoundary>
          {currentView === 'tasks' && (
            <div className="view">
              <TasksView />
            </div>
          )}
          {currentView === 'templates' && (
            <div className="view">
              <TemplatesView />
            </div>
          )}
          {currentView === 'executions' && (
            <div className="view">
              <ExecutionsView />
            </div>
          )}
          {currentView === 'credentials' && (
            <div className="view">
              <CredentialsView />
            </div>
          )}
          {currentView === 'import-export' && (
            <div className="view">
              <ImportExportView />
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
