# Railway Deployment Guide

This document explains how to set up automatic deployment to Railway when changes are merged to the main branch.

## Prerequisites

1. A [Railway](https://railway.app) account
2. Railway CLI installed locally (optional, for manual deployments)
3. GitHub repository with admin access

## Initial Railway Setup

### 1. Create a New Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose this repository
5. Railway will automatically detect the Node.js application

### 2. Configure Environment Variables (if needed)

In your Railway project dashboard:

1. Go to the "Variables" tab
2. Add any required environment variables:
   - `NODE_ENV=production` (recommended)
   - `PORT` (Railway automatically sets this, but you can override if needed)
   - Any other application-specific environment variables

### 3. Get Railway Deployment Credentials

To enable GitHub Actions to deploy to Railway:

1. **Get Railway Token:**
   - Go to [Railway Account Settings](https://railway.app/account/tokens)
   - Click "Create New Token"
   - Give it a name like "GitHub Actions Deploy"
   - Copy the token (you won't be able to see it again!)

2. **Get Railway Service ID:**
   - In your Railway project, go to the service settings
   - Copy the Service ID from the URL or settings page
   - The URL format is: `https://railway.app/project/{PROJECT_ID}/service/{SERVICE_ID}`

### 4. Configure GitHub Secrets

Add the following secrets to your GitHub repository:

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret" and add:
   - **Name:** `RAILWAY_TOKEN`
     - **Value:** The token from step 3.1
   - **Name:** `RAILWAY_SERVICE_ID`
     - **Value:** The service ID from step 3.2

## How It Works

### Automatic Deployment

- When code is merged to the `main` branch, the GitHub Actions workflow (`.github/workflows/deploy-railway.yml`) automatically triggers
- The workflow installs the Railway CLI and deploys the latest code
- Railway builds the application using the `npm run build` command
- Railway starts the application using the `npm start` command

### Build Process

The deployment follows these steps:

1. **Install dependencies:** `npm install`
2. **Build client:** `npm run build:client` (builds React frontend to `dist/client`)
3. **Build server:** `npm run build:server` (compiles TypeScript server to `dist/server`)
4. **Start server:** `npm start` (runs `node dist/server/index.js`)

### Configuration Files

- **`railway.json`**: Railway-specific configuration
  - Specifies build and start commands
  - Configures restart policy
- **`.github/workflows/deploy-railway.yml`**: GitHub Actions workflow for automatic deployment

## Manual Deployment

If you need to deploy manually:

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   ```

4. Deploy:
   ```bash
   railway up
   ```

## Monitoring and Logs

- View deployment logs in the Railway dashboard
- Monitor application health and metrics
- Set up custom domains in Railway project settings

## Troubleshooting

### Build Failures

- Check the Railway build logs for errors
- Ensure all dependencies are listed in `package.json`
- Verify Node.js version compatibility (requires Node >= 20.0.0)

### Deployment Not Triggering

- Verify GitHub secrets are correctly set
- Check GitHub Actions workflow runs in the "Actions" tab
- Ensure the workflow file is on the main branch

### Runtime Errors

- Check Railway deployment logs
- Verify all required environment variables are set
- Ensure the PORT environment variable is being used correctly

## Environment Variables Reference

The application may require these environment variables:

- `NODE_ENV`: Set to `production` for production deployments
- `PORT`: Railway sets this automatically (default: 3000 locally)
- Add any custom variables your application needs here

## Rollback

If you need to rollback to a previous deployment:

1. Go to Railway project dashboard
2. Navigate to "Deployments" tab
3. Find the previous successful deployment
4. Click "Redeploy"

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Documentation](https://docs.railway.app/develop/cli)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
