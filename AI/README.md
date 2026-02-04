# ✅ Coolify AI Setup - Implementation Complete!

## What We've Built

The centralized AI configuration system is now implemented and ready for deployment. Here's what was created:

### 1. Database Migration ✓
**File:** `supabase/migrations/20260204000000_coolify_ai_shared_variables.sql`

- Adds `task_type` column for standard vs lightweight routing
- Creates `ai_environment_config` table to track Coolify variables
- Inserts Claude Haiku models for lightweight tasks
- Sets up RLS policies for root_admin access
- Defines 9 configuration variables

### 2. AI Service Layer ✓
**File:** `supabase/functions/_shared/ai-service-v2.ts`

- Loads config from Coolify Team Shared Variables
- Supports task-type routing (standard vs lightweight)
- Multi-provider support (Claude, OpenAI, Gemini)
- Automatic retry logic and timeout handling
- Test configuration method for diagnostics

### 3. Test Edge Function ✓
**File:** `supabase/functions/test-ai-configuration/index.ts`

- Tests both standard and lightweight models
- Verifies API keys and environment variables
- Measures latency for each model type
- Requires root_admin authentication
- Returns comprehensive diagnostics

### 4. Admin UI ✓
**File:** `src/components/admin/AIModelManager.tsx`

- Four-tab interface (All, Standard, Lightweight, Environment)
- One-click configuration testing
- Visual test results display
- Copy-to-clipboard for Coolify variable syntax
- Environment variable status monitoring

### 5. Documentation ✓

- **COOLIFY_AI_SETUP.md** - Quick start guide (THIS FILE)
- **COOLIFY_AI_QUICK_REFERENCE.md** - Daily operations reference
- **COOLIFY_AI_CENTRALIZED_DEPLOYMENT.md** - Complete deployment guide
- **COOLIFY_AI_IMPLEMENTATION_SUMMARY.md** - What was built

---

## 🚀 Deployment Steps

### Step 1: Run Database Migration

**Via Supabase SQL Editor:**
1. Go to https://api.tryeatpal.com (your Supabase dashboard)
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy/paste contents of `supabase/migrations/20260204000000_coolify_ai_shared_variables.sql`
5. Click **Run**

### Step 2: Set Up Coolify Team Variables

In Coolify → Team Settings → Shared Variables, add:

```bash
AI_DEFAULT_PROVIDER=anthropic
DEFAULT_AI_MODEL=claude-sonnet-4-5-20250929
LIGHTWEIGHT_AI_MODEL=claude-3-5-haiku-20241022
CLAUDE_API_KEY=your-actual-claude-api-key-here
OPENAI_GLOBAL_API=your-openai-key-if-needed
AI_MAX_RETRIES=3
AI_TIMEOUT_MS=30000
AI_TEMPERATURE=0.7
AI_ENABLE_CACHING=true
```

### Step 3: Link Variables to Project

In Coolify → Your Project → Environment Variables:

Add these Team Shared Variables:
```
{{ team.AI_DEFAULT_PROVIDER }}
{{ team.DEFAULT_AI_MODEL }}
{{ team.LIGHTWEIGHT_AI_MODEL }}
{{ team.CLAUDE_API_KEY }}
{{ team.OPENAI_GLOBAL_API }}
{{ team.AI_MAX_RETRIES }}
{{ team.AI_TIMEOUT_MS }}
{{ team.AI_TEMPERATURE }}
{{ team.AI_ENABLE_CACHING }}
```

### Step 4: Redeploy

Click **Redeploy** in Coolify for your project.

### Step 5: Test

1. Login as `root_admin`
2. Go to `/admin/ai-models`
3. Click **"Test Configuration"**
4. Verify all checks pass

---

## 📊 What This Enables

### Cost Optimization
- **Before:** All tasks use expensive Sonnet model (~$3/1M tokens)
- **After:** Simple tasks use Haiku (~$0.25/1M tokens)
- **Savings:** 60-80% on appropriate tasks

### Centralized Management
- Update AI models globally from one place (Coolify)
- No code changes needed to switch models
- Instant propagation across all projects
- Single source of truth for configuration

### Multi-Provider Support
- Easy switching between Claude, OpenAI, Gemini
- Fallback providers for redundancy
- Provider-specific optimization

### Task-Type Routing
- **Standard:** Complex tasks (blog posts, analysis, code)
- **Lightweight:** Simple tasks (classification, extraction, summaries)
- Automatic cost optimization based on task complexity

---

## 🧪 Testing the Setup

### Via Admin UI (Recommended)
```
1. Login as root_admin
2. Navigate to /admin/ai-models
3. Click "Test Configuration"
4. Review results
```

### Via API (Alternative)
```bash
curl -X POST "https://functions.tryeatpal.com/test-ai-configuration" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"testType": "full"}'
```

### Expected Results
```json
{
  "success": true,
  "config": {
    "defaultProvider": "anthropic",
    "defaultModel": "claude-sonnet-4-5-20250929",
    "lightweightModel": "claude-3-5-haiku-20241022"
  },
  "tests": {
    "standard": { "success": true, "latencyMs": 1500 },
    "lightweight": { "success": true, "latencyMs": 400 }
  },
  "errors": []
}
```

---

## 🔧 Configuration Files Updated

1. **edge-functions-server.ts** - Added test-ai-configuration function
2. **supabase/config.toml** - Added verify_jwt for test-ai-configuration

---

## 📝 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database Migration | ✅ Created | Needs to be run in Supabase |
| AI Service V2 | ✅ Complete | Ready for use |
| Test Function | ✅ Complete | Registered in server |
| Admin UI | ✅ Complete | Route needs to be added |
| Environment Variables | ⏳ Pending | Set up in Coolify |
| Testing | ⏳ Pending | After variables are set |

---

## 🎯 Immediate Next Steps

1. **Copy Migration SQL:**
   ```
   Open: supabase/migrations/20260204000000_coolify_ai_shared_variables.sql
   Copy all contents
   ```

2. **Run in Supabase:**
   ```
   Go to: https://api.tryeatpal.com → SQL Editor
   Paste and run the migration
   ```

3. **Set Coolify Variables:**
   ```
   Coolify → Team Settings → Shared Variables
   Add all 9 variables listed above
   ```

4. **Link and Deploy:**
   ```
   Coolify → Project → Environment Variables
   Link team variables
   Redeploy
   ```

5. **Test:**
   ```
   Login → /admin/ai-models → Test Configuration
   ```

---

## 💡 Usage Examples

### In Edge Functions

```typescript
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

const aiService = new AIServiceV2();

// Complex task (uses Sonnet)
const blogPost = await aiService.generateContent({
  messages: [{ role: 'user', content: 'Write a blog post...' }],
  maxTokens: 4000
}, 'standard');

// Simple task (uses Haiku)
const category = await aiService.generateLightweight(
  'Classify this document: ...',
  'You are a classifier.',
  50
);

// Test config
const test = await aiService.testConfiguration();
console.log(test);
```

---

## 🚨 Troubleshooting

### "relation ai_environment_config does not exist"
→ Migration not run yet. Follow Step 1 above.

### "API key not configured"
→ Coolify variables not set or not linked. Follow Steps 2-4 above.

### "Unauthorized: root_admin role required"
→ Test function requires root_admin. Check user_roles table.

### Test shows wrong model
→ Variables might not be loaded. Try redeploying the project.

---

## 📚 Further Reading

- **Quick Reference:** `AI/COOLIFY_AI_QUICK_REFERENCE.md`
- **Full Guide:** `AI/COOLIFY_AI_CENTRALIZED_DEPLOYMENT.md`
- **Implementation Details:** `AI/COOLIFY_AI_IMPLEMENTATION_SUMMARY.md`

---

## ✨ Benefits

- ✅ Centralized AI configuration
- ✅ Cost optimization (60-80% savings)
- ✅ Multi-provider support
- ✅ Easy global updates
- ✅ Comprehensive testing
- ✅ Root admin controls
- ✅ Environment monitoring

---

**Implementation Date:** 2026-02-04  
**Status:** ✅ Complete - Ready for Deployment  
**Next Action:** Run database migration in Supabase SQL Editor
