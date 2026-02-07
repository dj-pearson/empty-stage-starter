# OAuth Configuration for Self-Hosted Supabase (Coolify)

This document describes the required configuration for Google and Apple OAuth to work with the self-hosted Supabase instance managed by Coolify.

## The Problem

Coolify automatically sets `GOTRUE_SITE_URL` to `${SERVICE_URL_SUPABASEKONG}` (api.tryeatpal.com), and this cannot be changed. This causes OAuth redirects to go to the API URL instead of the frontend.

## The Solution

While `GOTRUE_SITE_URL` is locked, **`GOTRUE_URI_ALLOW_LIST` can be set manually**. When a redirect URL is in the allow list, the `redirectTo` parameter from the frontend will override `SITE_URL`.

## Required Configuration in Coolify

### Step 1: Add GOTRUE_URI_ALLOW_LIST

In Coolify, go to your Supabase GoTrue/Auth service and add this environment variable:

```bash
GOTRUE_URI_ALLOW_LIST=https://tryeatpal.com,https://tryeatpal.com/auth,https://tryeatpal.com/auth/callback,https://tryeatpal.com/dashboard
```

**Important:** Include ALL possible redirect destinations, comma-separated, NO spaces.

### Step 2: Verify Google/Apple OAuth Configuration

These should already be set (Coolify may manage some of these):

```bash
# Google OAuth
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=<your-google-client-secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://api.tryeatpal.com/auth/v1/callback

# Apple OAuth
GOTRUE_EXTERNAL_APPLE_ENABLED=true
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=<your-apple-service-id>
GOTRUE_EXTERNAL_APPLE_SECRET=<your-apple-generated-jwt>
GOTRUE_EXTERNAL_APPLE_REDIRECT_URI=https://api.tryeatpal.com/auth/v1/callback
```

### Step 3: Restart the GoTrue Service

After adding `GOTRUE_URI_ALLOW_LIST`, **restart the GoTrue/Auth container** (not just redeploy).

In Coolify:
1. Go to your Supabase stack
2. Find the GoTrue/Auth service
3. Click "Restart"
4. Wait 30 seconds for it to fully start

## Common Issues and Fixes

### Issue: OAuth redirects to Supabase Dashboard instead of Frontend

**Cause:** `GOTRUE_SITE_URL` is set to the API URL or not set at all.

**Fix:** Ensure `GOTRUE_SITE_URL` is set to your frontend URL:
```bash
GOTRUE_SITE_URL=https://tryeatpal.com
```

### Issue: "redirect_uri_mismatch" error from Google

**Cause:** The callback URL in Google Cloud Console doesn't match the Supabase configuration.

**Fix:** In Google Cloud Console → APIs & Services → Credentials → Your OAuth Client:

Add these Authorized redirect URIs:
```
https://api.tryeatpal.com/auth/v1/callback
```

### Issue: OAuth works but redirects to wrong page

**Cause:** The redirect URL is not in `GOTRUE_URI_ALLOW_LIST`.

**Fix:** Add all possible redirect URLs:
```bash
GOTRUE_URI_ALLOW_LIST=https://tryeatpal.com/auth,https://tryeatpal.com/auth/callback,https://tryeatpal.com/dashboard
```

## OAuth Flow Diagram

```
1. User clicks "Sign in with Google" on tryeatpal.com/auth
                    ↓
2. Frontend calls supabase.auth.signInWithOAuth({
     provider: 'google',
     options: { redirectTo: 'https://tryeatpal.com/auth/callback' }
   })
                    ↓
3. Supabase redirects user to Google's OAuth consent page
   (callback URL: https://api.tryeatpal.com/auth/v1/callback)
                    ↓
4. User authenticates with Google
                    ↓
5. Google redirects to: https://api.tryeatpal.com/auth/v1/callback?code=...
                    ↓
6. Supabase Auth (GoTrue) exchanges code for tokens
                    ↓
7. Supabase redirects to: https://tryeatpal.com/auth/callback?code=...
   (This uses the PKCE flow - code is exchanged client-side)
                    ↓
8. AuthCallback.tsx exchanges PKCE code for session
                    ↓
9. User is redirected to /dashboard
```

## Testing OAuth Configuration

After updating the configuration, test by:

1. **Clear browser cache and cookies**
2. **Go to** https://tryeatpal.com/auth
3. **Click** "Sign in with Google"
4. **Complete** Google authentication
5. **Verify** you are redirected to /auth/callback then /dashboard

If you still get redirected to the Supabase Dashboard:
1. Check Supabase logs for the GoTrue service
2. Verify `GOTRUE_SITE_URL` is correctly set
3. Restart the GoTrue container after changing environment variables

## Applying Changes

After updating environment variables in Coolify:

1. Save the changes
2. **Restart the GoTrue/Auth service** (not just redeploy)
3. Wait 30 seconds for the service to fully restart
4. Clear browser cache and test

For Docker Compose deployments:
```bash
docker-compose down supabase-auth
docker-compose up -d supabase-auth
```

For Coolify:
- Go to your Supabase service → Settings → Environment Variables
- Update the variables
- Click "Restart" on the service
