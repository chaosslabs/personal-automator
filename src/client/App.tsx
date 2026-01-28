import { useState, useEffect } from 'react';
import './styles/index.css';
import { useTheme } from './contexts/ThemeContext';
import { useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TemplatesView } from './views/TemplatesView';
import { TasksView } from './views/TasksView';
import { ExecutionsView } from './views/ExecutionsView';
import { CredentialsView } from './views/CredentialsView';
import { ImportExportView } from './views/ImportExportView';
import { LoginView } from './views/LoginView';
import type { SystemStatus } from '../shared/types.js';

type View = 'tasks' | 'templates' | 'executions' | 'credentials' | 'import-export';

function App() {
  const [currentView, setCurrentView] = useState<View>('tasks');
  const [serverStatus, setServerStatus] = useState<SystemStatus | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { authenticated, user, providers, loading: authLoading, logout } = useAuth();

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

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  // If auth is enabled (providers configured) and user is not authenticated, show login
  const authEnabled = providers.length > 0;
  if (authEnabled && !authenticated) {
    return <LoginView />;
  }

  const handleLogout = () => {
    void logout();
  };

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
          {authenticated && user && (
            <div className="user-info">
              {user.avatarUrl && <img src={user.avatarUrl} alt="" className="user-avatar" />}
              <span className="user-name">{user.name ?? user.email ?? 'User'}</span>
              <button className="logout-button" onClick={handleLogout} title="Sign out">
                Sign out
              </button>
            </div>
          )}
          <div className="footer-controls">
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <span className="status">
              {serverStatus?.status === 'ok' ? 'Connected' : 'Disconnected'}
            </span>
          </div>
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
