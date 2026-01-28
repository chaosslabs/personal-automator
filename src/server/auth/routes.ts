import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express';
import passport from 'passport';
import type { AuthenticateOptions } from 'passport';
import type { User } from '../../shared/types.js';
import { getConfiguredProviders } from './passport.js';

const router = Router();

// Extend Express Request to include user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: number;
      provider: string;
      providerId: string;
      email: string | null;
      name: string | null;
      avatarUrl: string | null;
      createdAt: string;
      lastLoginAt: string;
    }
  }
}

// Helper to get typed passport authenticate middleware
function getPassportMiddleware(strategy: string, options: AuthenticateOptions): RequestHandler {
  return passport.authenticate(strategy, options) as RequestHandler;
}

// Helper for custom callback authentication
type AuthenticateCallback = (err: Error | null, user: User | false) => void;
function authenticateWithCallback(
  strategy: string,
  callback: AuthenticateCallback
): RequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  return passport.authenticate(strategy, callback as any) as RequestHandler;
}

/**
 * Get current user info and available providers
 */
router.get('/me', (req: Request, res: Response): void => {
  const providers = getConfiguredProviders();

  if (req.isAuthenticated() && req.user) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatarUrl: req.user.avatarUrl,
        provider: req.user.provider,
      },
      providers,
    });
  } else {
    res.json({
      authenticated: false,
      user: null,
      providers,
    });
  }
});

/**
 * Google OAuth - Initiate login
 */
router.get('/google', (req: Request, res: Response, next: NextFunction): void => {
  if (!getConfiguredProviders().includes('google')) {
    res.status(404).json({ error: 'Google OAuth not configured' });
    return;
  }
  getPassportMiddleware('google', { scope: ['profile', 'email'] })(req, res, next);
});

/**
 * Google OAuth - Callback handler
 */
router.get('/google/callback', (req: Request, res: Response, next: NextFunction): void => {
  authenticateWithCallback('google', (err: Error | null, user: User | false) => {
    if (err) {
      console.error('Google OAuth error:', err);
      res.redirect('/?auth_error=google_failed');
      return;
    }
    if (!user) {
      res.redirect('/?auth_error=no_user');
      return;
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error:', loginErr);
        res.redirect('/?auth_error=login_failed');
        return;
      }
      res.redirect('/');
    });
  })(req, res, next);
});

/**
 * GitHub OAuth - Initiate login
 */
router.get('/github', (req: Request, res: Response, next: NextFunction): void => {
  if (!getConfiguredProviders().includes('github')) {
    res.status(404).json({ error: 'GitHub OAuth not configured' });
    return;
  }
  getPassportMiddleware('github', { scope: ['user:email'] })(req, res, next);
});

/**
 * GitHub OAuth - Callback handler
 */
router.get('/github/callback', (req: Request, res: Response, next: NextFunction): void => {
  authenticateWithCallback('github', (err: Error | null, user: User | false) => {
    if (err) {
      console.error('GitHub OAuth error:', err);
      res.redirect('/?auth_error=github_failed');
      return;
    }
    if (!user) {
      res.redirect('/?auth_error=no_user');
      return;
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error:', loginErr);
        res.redirect('/?auth_error=login_failed');
        return;
      }
      res.redirect('/');
    });
  })(req, res, next);
});

/**
 * Logout
 */
router.post('/logout', (req: Request, res: Response): void => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error('Session destroy error:', sessionErr);
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

export default router;
