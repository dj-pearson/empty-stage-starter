# 🔑 API Setup Guide for Advanced SEO Features

## Quick Start: Get Your FREE API Key (5 Minutes)

### PageSpeed Insights API (Required - FREE)

This powers your Core Web Vitals monitoring. **100% FREE, no credit card required.**

#### Step-by-Step:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create a New Project** (or select existing)
   - Click "Select a project" dropdown at top
   - Click "New Project"
   - Name it: "EatPal SEO Tools"
   - Click "Create"

3. **Enable PageSpeed Insights API**
   - Visit: https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com
   - Make sure your project is selected
   - Click "Enable"

4. **Create API Credentials**
   - Visit: https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials"
   - Select "API Key"
   - Copy the generated key

5. **Restrict Your API Key** (Recommended for security)
   - Click on your new API key to edit
   - Under "API restrictions":
     - Select "Restrict key"
     - Check "PageSpeed Insights API"
   - Under "Application restrictions":
     - Select "HTTP referrers (web sites)"
     - Add your domain: `yoursite.com/*`
   - Click "Save"

6. **Add to Environment**
   ```bash
   # In your .env file
   PAGESPEED_INSIGHTS_API_KEY=AIza...your_key_here
   ```

7. **Test It**
   ```bash
   curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://yoursite.com&key=YOUR_KEY"
   ```

**Quota:** 25,000 requests/day (FREE) - More than enough!

---

## Optional APIs (Choose Based on Budget)

### SERP Tracking APIs

#### Option 1: SERPApi ($50/month) - Easiest

**Best for:** Ease of use, comprehensive data, great documentation

**Pros:**
- Simple API, well-documented
- Supports Google, Bing, Yahoo, DuckDuckGo
- SERP features detection (featured snippets, PAA, etc.)
- Multiple locations and languages
- Fast response times

**Cons:**
- More expensive than DataForSEO
- Requires credit card

**Setup:**
1. Sign up: https://serpapi.com/
2. Choose "Startup" plan ($50/month, 5,000 searches)
3. Get API key from dashboard
4. Add to `.env`:
   ```bash
   SERPAPI_KEY=your_serpapi_key_here
   ```

**Free Trial:** 100 searches free, no credit card required

---

#### Option 2: DataForSEO ($30/month) - Most Affordable

**Best for:** Budget-conscious users, high volume

**Pros:**
- More affordable ($30/month for 6,000 SERP tasks)
- Pay-as-you-go pricing available
- Comprehensive data
- Real-time and historical data

**Cons:**
- More complex API
- Steeper learning curve
- Documentation less beginner-friendly

**Setup:**
1. Sign up: https://dataforseo.com/
2. Choose "Starter" plan ($30/month)
3. Get login credentials from dashboard
4. Add to `.env`:
   ```bash
   DATAFORSEO_LOGIN=your_login
   DATAFORSEO_PASSWORD=your_password
   ```

**Free Trial:** $1 to start, credit-based system

---

### Backlink Tracking APIs

#### Option 1: Ahrefs ($99/month) - Most Comprehensive

**Best for:** Serious SEO professionals, agencies

**Pros:**
- Industry-leading backlink database
- Best data accuracy
- Domain Rating (DR) and URL Rating (UR)
- Comprehensive metrics
- Regular updates

**Cons:**
- Most expensive
- Requires $99/month API plan (separate from web subscription)

**Setup:**
1. Sign up: https://ahrefs.com/api
2. Subscribe to API plan ($99/month)
3. Get API key from dashboard
4. Add to `.env`:
   ```bash
   AHREFS_API_KEY=your_ahrefs_api_key
   ```

**Free Trial:** No free trial for API

---

#### Option 2: Moz ($79/month) - Solid Alternative

**Best for:** Budget-conscious professionals

**Pros:**
- Established metrics (Domain Authority, Page Authority)
- Good data quality
- Spam score included
- More affordable than Ahrefs

**Cons:**
- Smaller backlink database than Ahrefs
- Slower update frequency

**Setup:**
1. Sign up: https://moz.com/products/api
2. Subscribe to API plan ($79/month)
3. Get Access ID and Secret Key
4. Add to `.env`:
   ```bash
   MOZ_ACCESS_ID=your_moz_access_id
   MOZ_SECRET_KEY=your_moz_secret_key
   ```

**Free Trial:** 30-day trial available

---

#### Option 3: Manual Entry (FREE) - Budget Solution

**Best for:** Startups, small sites, tight budgets

**Pros:**
- Completely free
- Full control over data
- Good for tracking known backlinks

**Cons:**
- Time-consuming
- Manual data entry required
- Limited discovery of new backlinks

**Setup:**
- No API key needed
- Use the `sync-backlinks` function with `source: 'manual'`
- Enter backlinks through UI or API calls

---

## Configuration Summary

### Minimal Setup (FREE)

```bash
# .env file
PAGESPEED_INSIGHTS_API_KEY=your_pagespeed_key
```

**Features Enabled:**
- ✅ Core Web Vitals Monitoring
- ✅ Content Analysis (readability, keyword density)
- ✅ Broken Link Checker
- ✅ Manual backlink tracking

**Monthly Cost: $0**

---

### Budget Setup ($30/month)

```bash
# .env file
PAGESPEED_INSIGHTS_API_KEY=your_pagespeed_key
DATAFORSEO_LOGIN=your_dataforseo_login
DATAFORSEO_PASSWORD=your_dataforseo_password
```

**Features Enabled:**
- ✅ Core Web Vitals Monitoring
- ✅ Content Analysis
- ✅ Broken Link Checker
- ✅ Manual backlink tracking
- ✅ SERP Position Tracking (automated)

**Monthly Cost: $30**

---

### Professional Setup ($109/month)

```bash
# .env file
PAGESPEED_INSIGHTS_API_KEY=your_pagespeed_key
DATAFORSEO_LOGIN=your_dataforseo_login
DATAFORSEO_PASSWORD=your_dataforseo_password
MOZ_ACCESS_ID=your_moz_id
MOZ_SECRET_KEY=your_moz_key
```

**Features Enabled:**
- ✅ Core Web Vitals Monitoring
- ✅ Content Analysis
- ✅ Broken Link Checker
- ✅ Backlink Tracking (automated)
- ✅ SERP Position Tracking (automated)

**Monthly Cost: $109**

---

### Enterprise Setup ($149/month)

```bash
# .env file
PAGESPEED_INSIGHTS_API_KEY=your_pagespeed_key
SERPAPI_KEY=your_serpapi_key
AHREFS_API_KEY=your_ahrefs_key
```

**Features Enabled:**
- ✅ Core Web Vitals Monitoring
- ✅ Content Analysis
- ✅ Broken Link Checker
- ✅ Backlink Tracking (Ahrefs - best data)
- ✅ SERP Position Tracking (SERPApi - easiest)

**Monthly Cost: $149**

---

## Setting Environment Variables in Supabase

### Method 1: Via Supabase CLI

```bash
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key
supabase secrets set SERPAPI_KEY=your_key
supabase secrets set AHREFS_API_KEY=your_key
supabase secrets set MOZ_ACCESS_ID=your_id
supabase secrets set MOZ_SECRET_KEY=your_key
supabase secrets set DATAFORSEO_LOGIN=your_login
supabase secrets set DATAFORSEO_PASSWORD=your_password
```

### Method 2: Via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/functions
2. Click on "Edge Functions"
3. Click "Add Secret"
4. Enter key name and value
5. Click "Save"

---

## Testing Your APIs

### Test PageSpeed Insights

```bash
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://google.com&key=YOUR_KEY"
```

Should return JSON with performance metrics.

### Test SERPApi

```bash
curl "https://serpapi.com/search.json?engine=google&q=test&api_key=YOUR_KEY"
```

Should return JSON with search results.

### Test DataForSEO

```bash
echo '[{"keyword":"test","location_code":2840}]' | \
curl -X POST \
  -u "LOGIN:PASSWORD" \
  -H "Content-Type: application/json" \
  -d @- \
  https://api.dataforseo.com/v3/serp/google/organic/live/advanced
```

Should return JSON with SERP data.

### Test Ahrefs

```bash
curl -H "Authorization: Bearer YOUR_KEY" \
  "https://api.ahrefs.com/v3/site-explorer/backlinks?target=google.com&mode=domain&limit=10"
```

Should return JSON with backlink data.

### Test Moz

```bash
# Moz uses HMAC authentication - easier to test through the function
```

---

## Recommended Setup Path

### Week 1: Free Tier
Start with the free PageSpeed API and manual backlink entry. Get familiar with the features.

**Cost: $0**

### Week 2-4: Add SERP Tracking
Once you're comfortable, add DataForSEO for automated SERP tracking.

**Cost: $30/month**

### Month 2+: Add Backlinks
When budget allows, add Moz or Ahrefs for automated backlink discovery.

**Cost: $79-$109/month**

---

## ROI Calculator

### Time Savings
- Manual SEO checks: ~10 hours/week
- Automated checks: ~30 minutes/week
- **Savings:** 9.5 hours/week = 38 hours/month

### Cost Comparison

**Your Setup (Budget Tier):**
- Core Web Vitals: FREE
- Content Analysis: FREE
- Broken Links: FREE
- SERP Tracking: $30/month
- **Total: $30/month**

**Competitor Tools:**
- Ahrefs: $99/month
- SEMrush: $119/month
- Moz: $79/month
- Screaming Frog: $209/year ($17/month)
- **Total: $314/month**

**Savings: $284/month** (90% cheaper!)

---

## Support Resources

### API Documentation

- **PageSpeed Insights:** https://developers.google.com/speed/docs/insights/v5/get-started
- **SERPApi:** https://serpapi.com/search-api
- **DataForSEO:** https://docs.dataforseo.com/
- **Ahrefs:** https://ahrefs.com/api/documentation
- **Moz:** https://moz.com/api/links

### Community & Help

- **PageSpeed Insights:** Google Cloud Support
- **SERPApi:** support@serpapi.com, Discord community
- **DataForSEO:** support@dataforseo.com, 24/7 chat
- **Ahrefs:** api@ahrefs.com
- **Moz:** help@moz.com

---

## Security Best Practices

1. **Never Commit API Keys to Git**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for templates

2. **Restrict API Keys**
   - Use IP restrictions if possible
   - Use domain restrictions for web APIs
   - Rotate keys periodically

3. **Monitor Usage**
   - Set up billing alerts
   - Track API call quotas
   - Review usage monthly

4. **Use Environment-Specific Keys**
   - Development keys for testing
   - Production keys for live site
   - Different keys per environment

---

## Troubleshooting

### "API Key Not Found" Error

**Solution:**
```bash
# Check if secret is set
supabase secrets list

# Set the secret
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key

# Restart functions
supabase functions deploy --no-verify-jwt
```

### "Rate Limit Exceeded" Error

**Solutions:**
- Wait 24 hours (resets daily)
- Upgrade to paid tier
- Implement request caching
- Use multiple API keys (rotate)

### "Invalid API Key" Error

**Check:**
1. Key is copied correctly (no extra spaces)
2. API is enabled in Google Cloud Console
3. Billing is enabled (even for free tier)
4. Key restrictions allow your domain/IP

---

## Next Steps

1. ✅ Get FREE PageSpeed API key (5 minutes)
2. ✅ Test Core Web Vitals function
3. ✅ Run broken link checker
4. ✅ Analyze content quality
5. 🔄 Decide on paid APIs (optional)
6. 🔄 Set up automated monitoring
7. 🔄 Integrate into UI

---

**You're all set! Start with the free tier and scale up as needed. 🚀**
