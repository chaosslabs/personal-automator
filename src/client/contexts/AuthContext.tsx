import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthProvider } from '../../shared/types.js';

interface AuthUser {
  id: number;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  provider: AuthProvider;
}

interface AuthState {
  authenticated: boolean;
  user: AuthUser | null;
  providers: AuthProvider[];
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (provider: AuthProvider) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    user: null,
    providers: [],
    loading: true,
  });

  const fetchAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/auth/me', {
        credentials: 'include',
      });
      const data = (await response.json()) as {
        authenticated: boolean;
        user: AuthUser | null;
        providers: AuthProvider[];
      };
      setState({
        authenticated: data.authenticated,
        user: data.user,
        providers: data.providers,
        loading: false,
      });
    } catch (error) {
      console.error('Failed to fetch auth status:', error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    void fetchAuthStatus();
  }, [fetchAuthStatus]);

  const login = useCallback((provider: AuthProvider) => {
    // Redirect to OAuth provider
    window.location.href = `/auth/${provider}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setState({
        authenticated: false,
        user: null,
        providers: state.providers,
        loading: false,
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [state.providers]);

  const refresh = useCallback(async () => {
    await fetchAuthStatus();
  }, [fetchAuthStatus]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
