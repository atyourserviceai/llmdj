# LLMDJ Deployment Guide

This document outlines how to deploy LLMDJ to different environments.

## Prerequisites

- Node.js v20+ (use `nvm use 22` if needed)
- pnpm package manager
- Cloudflare Workers account with proper authentication

## Environments

LLMDJ supports three deployment environments:

- **Development**: Local development environment
- **Staging**: `https://llmdj-staging.augmentedmind.workers.dev`
- **Production**: `https://llmdj.atyourservice.ai`

## Deployment Commands

### Staging Deployment

```bash
pnpm run deploy:staging
```

This command:

1. Sets `CLOUDFLARE_ENV=staging`
2. Builds the application with staging configuration
3. Deploys to `llmdj-staging.augmentedmind.workers.dev`

### Production Deployment

```bash
pnpm run deploy:production
```

This command:

1. Sets `CLOUDFLARE_ENV=production`
2. Builds the application with production configuration
3. Deploys to production domain

### Development Deployment

```bash
pnpm run deploy
```

Uses default/development configuration.

## Environment Configuration

Each environment has its own configuration in `wrangler.jsonc`:

### Staging Environment

- **OAuth Provider**: `https://dev.atyourserviceai.pages.dev`
- **Client ID**: `llmdj--staging--vyywjh`
- **Redirect URI**: `https://llmdj-staging.augmentedmind.workers.dev/auth/callback`
- **Spotify Callback**: `https://llmdj-staging.augmentedmind.workers.dev/spotify/callback`

### Production Environment

- **OAuth Provider**: `https://atyourservice.ai`
- **Client ID**: `llmdj`
- **Redirect URI**: `https://llmdj.atyourservice.ai/auth/callback`
- **Spotify Callback**: `https://llmdj.atyourservice.ai/spotify/callback`

## Secrets Management

Some configuration values are stored as Cloudflare Worker secrets:

```bash
# Set staging client secret
wrangler secret put ATYOURSERVICE_OAUTH_CLIENT_SECRET --env staging

# Set production client secret
wrangler secret put ATYOURSERVICE_OAUTH_CLIENT_SECRET --env production
```

## Logs and Monitoring

### View logs

```bash
# Staging logs
pnpm run logs:staging

# Production logs
pnpm run logs:production
```

### Generate Types (if needed)

```bash
pnpm run types
```

## Troubleshooting

### Node.js Version Issues

If you get Node.js version errors, ensure you're using v20+:

```bash
nvm use 22
```

### OAuth Configuration Issues

1. Verify the client secret is set as a Worker secret
2. Check that redirect URIs match exactly between OAuth app and environment config
3. Ensure OAuth provider URLs are correct for each environment

### Build Issues

If the build fails, try cleaning and rebuilding:

```bash
rm -rf dist/
pnpm run deploy:staging
```

## Environment Variables Reference

| Variable                           | Dev                                    | Staging                                                         | Production                                     |
| ---------------------------------- | -------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `SETTINGS_ENVIRONMENT`             | `dev`                                  | `staging`                                                       | `production`                                   |
| `OAUTH_PROVIDER_BASE_URL`          | `http://127.0.0.1:45173`               | `https://dev.atyourserviceai.pages.dev`                         | `https://atyourservice.ai`                     |
| `ATYOURSERVICE_OAUTH_CLIENT_ID`    | `llmdj`                                | `llmdj--staging--vyywjh`                                        | `llmdj`                                        |
| `ATYOURSERVICE_OAUTH_REDIRECT_URI` | `https://llmdj.motin.eu/auth/callback` | `https://llmdj-staging.augmentedmind.workers.dev/auth/callback` | `https://llmdj.atyourservice.ai/auth/callback` |
