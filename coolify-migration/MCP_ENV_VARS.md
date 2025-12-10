# Coolify MCP Configuration - Using Environment Variables

## ✅ **Best Practice: Use System Environment Variables**

Instead of hardcoding credentials in your MCP config, reference your `.env` file!

---

## 🔧 **Option 1: Reference System Environment Variables (Recommended)**

### **Step 1: Set Environment Variables**

**Windows (PowerShell):**
```powershell
# Add to your PowerShell profile (~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1)
$env:COOLIFY_API_URL = "https://your-coolify-instance.com"
$env:COOLIFY_API_TOKEN = "your-api-token-here"
$env:COOLIFY_TEAM_ID = "your-team-id"
```

**Or set permanently:**
```powershell
[System.Environment]::SetEnvironmentVariable('COOLIFY_API_URL', 'https://your-coolify-instance.com', 'User')
[System.Environment]::SetEnvironmentVariable('COOLIFY_API_TOKEN', 'your-api-token-here', 'User')
[System.Environment]::SetEnvironmentVariable('COOLIFY_TEAM_ID', 'your-team-id', 'User')
```

**macOS/Linux (add to ~/.bashrc or ~/.zshrc):**
```bash
export COOLIFY_API_URL="https://your-coolify-instance.com"
export COOLIFY_API_TOKEN="your-api-token-here"
export COOLIFY_TEAM_ID="your-team-id"
```

### **Step 2: MCP Config (No Hardcoded Values!)**

**File: `~/.cursor/mcp.json`** (or wherever your MCP config is)

```json
{
  "mcpServers": {
    "coolify": {
      "command": "npx",
      "args": ["@joshuarileydev/coolify-mcp-server", "--yes"],
      "env": {
        "COOLIFY_API_URL": "${COOLIFY_API_URL}",
        "COOLIFY_API_TOKEN": "${COOLIFY_API_TOKEN}",
        "COOLIFY_TEAM_ID": "${COOLIFY_TEAM_ID}"
      }
    }
  }
}
```

**Note**: Cursor MCP might use different variable substitution syntax. Try these:

1. **Direct reference** (if Cursor passes system env vars):
```json
{
  "mcpServers": {
    "coolify": {
      "command": "npx",
      "args": ["@joshuarileydev/coolify-mcp-server", "--yes"]
      // No env block - uses system environment variables
    }
  }
}
```

2. **Dollar sign syntax**:
```json
"env": {
  "COOLIFY_API_URL": "$COOLIFY_API_URL",
  "COOLIFY_API_TOKEN": "$COOLIFY_API_TOKEN"
}
```

3. **Percent syntax** (Windows-style):
```json
"env": {
  "COOLIFY_API_URL": "%COOLIFY_API_URL%",
  "COOLIFY_API_TOKEN": "%COOLIFY_API_TOKEN%"
}
```

---

## 🔧 **Option 2: Use a Wrapper Script (Most Reliable)**

### **Create a startup script that loads your .env**

**File: `start-coolify-mcp.sh`** (macOS/Linux)

```bash
#!/bin/bash

# Load environment variables from .env
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Start the MCP server
npx @joshuarileydev/coolify-mcp-server
```

**File: `start-coolify-mcp.ps1`** (Windows)

```powershell
# Load environment variables from .env
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^#].+?)=(.+)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
}

# Start the MCP server
npx @joshuarileydev/coolify-mcp-server
```

### **MCP Config using the wrapper:**

```json
{
  "mcpServers": {
    "coolify": {
      "command": "bash",
      "args": ["/path/to/your/project/start-coolify-mcp.sh"]
    }
  }
}
```

**Or for Windows:**
```json
{
  "mcpServers": {
    "coolify": {
      "command": "powershell",
      "args": ["-File", "C:\\path\\to\\project\\start-coolify-mcp.ps1"]
    }
  }
}
```

---

## 🔧 **Option 3: Use dotenv-cli**

### **Install dotenv-cli:**

```bash
npm install -g dotenv-cli
```

### **MCP Config:**

```json
{
  "mcpServers": {
    "coolify": {
      "command": "dotenv",
      "args": [
        "-e",
        "C:\\Users\\pears\\Documents\\EatPal\\empty-stage-starter\\.env",
        "npx",
        "@joshuarileydev/coolify-mcp-server",
        "--yes"
      ]
    }
  }
}
```

This loads your `.env` file and passes all variables to the MCP server!

---

## ✅ **Recommended Approach**

### **For Your Setup (Windows):**

1. **Set permanent environment variables:**

```powershell
# Run in PowerShell as Administrator
[System.Environment]::SetEnvironmentVariable('COOLIFY_API_URL', 'https://your-coolify.com', 'User')
[System.Environment]::SetEnvironmentVariable('COOLIFY_API_TOKEN', 'get-from-coolify', 'User')
```

2. **Simple MCP config (no hardcoded values):**

```json
{
  "mcpServers": {
    "coolify": {
      "command": "npx",
      "args": ["@joshuarileydev/coolify-mcp-server", "--yes"]
    }
  }
}
```

3. **Restart Cursor** (to pick up environment variables)

---

## 🔐 **Security Benefits**

✅ **No credentials in config files**
✅ **Easier to rotate tokens**
✅ **Different values per environment**
✅ **Config file can be committed to git**
✅ **Credentials in one secure location**

---

## 🧪 **Test It**

After setup, test that environment variables are loaded:

```powershell
# Windows
echo $env:COOLIFY_API_URL
echo $env:COOLIFY_API_TOKEN

# macOS/Linux
echo $COOLIFY_API_URL
echo $COOLIFY_API_TOKEN
```

Should show your values (not empty).

Then restart Cursor and try the MCP server!

---

## 📝 **Your Updated MCP Config**

Replace your current config with:

```json
{
  "mcpServers": {
    "coolify": {
      "command": "npx",
      "args": ["@joshuarileydev/coolify-mcp-server", "--yes"]
    }
  }
}
```

**That's it!** No hardcoded credentials! 🎉

---

## 🚨 **Important Notes**

1. **Restart Cursor** after setting environment variables
2. **Environment variables must be set in the shell that launches Cursor**
3. **System-level env vars** (User or System) persist across restarts
4. **Process-level env vars** only last for that session

---

**Try Option 1 (permanent environment variables) first - it's the cleanest!**

