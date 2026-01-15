# Claude Code Instructions

This file contains instructions for Claude Code when working on this project.

## Required Checks

Always run the following checks before committing changes:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Tests
npm test -- --run
```

All three must pass before pushing code.

## Project Structure

- `src/server/` - Express backend (database, vault, executor)
- `src/client/` - React frontend
- `src/shared/` - Shared types and constants
- `tests/` - Test files (Vitest)
- `docs/` - Documentation

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests in watch mode |
| `npm test -- --run` | Run tests once |

## Code Style

- TypeScript strict mode is enabled
- ESLint with strict rules (no unsafe any, etc.)
- Use bracket notation for index signature access: `obj['key']` not `obj.key`
- Prefer sync functions unless async is needed
- Express route handlers should not be async (use `.then()/.catch()` pattern)
