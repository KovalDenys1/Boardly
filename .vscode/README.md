# VSCode Configuration

This directory contains shared VSCode settings for the Boardly project to ensure consistent development experience across all team members and machines.

## Files in This Directory

### `extensions.json`
**Status**: ✅ Safe to commit

Recommended VSCode extensions for this project:
- **ESLint** - Code linting
- **Prettier** - Code formatting  
- **Tailwind CSS IntelliSense** - CSS class completion
- **Prisma** - Database schema support
- **GitHub Copilot** - AI-powered development (with MCP support)
- **Jest** - Test runner integration
- And more...

When you open this project, VSCode will prompt you to install recommended extensions.

### `mcp.json`
**Status**: ✅ Safe to commit (uses environment variables for secrets)

Model Context Protocol (MCP) server configuration for GitHub Copilot integration.

**Configured MCP Servers:**
- **filesystem** - File system access for reading/writing project files
- **postgres** - Database access via `scripts/mcp-postgres.sh` (`DATABASE_URL` from `.env`/`.env.local`)
- **github** - GitHub API integration (requires `GITHUB_TOKEN` or `GITHUB_PERSONAL_ACCESS_TOKEN`)
- **supabase** - Hosted Supabase MCP endpoint (`https://mcp.supabase.com/mcp`)
- **memory** - Persistent memory across Copilot sessions

**Required Setup:**
1. Copy `.env.example` to `.env.local`
2. Add your `GITHUB_TOKEN` to `.env.local` (get from https://github.com/settings/tokens)
   - Required scopes: `repo`, `workflow`, `read:org`, `read:user`
3. Ensure `DATABASE_URL` is set in `.env.local`
4. Optional: keep `.env` for local overrides only

### `settings.json`
**Status**: ✅ Safe to commit

Project-wide VSCode settings:
- Format on save enabled
- ESLint auto-fix on save
- TypeScript workspace version
- File/folder exclusions for better performance
- Terminal command auto-approval for safe commands

## Setup Instructions

### First Time Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd Boardly
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local and add your credentials
   ```

4. **Install recommended extensions**
   - Open project in VSCode
   - Click "Install" when prompted for recommended extensions
   - Or manually: `Ctrl+Shift+P` → "Extensions: Show Recommended Extensions"

5. **Verify MCP setup**
   - GitHub Copilot should now have access to:
     - File system (read/write project files)
     - PostgreSQL database (query and modify via Prisma)
     - GitHub API (create issues, PRs, manage repo)
     - Memory (remember context across sessions)

### Working on Multiple Machines

All configuration files in this directory are committed to git, so when you:
1. Clone the repo on a new machine
2. Run `npm install`
3. Copy `.env.example` to `.env.local` and configure
4. Install recommended VSCode extensions

You'll have the **exact same development environment** as on your other machines!

## Security Notes

⚠️ **What IS committed:**
- `extensions.json` - extension recommendations (safe)
- `settings.json` - workspace settings (no secrets)
- `mcp.json` - MCP server wiring only (scripts/endpoints, no actual tokens)

✅ **What is NOT committed:**
- `.env`, `.env.local` - your actual secrets and API keys
- `.vscode/*.json` (any other files) - user-specific settings

## Troubleshooting

### MCP Server Not Working

**Problem**: GitHub Copilot can't access database or GitHub API

**Solution**:
1. Check `.env`/`.env.local` has `DATABASE_URL` and `GITHUB_TOKEN` (or `GITHUB_PERSONAL_ACCESS_TOKEN`)
2. Restart VSCode to reload MCP servers
3. Check Output panel → "GitHub Copilot Chat" for errors

### Extensions Not Installing

**Problem**: VSCode doesn't prompt to install extensions

**Solution**:
1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run "Extensions: Show Recommended Extensions"
3. Click "Install" on each extension

### Database MCP Server Fails

**Problem**: `mcp-postgres.sh` script fails

**Solution**:
1. Make script executable: `chmod +x scripts/mcp-postgres.sh`
2. Verify `DATABASE_URL` in `.env` or `.env.local` is correct
3. Test connection: `npm run db:studio`

### Supabase MCP Fails With `unknown command "mcp" for "supabase"`

**Problem**: MCP config still launches Supabase CLI command (`supabase mcp`) instead of hosted endpoint.

**Solution**:
1. Open `.vscode/mcp.json`
2. Ensure Supabase server is configured as:
   ```jsonc
   "supabase": {
     "type": "http",
     "url": "https://mcp.supabase.com/mcp"
   }
   ```
3. Restart VSCode or run MCP server restart command

## Additional Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [VSCode Settings Sync](https://code.visualstudio.com/docs/editor/settings-sync)
- [Boardly Documentation](../docs/README.md)
