# Coolify MCP Server Setup Guide

This guide shows how to integrate the Coolify MCP server to manage your Coolify Supabase instance directly from Claude/Cursor.

---

## 🚀 **Installation**

Already done! MCP SDK installed. ✅

---

## 🔧 **Configuration**

### 1. Get Your Coolify API Token

1. Log into your Coolify instance (on Contabo)
2. Navigate to **"Keys & Tokens"** → **"API tokens"**
3. Click **"Create New Token"**
4. Choose **`*` (Full access)** for permissions
5. Copy the generated token

### 2. Add to Your `.env` File

Add these credentials to your local `.env` file (already gitignored):

```bash
# Coolify MCP Server
COOLIFY_API_URL=https://your-coolify-instance.com
COOLIFY_API_TOKEN=your-api-token-from-step-1
COOLIFY_TEAM_ID=your-team-id-optional

# Supabase on Coolify
COOLIFY_POSTGRES_URL=postgresql://postgres:PASSWORD@CONTABO-IP:5432/postgres
```

### 3. Configure MCP in Cursor/Claude

**For Cursor:**

Add to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "coolify": {
      "command": "npx",
      "args": ["@joshuarileydev/coolify-mcp-server", "--yes"],
      "env": {
        "COOLIFY_API_URL": "https://your-coolify-instance.com",
        "COOLIFY_API_TOKEN": "your-api-token",
        "COOLIFY_TEAM_ID": "your-team-id"
      }
    }
  }
}
```

**Or use local development version:**

```json
{
  "mcpServers": {
    "coolify": {
      "command": "node",
      "args": ["node_modules/@joshuarileydev/coolify-mcp-server/dist/index.js"],
      "env": {
        "COOLIFY_API_URL": "https://your-coolify-instance.com",
        "COOLIFY_API_TOKEN": "your-api-token",
        "COOLIFY_TEAM_ID": "your-team-id"
      }
    }
  }
}
```

---

## 🎯 **What You Can Do**

Once configured, you can ask Claude/Cursor to:

### **Manage Your Supabase Service:**

```
"Check the status of my Supabase service"
"Restart the PostgreSQL database"
"View Supabase logs"
"Check resource usage"
"List all running services"
```

### **Manage Applications:**

```
"List all my Coolify applications"
"Deploy my application"
"Check application health"
"View deployment logs"
```

### **Manage Databases:**

```
"List all databases in Coolify"
"Create a new PostgreSQL database"
"Check database connection status"
```

### **Manage Servers:**

```
"Show my Contabo server status"
"Validate server connection"
"Check server resources"
```

### **Troubleshoot Issues:**

```
"Why is my Supabase not accepting connections?"
"Check if PostgreSQL port 5432 is exposed"
"Show me the Vector container logs"
"Restart the Supabase service"
```

---

## 🔐 **Security Best Practices**

1. **Never commit `.env` file** (already in `.gitignore` ✅)
2. **Use environment variables** instead of hardcoding
3. **Limit API token permissions** if possible
4. **Rotate tokens periodically**
5. **Keep MCP configuration file secure**

---

## 📚 **Available Tools**

The Coolify MCP server provides these tools:

### Applications
- `list_applications` - List all applications
- `get_application` - Get application details
- `start_application` - Start an application
- `stop_application` - Stop an application
- `restart_application` - Restart an application
- `deploy_application` - Deploy an application

### Databases
- `list_databases` - List all databases
- `create_database` - Create new database

### Servers
- `list_servers` - List all servers
- `validate_server` - Validate server connection

### Services
- `list_services` - List all services
- `start_service` - Start a service
- `stop_service` - Stop a service

### System
- `get_version` - Get Coolify version

---

## 🧪 **Testing the Integration**

After setup, try these commands in Cursor/Claude:

1. **"List my Coolify services"**
   - Should show your Supabase and other services

2. **"Check if PostgreSQL is accessible on port 5432"**
   - Should verify if the database port is exposed

3. **"Show me the Supabase service logs"**
   - Should display recent logs

4. **"What's the status of my PostgreSQL database?"**
   - Should show if it's running and healthy

---

## 🔥 **Fix Your Current Issue**

Now that you have the MCP server, you can ask:

**"Check my Coolify Supabase service and tell me why PostgreSQL isn't accepting external connections on port 5432"**

The MCP server can:
1. Check if PostgreSQL container is running
2. Verify port mappings
3. Check service configuration
4. View logs to find issues
5. Restart services if needed

---

## 🎓 **Example Workflow**

### Scenario: Apply Migrations

**You:** "List my Coolify databases"

**MCP:** Shows your PostgreSQL database with connection details

**You:** "Is the PostgreSQL port 5432 exposed publicly?"

**MCP:** Checks and shows port configuration

**You:** "Make port 5432 public if it's not"

**MCP:** Updates configuration

**You:** "Run the migration script: `coolify-migration/apply-migrations.sh` with the database URL"

**Claude:** Executes with proper connection string

---

## 📖 **Documentation**

- **MCP Server Repo**: https://github.com/JoshuaRileyDev/coolify-mcp-server
- **Coolify API Docs**: https://coolify.io/docs/api
- **MCP Protocol**: https://modelcontextprotocol.io/

---

## 🐛 **Troubleshooting**

### Issue: "MCP server not found"

**Solution:**
```bash
npm install @joshuarileydev/coolify-mcp-server
```

### Issue: "COOLIFY_API_TOKEN required"

**Solution:**
- Check `.env` file has correct values
- Verify MCP config references the env vars
- Restart Cursor/Claude

### Issue: "API request failed"

**Solution:**
- Verify Coolify instance URL is correct
- Check API token is valid and has permissions
- Ensure Coolify instance is accessible

---

## ✅ **Next Steps**

1. **Get your Coolify API token** from the dashboard
2. **Add to `.env` file** (template provided)
3. **Configure MCP** in Cursor settings
4. **Test the integration** with simple commands
5. **Use it to fix PostgreSQL connection!**

---

**Now you can manage your entire Coolify infrastructure directly from Cursor!** 🎉

**First command to try:**
```
"Show me all services running in my Coolify instance and check if PostgreSQL port 5432 is exposed"
```

