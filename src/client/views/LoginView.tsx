import { useAuth } from '../contexts/AuthContext';
import type { AuthProvider } from '../../shared/types.js';
import './LoginView.css';

const providerLabels: Record<AuthProvider, string> = {
  google: 'Google',
  github: 'GitHub',
};

const providerIcons: Record<AuthProvider, string> = {
  google: 'G',
  github: 'GH',
};

export function LoginView() {
  const { providers, login, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-view">
        <div className="login-card">
          <div className="login-loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="login-view">
        <div className="login-card">
          <h1>Personal Automator</h1>
          <p className="login-message">No authentication providers configured.</p>
          <p className="login-hint">
            Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET
            environment variables to enable social login.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-view">
      <div className="login-card">
        <h1>Personal Automator</h1>
        <p className="login-message">Sign in to continue</p>

        <div className="login-providers">
          {providers.map((provider) => (
            <button
              key={provider}
              className={`login-button login-button-${provider}`}
              onClick={() => login(provider)}
            >
              <span className="login-button-icon">{providerIcons[provider]}</span>
              <span className="login-button-text">Continue with {providerLabels[provider]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
