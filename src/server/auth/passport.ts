import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile as GoogleProfile } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy, type Profile as GitHubProfile } from 'passport-github2';
import type { User, AuthProvider } from '../../shared/types.js';
import type { DatabaseService } from '../database/index.js';

// Type for Passport done callback
type DoneCallback = (error: Error | null, user?: User | false) => void;

/**
 * Configure Passport.js with OAuth strategies
 */
export function configurePassport(db: DatabaseService): void {
  // Serialize user to session (store user ID)
  passport.serializeUser<number>((user, done) => {
    done(null, (user as User).id);
  });

  // Deserialize user from session (lookup by ID)
  passport.deserializeUser<number>((id, done) => {
    const user = db.getUser(id);
    if (user) {
      done(null, user);
    } else {
      done(null, false);
    }
  });

  // Google OAuth Strategy
  const googleClientId = process.env['GOOGLE_CLIENT_ID'];
  const googleClientSecret = process.env['GOOGLE_CLIENT_SECRET'];

  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: '/auth/google/callback',
          scope: ['profile', 'email'],
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done: DoneCallback
        ) => {
          try {
            const user = db.findOrCreateUser({
              provider: 'google' as AuthProvider,
              providerId: profile.id,
              email: profile.emails?.[0]?.value ?? null,
              name: profile.displayName ?? null,
              avatarUrl: profile.photos?.[0]?.value ?? null,
            });
            done(null, user);
          } catch (error) {
            done(error instanceof Error ? error : new Error('Authentication failed'));
          }
        }
      )
    );
    console.log('Google OAuth strategy configured');
  } else {
    console.log('Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
  }

  // GitHub OAuth Strategy
  const githubClientId = process.env['GITHUB_CLIENT_ID'];
  const githubClientSecret = process.env['GITHUB_CLIENT_SECRET'];

  if (githubClientId && githubClientSecret) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: githubClientId,
          clientSecret: githubClientSecret,
          callbackURL: '/auth/github/callback',
          scope: ['user:email'],
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: GitHubProfile,
          done: DoneCallback
        ) => {
          try {
            const user = db.findOrCreateUser({
              provider: 'github' as AuthProvider,
              providerId: profile.id,
              email: profile.emails?.[0]?.value ?? null,
              name: profile.displayName ?? profile.username ?? null,
              avatarUrl: profile.photos?.[0]?.value ?? null,
            });
            done(null, user);
          } catch (error) {
            done(error instanceof Error ? error : new Error('Authentication failed'));
          }
        }
      )
    );
    console.log('GitHub OAuth strategy configured');
  } else {
    console.log('GitHub OAuth not configured (missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET)');
  }
}

/**
 * Check if any OAuth providers are configured
 */
export function hasOAuthProviders(): boolean {
  const hasGoogle = !!(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']);
  const hasGithub = !!(process.env['GITHUB_CLIENT_ID'] && process.env['GITHUB_CLIENT_SECRET']);
  return hasGoogle || hasGithub;
}

/**
 * Get list of configured OAuth providers
 */
export function getConfiguredProviders(): AuthProvider[] {
  const providers: AuthProvider[] = [];

  if (process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']) {
    providers.push('google');
  }

  if (process.env['GITHUB_CLIENT_ID'] && process.env['GITHUB_CLIENT_SECRET']) {
    providers.push('github');
  }

  return providers;
}

export default passport;
