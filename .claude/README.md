# Claude Code Configuration

This directory contains configuration files for Claude Code.

## Files

### `mcp.json`
Model Context Protocol (MCP) server configuration. Currently configured with:
- **Supabase MCP Server**: Direct access to your Supabase database and Edge Functions

### `settings.local.json`
Local permissions and settings for Claude Code in this project.

## Supabase MCP

The Supabase MCP server is configured and ready to use. See `../SUPABASE_MCP_SETUP.md` for complete documentation.

### Quick Start

Once authenticated (OAuth will prompt on first use), you can:

```
Claude, show me all tables in the database
Claude, query the seo_content_optimization table
Claude, list all Edge Functions
Claude, create a migration for...
```

### Configuration

To modify MCP settings, edit `mcp.json`. Changes take effect immediately (may need to restart Claude Code).

## Security

- **Development Only**: Current configuration is for development use
- **Full Access**: Read-write access enabled
- **Project Scoped**: Limited to project `tbuszxkevkpjcjapbrir`

For production use, enable read-only mode in `mcp.json`.

## Resources

- [Supabase MCP Setup Guide](../SUPABASE_MCP_SETUP.md)
- [Supabase Docs](https://supabase.com/docs/guides/getting-started/mcp)
