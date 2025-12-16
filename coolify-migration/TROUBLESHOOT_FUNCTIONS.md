# Troubleshooting Edge Functions - Bad Gateway

## Current Status

✅ **Build**: Succeeded  
✅ **Container**: Started  
❌ **Access**: Getting "Bad Gateway" at https://functions.tryeatpal.com/_health

## What "Bad Gateway" Means

The domain is configured and responding, but Coolify's reverse proxy (Traefik/Nginx) cannot reach your container. This is usually a **port mapping or networking issue**.

---

## Step 1: Check Container is Running

In Coolify dashboard:
1. Go to your Edge Functions service
2. Check **Status** - should show "running" with a green indicator
3. Click **Logs** tab
4. Look for:
   ```
   🚀 Starting Edge Functions Server on port 8000
   ✅ Server running at http://localhost:8000/
   ```

---

## Step 2: Verify Port Configuration

In Coolify service settings:

### Port Mapping
- **Container Port**: `8000` (what your app listens on)
- **Public Port**: Should be auto-assigned or set to `8000`

### Domain Settings
- **Domain**: `functions.tryeatpal.com`
- **HTTPS**: Enabled
- **Force HTTPS**: Enabled

---

## Step 3: Check Network Settings

In Coolify:
1. Click on your service
2. Go to **Network** tab
3. Verify:
   - Container is attached to the correct network
   - Port `8000` is exposed

---

## Step 4: Test Direct Container Access

SSH into your Coolify server:

```bash
ssh root@<your-server-ip>

# Find your container
docker ps | grep edge-functions
# Example: vgw480s4kk08484cwo8c4gog-142353267891

# Test direct access to container
docker exec -it <container-name> curl http://localhost:8000/_health

# Should return:
# {"status":"healthy","timestamp":"...","functions":[...]}
```

If this works, the issue is with the reverse proxy configuration.

---

## Step 5: Check Traefik/Proxy Logs

```bash
# On your Coolify server
docker logs coolify-proxy 2>&1 | grep functions.tryeatpal.com

# Look for errors like:
# - "backend not found"
# - "dial tcp: connection refused"
# - "no such host"
```

---

## Common Fixes

### Fix 1: Restart the Service

In Coolify:
1. Click **Restart** button
2. Wait for container to be healthy
3. Test again

### Fix 2: Regenerate Proxy Configuration

In Coolify:
1. Go to service settings
2. Click **Generate Proxy Configuration**
3. Restart the proxy

### Fix 3: Check Port Expose Setting

In your Dockerfile, make sure port is exposed:
```dockerfile
EXPOSE 8000  ✅ Already there
```

In Coolify service settings:
- **Ports Exposes**: `8000:8000` or just `8000`

### Fix 4: Verify Health Check Path

In Coolify:
- **Health Check Path**: `/_health` or `/health`
- **Health Check Method**: `GET`
- **Health Check Interval**: `30s`

### Fix 5: Check Container Logs for Startup Errors

```bash
docker logs <container-name> 2>&1 | tail -50
```

Look for:
- ✅ `Server running at http://localhost:8000/`
- ❌ Any error messages
- ❌ Process crashes

---

## Alternative: Use Internal IP

If the domain isn't routing correctly, you can test with the container's internal IP:

```bash
# Find container IP
docker inspect <container-name> | grep IPAddress

# Test directly
curl http://<container-ip>:8000/_health
```

---

## Quick Checklist

- [ ] Container is running (green status in Coolify)
- [ ] Logs show "Server running at http://localhost:8000/"
- [ ] Port `8000` is configured in Coolify
- [ ] Domain `functions.tryeatpal.com` is set
- [ ] HTTPS is enabled
- [ ] Health check path is `/_health`
- [ ] Container responds to `docker exec ... curl localhost:8000/_health`
- [ ] Proxy logs don't show errors

---

## If Still Not Working

**Option 1: Disable Health Check Temporarily**
In Coolify service settings:
- Disable health check
- This will let the container run even if health check fails
- Check if you can access the endpoint

**Option 2: Use a Different Port**
Sometimes port 8000 conflicts. Try port 9000:
1. Update Dockerfile: `EXPOSE 9000`
2. Update server.ts: `const PORT = 9000;`
3. Update Coolify port settings: `9000`
4. Redeploy

**Option 3: Check DNS**
```bash
nslookup functions.tryeatpal.com
# Should resolve to your Coolify server IP
```

---

## Success Indicators

When working, you should see:

```bash
curl https://functions.tryeatpal.com/_health

{
  "status": "healthy",
  "timestamp": "2025-12-10T14:30:00.000Z",
  "runtime": "deno",
  "version": "1.40.0",
  "environment": {
    "supabaseUrlConfigured": true,
    "anonKeyConfigured": true,
    "serviceRoleKeyConfigured": true
  },
  "functions": [
    "_health",
    "ai-meal-plan",
    "analyze-nutrition",
    ... (78 total functions)
  ]
}
```

---

## Next Steps After Fix

Once the health check passes:

1. ✅ Test individual functions
2. ✅ Update frontend `.env` with new functions URL
3. ✅ Test AI features
4. ✅ Deploy database migrations
5. ✅ Full integration testing

---

**Most Likely Issue:** Port mapping in Coolify settings. Double-check the **Ports Exposes** field!


