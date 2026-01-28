import type { Request, Response, NextFunction } from 'express';
import { hasOAuthProviders } from './passport.js';

/**
 * Middleware to require authentication for protected routes
 * Only enforces auth if OAuth providers are configured
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // If no OAuth providers are configured, allow all requests (single-user mode)
  if (!hasOAuthProviders()) {
    next();
    return;
  }

  // Check if user is authenticated
  if (req.isAuthenticated()) {
    next();
    return;
  }

  // Not authenticated
  res.status(401).json({
    error: 'Authentication required',
    message: 'Please log in to access this resource',
  });
}

/**
 * Middleware to optionally attach user info to request
 * Does not block unauthenticated requests
 */
export function attachUser(_req: Request, _res: Response, next: NextFunction): void {
  // User is automatically attached by passport session middleware
  // This middleware is just for explicit documentation
  next();
}

/**
 * Check if authentication is enabled (OAuth providers configured)
 */
export function isAuthEnabled(): boolean {
  return hasOAuthProviders();
}
