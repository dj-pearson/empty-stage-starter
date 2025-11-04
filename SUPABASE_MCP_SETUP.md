# Supabase MCP Server Setup Guide

## Overview

The Supabase MCP (Model Context Protocol) Server connects AI assistants like Claude Code directly to your Supabase project, enabling database management, querying, and more through natural language commands.

## What's Already Configured

The MCP configuration has been added to this project:

1. **MCP Configuration**: `.claude/mcp.json` with Supabase server settings
2. **Permissions**: `.claude/settings.local.json` updated to allow Supabase MCP tools
3. **Project ID**: Automatically configured with your Supabase project ID

## Configuration Details

### MCP Server URL
```
https://mcp.supabase.com/mcp?project_ref=tbuszxkevkpjcjapbrir&read_only=false
```

- **Project Reference**: `tbuszxkevkpjcjapbrir` (from your `.env` file)
- **Read-Only Mode**: Disabled (set to `false` for full database access)
- **Features**: All features enabled by default

### Configuration File Location
`.claude/mcp.json`

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=tbuszxkevkpjcjapbrir&read_only=false",
      "description": "Supabase MCP Server - Connect AI assistants to your Supabase project for database management, querying, and more"
    }
  }
}
```

## Available Features

When connected, the Supabase MCP provides access to:

### Database Management
- **Query Tables**: Read data from your Supabase tables
- **Create Tables**: Create new database tables
- **Update Schema**: Modify table structures
- **Manage Relationships**: Set up foreign keys and relationships

### Edge Functions
- **List Functions**: View all deployed Edge Functions
- **Invoke Functions**: Execute Edge Functions directly
- **Deploy Functions**: Deploy new or updated functions

### Documentation
- **Get Docs**: Access Supabase documentation
- **Reference Lookup**: Find API references and guides

### Development Tools
- **Database Debugging**: Troubleshoot database issues
- **Performance Analysis**: Check query performance
- **Schema Inspection**: Examine database schema

### Account Management
- **Project Info**: View project details
- **Configuration**: Access project settings

### Branching (Preview Feature)
- **Create Branches**: Create database branches for testing
- **Manage Branches**: Switch between branches

## Authentication

The Supabase MCP uses **OAuth 2.1 with Dynamic Client Registration**.

### First-Time Setup

1. When Claude Code first tries to use a Supabase MCP tool, you'll be prompted to authenticate
2. A browser window will open to `https://supabase.com`
3. Log in with your Supabase account credentials
4. Grant MCP access to your Supabase account
5. You'll be redirected back and the connection will be established

### Subsequent Uses

Once authenticated, Claude Code will maintain the connection automatically. You won't need to re-authenticate unless:
- You explicitly revoke access
- The OAuth token expires (typically after 30 days)

## Usage Examples

### Query Database
```
Claude, can you query the users table and show me the last 10 users?
```

### Create Table
```
Claude, create a new table called 'products' with columns: id (uuid primary key), name (text), price (decimal), created_at (timestamp)
```

### List Edge Functions
```
Claude, show me all the Supabase Edge Functions in this project
```

### Invoke Function
```
Claude, call the 'analyze-content' Edge Function with url='https://example.com'
```

### Database Schema
```
Claude, show me the complete database schema for this project
```

### Create Migration
```
Claude, generate a migration to add a 'category' column to the products table
```

## Security Best Practices

### Current Configuration
- **Environment**: Development
- **Read-Only**: Disabled (full access)
- **Project Scope**: Limited to project `tbuszxkevkpjcjapbrir`

### Recommendations

#### For Development
✅ Current configuration is appropriate for development

#### For Production
⚠️ **Do NOT use this with a production database**

If you need to connect to production:
1. Enable read-only mode:
   ```json
   "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROD_ID&read_only=true"
   ```

2. Create a separate development project on Supabase

3. Use database branching for safe testing

#### Additional Security
- ✅ Always review MCP tool calls before approval
- ✅ Keep your Supabase credentials secure
- ✅ Revoke MCP access when not in use
- ✅ Use RLS (Row Level Security) policies on sensitive tables
- ✅ Never share your project with untrusted users

## Enabling Read-Only Mode

To enable read-only mode (recommended for production):

1. Edit `.claude/mcp.json`:
   ```json
   {
     "mcpServers": {
       "supabase": {
         "type": "http",
         "url": "https://mcp.supabase.com/mcp?project_ref=tbuszxkevkpjcjapbrir&read_only=true"
       }
     }
   }
   ```

2. Restart Claude Code

With read-only mode:
- ✅ Can query tables
- ✅ Can view schema
- ✅ Can read documentation
- ❌ Cannot create/modify tables
- ❌ Cannot insert/update/delete data
- ❌ Cannot deploy functions

## Limiting Features

To reduce the number of available tools, you can limit features:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=tbuszxkevkpjcjapbrir&features=database,docs"
    }
  }
}
```

Available feature groups:
- `account` - Account management
- `database` - Database operations
- `debugging` - Debug tools
- `development` - Dev tools
- `docs` - Documentation access
- `functions` - Edge Functions
- `branching` - Database branching
- `storage` - File storage (disabled by default)

## Troubleshooting

### "MCP Server not responding"
**Solution**: Check your internet connection and ensure `https://mcp.supabase.com` is accessible

### "Authentication failed"
**Solution**:
1. Clear browser cookies for `supabase.com`
2. Try authenticating again
3. Ensure you're logged into the correct Supabase account

### "Project not found"
**Solution**: Verify the project ID in `.env` matches your Supabase dashboard

### "Permission denied"
**Solution**:
1. Check that read-only mode is disabled if you need write access
2. Verify your Supabase account has the necessary permissions
3. Check RLS policies on the table you're trying to access

### "Too many tools available"
**Solution**: Limit features using the `features` parameter (see "Limiting Features" above)

## Local Development with Supabase CLI

If running Supabase locally with `supabase start`, you can connect to the local MCP server:

```json
{
  "mcpServers": {
    "supabase-local": {
      "type": "http",
      "url": "http://localhost:54321/mcp"
    }
  }
}
```

**Note**: Local MCP server has a subset of tools compared to the cloud version.

## Updating Configuration

After modifying `.claude/mcp.json`:
1. Save the file
2. Restart Claude Code (if needed)
3. The new configuration will take effect immediately

## Checking Available Tools

To see what tools are available through the Supabase MCP:

```bash
claude mcp list
```

This will show all configured MCP servers and their available tools.

## Revoking Access

To revoke MCP access to your Supabase account:

1. Go to https://supabase.com/dashboard/account/tokens
2. Find "MCP Server" in the list of authorized applications
3. Click "Revoke"

Or remove the MCP configuration:
```bash
rm .claude/mcp.json
```

## Advanced Configuration

### Multiple Projects

To connect to multiple Supabase projects:

```json
{
  "mcpServers": {
    "supabase-dev": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=dev_project_id"
    },
    "supabase-staging": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=staging_project_id&read_only=true"
    }
  }
}
```

### Custom Description

Add descriptive text to help distinguish servers:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=tbuszxkevkpjcjapbrir",
      "description": "EatPal Development Database - Full Access"
    }
  }
}
```

## Integration with Your SEO Tool

The Supabase MCP can be particularly useful for your SEO Management tool:

### Database Queries
```
Claude, show me all SEO audit results from the last 7 days
```

### Schema Management
```
Claude, add indexes to the seo_content_optimization table on page_url and analyzed_at columns
```

### Data Analysis
```
Claude, analyze the seo_keywords table and show me which keywords have the highest improvement trends
```

### Function Management
```
Claude, show me the logs for the optimize-page-content Edge Function
```

### Migration Creation
```
Claude, create a migration to add a new column 'competitor_score' to the seo_content_optimization table
```

## Resources

- **Official Docs**: https://supabase.com/docs/guides/getting-started/mcp
- **GitHub Repository**: https://github.com/supabase-community/supabase-mcp
- **MCP Specification**: https://modelcontextprotocol.io/
- **Supabase Dashboard**: https://supabase.com/dashboard/project/tbuszxkevkpjcjapbrir

## Summary

✅ **MCP Configuration**: Added to `.claude/mcp.json`
✅ **Permissions**: Updated in `.claude/settings.local.json`
✅ **Project**: Connected to `tbuszxkevkpjcjapbrir`
✅ **Access Level**: Full (read-write)
✅ **Features**: All enabled
⚠️ **Environment**: Development only

You're all set! Start using Claude Code to interact with your Supabase database through natural language commands.
