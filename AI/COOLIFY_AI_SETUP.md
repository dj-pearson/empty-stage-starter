# Coolify AI Setup - Quick Start

## ⚠️ Database Setup Required First

Before the AI Model Manager UI will work, you need to run the database migration.

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard at https://api.tryeatpal.com
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of:
   ```
   supabase/migrations/20260204000000_coolify_ai_shared_variables.sql
   ```
5. Paste into the SQL editor
6. Click **Run**
7. Verify success (should see "Success. No rows returned")

### Option 2: Via psql (If you have direct access)

```bash
psql "your-connection-string" -f supabase/migrations/20260204000000_coolify_ai_shared_variables.sql
```

### Option 3: Via Supabase CLI (Local development)

```bash
supabase db push
```

---

## 📋 Coolify Team Shared Variables Setup

After running the migration, configure these in Coolify:

### Required Variables

```bash
AI_DEFAULT_PROVIDER=anthropic
DEFAULT_AI_MODEL=claude-sonnet-4-5-20250929
LIGHTWEIGHT_AI_MODEL=claude-3-5-haiku-20241022
CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Optional Variables

```bash
OPENAI_GLOBAL_API=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AI_MAX_RETRIES=3
AI_TIMEOUT_MS=30000
AI_TEMPERATURE=0.7
AI_ENABLE_CACHING=true
```

---

## 🔗 Link Variables to Project

In Coolify:
1. Go to **Project → Environment Variables**
2. Add these Team Shared Variables:

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

3. **Redeploy** the project

---

## ✅ Testing

1. Login to your app as `root_admin`
2. Navigate to `/admin/ai-models`
3. Click **"Test Configuration"**
4. Verify all checks pass:
   - ✅ Environment variables loaded
   - ✅ API keys configured
   - ✅ Database connection working
   - ✅ Standard model responding (should be < 2000ms)
   - ✅ Lightweight model responding (should be < 500ms)

---

## 📂 Files Created

### Database
- `supabase/migrations/20260204000000_coolify_ai_shared_variables.sql`

### Backend  
- `supabase/functions/_shared/ai-service-v2.ts`
- `supabase/functions/test-ai-configuration/index.ts`

### Frontend
- `src/components/admin/AIModelManager.tsx`

### Documentation
- `AI/COOLIFY_AI_CENTRALIZED_DEPLOYMENT.md` (Full guide)
- `AI/COOLIFY_AI_QUICK_REFERENCE.md` (Quick reference)
- `AI/COOLIFY_AI_IMPLEMENTATION_SUMMARY.md` (What we built)
- `AI/COOLIFY_AI_SETUP.md` (This file)

---

## 🚨 Troubleshooting

### Error: "relation ai_environment_config does not exist"
**Solution:** Run the migration (see Database Setup above)

### Error: "API key not configured"
**Solution:**
1. Check Coolify Team Variables include `CLAUDE_API_KEY`
2. Verify project has linked `{{ team.CLAUDE_API_KEY }}`
3. Redeploy project

### Error: "No default lightweight model configured"
**Solution:** Migration wasn't applied. Re-run the migration.

### Test fails but edge functions work
**Solution:**
1. Verify you're logged in as `root_admin`
2. Check browser console for errors
3. Verify edge functions server is running

---

## 🎯 Next Steps

1. ✅ Run database migration
2. ✅ Set up Coolify Team Variables
3. ✅ Link variables to project
4. ✅ Redeploy project
5. ✅ Test configuration
6. 📖 Read full deployment guide: `AI/COOLIFY_AI_CENTRALIZED_DEPLOYMENT.md`
7. 🚀 Deploy to other projects in your portfolio

---

**Last Updated:** 2026-02-04  
**Status:** Ready for deployment
