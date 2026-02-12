# Working on Multiple Machines - Setup Guide

This guide helps you set up the Boardly project on a new computer and keep your development environment synchronized across machines.

## Quick Start (New Machine)

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/KovalDenys1/Boardly.git
cd Boardly

# Install dependencies
npm install

# Install global tools (if not already installed)
npm install -g prisma
```

### 2. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your credentials
# See "Required Environment Variables" section below
```

### 3. VSCode Setup

When you open the project in VSCode:

1. **Install Recommended Extensions**
   - VSCode will prompt you to install recommended extensions
   - Click "Install All" or install individually
   - Extensions list is in `.vscode/extensions.json`

2. **MCP Configuration is Automatic**
   - `.vscode/mcp.json` is already configured
   - Just ensure your `.env` file has required variables
   - Restart VSCode if MCP servers don't connect

3. **Verify Setup**
   - GitHub Copilot should have access to filesystem, database, GitHub API
   - Check Output panel → "GitHub Copilot Chat" for any errors

## Required Environment Variables

### Minimum Required (for local development)

```bash
# Database (Supabase)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD_HERE@db.YOUR_PROJECT_ID.supabase.co:5432/postgres

# Authentication
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000

# Email (Resend) - for auth emails
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM="Boardly <noreply@boardly.online>"

# Cron Job Security
CRON_SECRET=$(openssl rand -base64 32)
```

### MCP Integration (Optional but Recommended)

```bash
# GitHub Personal Access Token (for MCP GitHub server)
# Get from: https://github.com/settings/tokens
# Scopes: repo, workflow, read:org, read:user
GITHUB_TOKEN=ghp_your_github_personal_access_token_here
```

### OAuth Providers (Optional)

```bash
# Google OAuth (if you want social login)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth (if you want social login)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

## What Gets Synced via Git

### ✅ Committed to Repository (Safe)

- `.vscode/mcp.json` - MCP server configuration (no secrets)
- `.vscode/settings.json` - Workspace settings (no secrets)
- `.vscode/extensions.json` - Recommended extensions
- `.vscode/README.md` - VSCode setup documentation
- `.env.example` - Template with all required variables
- `scripts/mcp-postgres.sh` - Database MCP wrapper script
- `.github/copilot-instructions.md` - AI agent instructions
- All source code, configs, documentation

### ❌ Never Committed (Secrets)

- `.env` - Your actual API keys and secrets
- `.env.local` - Local overrides
- `.env.production` - Production secrets
- `.vscode/*.json` (except listed above) - User-specific settings
- `node_modules/` - Dependencies (reinstall via `npm install`)
- `.next/` - Build output (regenerate via `npm run build`)

## Synchronization Workflow

### Pulling Changes from Another Machine

```bash
# Update your local repository
git pull origin develop

# Install any new dependencies
npm install

# Update database schema (if migrations exist)
npx prisma migrate dev

# Regenerate Prisma Client (if schema changed)
npx prisma generate

# Restart dev servers
npm run dev:all
```

### Pushing Changes

```bash
# Check what you're committing
git status

# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add new game implementation"

# Push to remote
git push origin develop
```

### Best Practices

1. **Always pull before starting work**

   ```bash
   git pull origin develop
   npm install
   ```

2. **Check for new environment variables**

   - Compare `.env.example` with your `.env`
   - Add any new required variables

3. **Run tests before pushing**

   ```bash
   npm test
   npm run build  # Ensure it builds
   ```

4. **Use consistent Node version**
   - Project uses Node 18+ (check `package.json` engines)
   - Use `nvm` to switch versions: `nvm use`

## Common Issues

### Database Connection Fails

**Problem**: `DATABASE_URL` is different between machines

**Solution**:

- Each machine can use a different database (local dev)
- Or share the same Supabase instance (recommended)
- Ensure connection string is correct in `.env`

### MCP Servers Not Working

**Problem**: VSCode can't access database or GitHub

**Solution**:

1. Check `.env` has all required variables
2. Restart VSCode (`Cmd+Q` → reopen)
3. Check Output panel → "GitHub Copilot Chat" for errors
4. Ensure `scripts/mcp-postgres.sh` is executable: `chmod +x scripts/mcp-postgres.sh`

### Missing Dependencies

**Problem**: Project won't run, missing packages

**Solution**:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Outdated Prisma Client

**Problem**: Database queries fail with type errors

**Solution**:

```bash
npx prisma generate
npm run dev
```

### Port Already in Use

**Problem**: Ports 3000 or 3001 are occupied

**Solution**:

```bash
# Kill processes using ports
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9

# Or change ports in .env
PORT=3002  # for socket server
# Next.js: npm run dev -- -p 3005
```

## Development Scripts

```bash
# Development
npm run dev:all          # Both Next.js + Socket.IO servers
npm run dev              # Next.js only (port 3000)
npm run socket:dev       # Socket.IO only (port 3001)

# Database
npm run db:push          # Push schema changes (dev only)
npm run db:studio        # Open Prisma Studio
npx prisma migrate dev   # Create and apply migration

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Build
npm run build            # Production build
npm start                # Run production build
```

## Recommended Workflow

### Daily Development Routine

1. **Morning** (or when starting work):

   ```bash
   git pull origin develop
   npm install
   npm run dev:all
   ```

2. **During Development**:

   - Make changes
   - Test locally: `npm test`
   - Commit frequently with clear messages

3. **Before Finishing**:

   ```bash
   npm test                # Ensure tests pass
   npm run build           # Ensure it builds
   git push origin develop # Push changes
   ```

### When Switching Machines

1. **On Machine A** (before leaving):

   ```bash
   git add .
   git commit -m "WIP: current progress"
   git push origin develop
   ```

2. **On Machine B** (when arriving):

   ```bash
   git pull origin develop
   npm install
   npm run dev:all
   ```

## Tips for Multi-Machine Setup

### Use Git Worktrees

Work on multiple branches simultaneously:

```bash
# Create worktree for feature branch
git worktree add ../boardly-feature feature-branch

# Now you have two separate directories
# Main: ~/Boardly (develop branch)
# Feature: ~/boardly-feature (feature-branch)
```

### Share Database Instance

**Recommended**: Use the same Supabase instance across all machines

- Same `DATABASE_URL` in `.env` on all machines
- Consistent data for testing
- No need to sync database dumps

**Alternative**: Local Postgres instances

- Different `DATABASE_URL` per machine
- Requires running migrations separately
- More isolation, but less convenient

### Use Cloud Storage for Large Files

If you have large assets (images, sounds) not in git:

- Use Supabase Storage or AWS S3
- Keep URLs in environment variables
- Never commit large binary files to git

## Security Checklist

Before committing, always verify:

- [ ] No `.env` files being committed
- [ ] No API keys or tokens in code
- [ ] No database connection strings hardcoded
- [ ] No personal data in commits
- [ ] `.gitignore` is up to date

Check with:

```bash
git status                    # See what's staged
git diff --staged             # Review exact changes
grep -r "API_KEY" .           # Search for leaked keys (before commit)
```

## Resources

- [Project Documentation](./docs/README.md)
- [VSCode Setup](./.vscode/README.md)
- [Contributing Guide](./docs/CONTRIBUTING.md)
- [Copilot Instructions](./.github/copilot-instructions.md)

---

**Last Updated**: February 11, 2026  
**Questions?** Open an issue or check existing documentation in `/docs`
