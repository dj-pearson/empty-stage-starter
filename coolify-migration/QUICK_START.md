# 🚀 Quick Start: Coolify MCP + Migration

## 📋 **Setup Steps (5 minutes)**

### 1. Get Coolify API Token
1. Open your Coolify dashboard
2. Go to **"Keys & Tokens"** → **"API tokens"**
3. Click **"Create New Token"**
4. Select **`*` (full access)**
5. Copy the token

### 2. Update Your `.env` File
Add these lines to your `.env` file:

```bash
COOLIFY_API_URL=https://your-coolify-instance.com
COOLIFY_API_TOKEN=<paste-token-from-step-1>
COOLIFY_POSTGRES_URL=postgresql://postgres:<PASSWORD>@<CONTABO-IP>:5432/postgres
```

### 3. Configure MCP in Cursor
Add this to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "coolify": {
      "command": "npx",
      "args": ["@joshuarileydev/coolify-mcp-server", "--yes"],
      "env": {
        "COOLIFY_API_URL": "https://your-coolify-instance.com",
        "COOLIFY_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### 4. Restart Cursor

---

## 🎯 **First Commands to Try**

Once MCP is configured, ask in Cursor:

### **Check Your Supabase:**
```
"List all my Coolify services and show me the status of PostgreSQL"
```

### **Fix PostgreSQL Connection:**
```
"Check if my Supabase PostgreSQL port 5432 is exposed publicly. 
If not, help me expose it."
```

### **View Logs:**
```
"Show me the logs for my Supabase service, especially the Vector container"
```

### **Verify Configuration:**
```
"Check my Supabase service configuration and tell me:
1. Is PostgreSQL running?
2. Is port 5432 exposed?
3. Are there any error logs?"
```

---

## 📁 **Files Created**

1. **`coolify-migration/COOLIFY_MCP_SETUP.md`**
   - Complete MCP setup guide
   - All available commands
   - Troubleshooting tips

2. **`env.example.txt`**
   - Template for `.env` file
   - All required variables
   - Helpful comments

---

## ✅ **What This Gives You**

With Coolify MCP server, you can:

✅ **Manage services** (start, stop, restart)
✅ **Check service status** and logs
✅ **Verify port configurations**
✅ **Deploy applications**
✅ **Manage databases**
✅ **Troubleshoot issues** in real-time
✅ **Run migrations** with proper connection strings

---

## 🔥 **Immediate Next Steps**

1. **Get Coolify API token** (2 min)
2. **Add to `.env`** (1 min)
3. **Configure MCP in Cursor** (2 min)
4. **Restart Cursor** (30 sec)
5. **Ask: "Show my Coolify services"** (instant)
6. **Fix PostgreSQL connection** (with MCP help!)
7. **Run migrations** (10 min)
8. **Deploy and test!** 🎉

---

## 📚 **Quick Reference**

| What You Need | Where to Get It |
|---------------|-----------------|
| Coolify API Token | Coolify Dashboard → Keys & Tokens |
| PostgreSQL Password | What you set when deploying Supabase |
| Contabo IP | Coolify dashboard or Contabo panel |
| Supabase Anon Key | Coolify → Supabase Service → Settings |

---

**Now you have full control over your Coolify infrastructure from Cursor!** 🚀

**First thing to do**: Get that API token and configure MCP so you can troubleshoot the PostgreSQL connection issue!

