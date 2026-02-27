# AI Meal Coach Fix - Deployment Guide

## Issue Fixed
The AI Meal Coach was causing CORS errors and exposing API keys because it was directly calling the Anthropic API from the browser frontend.

## Changes Made

### 1. Security Vulnerability Fixed ✅
- **Before**: Component directly called `api.anthropic.com` with exposed API keys
- **After**: Secure edge function handles all AI requests server-side

### 2. New Edge Function Created
- **Location**: `supabase/functions/ai-coach-chat/index.ts`
- **Purpose**: Securely handle AI coach conversations using centralized AIServiceV2
- **Features**:
  - Kid context support (name, age, allergens, food counts)
  - Secure API key management (stays server-side)
  - CORS headers properly configured
  - Error handling and logging
  - Token usage tracking

### 3. Component Updated
- **File**: `src/components/AIMealCoach.tsx`
- **Changes**:
  - Removed direct API calls to Anthropic
  - Now invokes `ai-coach-chat` edge function via `supabase.functions.invoke()`
  - Simplified kid context preparation
  - Maintained all existing functionality (conversation history, token tracking, etc.)

## Deployment Steps

### Option 1: Deploy Single Function (Recommended for Quick Fix)
```bash
# From project root
supabase functions deploy ai-coach-chat
```

### Option 2: Deploy All Functions (If you want to update everything)
```bash
# Deploy all edge functions
supabase functions deploy
```

### Option 3: Using your CI/CD Pipeline
If you have automated deployments, the new edge function will be deployed automatically on your next push to production.

## Environment Variables Required

The edge function uses the centralized AIServiceV2, which requires these environment variables in your Supabase project:

```bash
# Already configured (from AIServiceV2):
CLAUDE_API_KEY=<your-anthropic-api-key>
AI_DEFAULT_PROVIDER=anthropic
DEFAULT_AI_MODEL=claude-3-5-sonnet-20241022
AI_MAX_RETRIES=3
AI_TIMEOUT_MS=30000
AI_TEMPERATURE=0.7
```

**Note**: If you self-host Supabase, make sure these are set in your Coolify/Docker environment.

## Testing the Fix

1. **Navigate to AI Meal Coach**: Go to `/dashboard/ai-coach` in your app
2. **Send a test message**: Try asking "What are some good foods for picky eaters?"
3. **Verify no errors**:
   - Open browser DevTools > Console
   - Should see NO CORS errors
   - Should see successful response from AI Coach
4. **Check conversation history**: Message should be saved to database

## Expected Behavior

### Before (Broken):
```
❌ Console error: "Access to fetch at 'https://api.anthropic.com/v1/messages' 
   from origin 'https://yourdomain.com' has been blocked by CORS policy"
❌ Security risk: API keys exposed in browser
❌ Message fails to send
```

### After (Fixed):
```
✅ No CORS errors
✅ API keys remain secure server-side
✅ Message sent successfully
✅ AI Coach responds normally
✅ Conversation saved to database
```

## Architecture Diagram

```
BEFORE (Insecure):
Browser Frontend → api.anthropic.com (CORS blocked + exposed API key)

AFTER (Secure):
Browser Frontend → Supabase Edge Function → api.anthropic.com (server-side)
     ↑                        ↑
     |                        |
  No API key            Secure API key
  in browser            in environment
```

## Files Changed

1. **New**: `supabase/functions/ai-coach-chat/index.ts` (124 lines)
   - Edge function for secure AI chat handling
   
2. **Modified**: `src/components/AIMealCoach.tsx`
   - Removed: Direct API calls (lines 231-280)
   - Added: Edge function invocation with kid context

## Rollback (If Needed)

If you need to rollback:
```bash
git revert 5c256d3
```

Then redeploy:
```bash
npm run build
supabase functions deploy
```

## Additional Notes

- The edge function uses the existing `AIServiceV2` shared service, so all AI configuration is centralized
- Kid context is now passed as a structured object for better maintainability
- Token usage and model information are properly tracked in the database
- Error handling includes detailed logging for debugging

## Support

If you encounter issues:
1. Check Supabase Edge Function logs: Dashboard → Edge Functions → ai-coach-chat → Logs
2. Verify environment variables are set correctly
3. Ensure `AIServiceV2` dependencies are available in `_shared/` directory
4. Check browser DevTools Network tab for failed requests

## Next Steps

After deploying:
1. ✅ Test AI Coach functionality
2. ✅ Verify no console errors
3. ✅ Check conversation history saves correctly
4. ✅ Monitor edge function logs for any issues
5. ✅ Update your CI/CD pipeline if needed to include edge function deploys
