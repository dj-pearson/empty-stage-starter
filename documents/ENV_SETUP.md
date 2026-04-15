# 🔐 Environment Setup

## Supabase Configuration

Your app needs Supabase credentials to work. Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Getting Your Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

## Optional: USDA API Key

For enhanced barcode lookup (fallback option), you can add a USDA API key:

### Getting USDA API Key

1. Go to [USDA FoodData Central](https://fdc.nal.usda.gov/api-key-signup.html)
2. Fill out the form (it's free!)
3. You'll receive the API key via email

### Adding to Supabase Edge Functions

The USDA API key needs to be added to your Supabase project (NOT in .env):

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Edge Functions** → **Settings**
4. Click **Add Environment Variable**
5. Add:
   - **Name**: `USDA_API_KEY`
   - **Value**: Your USDA API key
6. Save

### How the API Cascade Works

When scanning a barcode, the app searches in this order:

1. **🥇 Open Food Facts** (Primary)

   - Free, no API key needed
   - Largest open food database
   - Works 90% of the time

2. **🥈 USDA FoodData Central** (Fallback)

   - Requires free API key
   - Official US government database
   - Great for American products

3. **🥉 FoodRepo** (Final Fallback)
   - No API key needed
   - European food database
   - Last resort lookup

## Testing Without USDA Key

Don't worry if you don't have a USDA key! The app works great with just Open Food Facts. You'll see this in the logs:

```
USDA API key not configured, skipping...
```

This is completely normal and expected.

## Environment Variables Summary

### Required (in `.env` file)

```env
VITE_SUPABASE_URL=xxx
VITE_SUPABASE_ANON_KEY=xxx
```

### Optional (in Supabase Dashboard)

```
USDA_API_KEY=xxx
```

---

**Pro Tip**: Never commit your `.env` file to Git! It's already in `.gitignore` for security.
