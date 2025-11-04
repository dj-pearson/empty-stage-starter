# 🎯 Using GSC for Core Web Vitals (No Extra API Key Needed!)

## Overview

**Good news!** You can use your existing Google Search Console OAuth setup to get Core Web Vitals data **without needing a separate PageSpeed Insights API key!**

---

## 📊 Two Options Available

### Option 1: GSC + Chrome UX Report (CrUX) - FREE ✅
**What you get:**
- Real user data (field data) from actual Chrome users
- LCP, FID, CLS metrics
- Same data GSC shows in the "Experience" report
- Historical trends
- **No extra API key needed!**

**Limitations:**
- Requires sufficient traffic (10,000+ visits/month)
- Only mobile data by default
- Less detailed than PageSpeed Insights
- No opportunities/diagnostics
- No accessibility/SEO scores

### Option 2: GSC + PageSpeed Insights - Best of Both ✨
**What you get:**
- Everything from CrUX (field data)
- Plus detailed lab data from PageSpeed
- Optimization opportunities
- Diagnostics and suggestions
- Accessibility, Best Practices, SEO scores
- Works for any site (no traffic requirement)

**Requirements:**
- PageSpeed Insights API key (FREE, 25k requests/day)
- Takes 5 minutes to set up

---

## 🚀 Quick Setup (Option 1: GSC Only)

### Step 1: Deploy the New Function

```bash
supabase functions deploy gsc-fetch-core-web-vitals
```

This function:
1. Uses your existing GSC OAuth credentials
2. Fetches Core Web Vitals from Chrome UX Report (CrUX)
3. Falls back to PageSpeed if API key is available
4. Saves data to the same `seo_core_web_vitals` table

### Step 2: Use It!

```typescript
import { supabase } from '@/integrations/supabase/client';

// Fetch Core Web Vitals using GSC
const { data, error } = await supabase.functions.invoke('gsc-fetch-core-web-vitals', {
  body: {
    siteUrl: 'https://yoursite.com'
  }
});

if (data?.success) {
  console.log('LCP:', data.data.metrics.mobile_lcp);
  console.log('CLS:', data.data.metrics.mobile_cls);
  console.log('Data Source:', data.data.dataSource); // "crux_via_gsc" or "pagespeed_via_gsc"
}
```

### Step 3: That's It! 🎉

No extra API key needed. Uses your existing GSC connection.

---

## 🔄 How It Works

### Data Flow

```
Your App
    ↓
GSC OAuth Token (already set up)
    ↓
Chrome UX Report API (CrUX)
    ↓
Core Web Vitals Metrics
    ↓
Saved to Database
```

### What Gets Saved

```json
{
  "page_url": "https://yoursite.com",
  "mobile_lcp": "2.3",
  "mobile_fid": "45",
  "mobile_cls": "0.08",
  "lcp_status": "good",
  "fid_status": "good",
  "cls_status": "good",
  "mobile_performance_score": 90,
  "data_source": "crux_via_gsc",
  "measured_at": "2025-01-06T..."
}
```

---

## 📈 Comparison: CrUX vs PageSpeed

| Feature | CrUX (via GSC) | PageSpeed Insights |
|---------|----------------|-------------------|
| **Cost** | FREE | FREE |
| **API Key** | Not needed (uses GSC) | Separate API key |
| **Data Type** | Field data (real users) | Lab data (simulated) |
| **Traffic Required** | 10,000+ visits/month | No requirement |
| **Metrics** | LCP, FID, CLS | LCP, FID, CLS, FCP, TTFB, Speed Index, TBT |
| **Scores** | Performance (estimated) | Performance, Accessibility, Best Practices, SEO |
| **Opportunities** | ❌ Not available | ✅ Detailed suggestions |
| **Diagnostics** | ❌ Not available | ✅ Full breakdown |
| **Update Frequency** | Daily aggregate | Real-time testing |
| **Best For** | Established sites with traffic | New sites, detailed analysis |

---

## 🎯 Which Should You Use?

### Use CrUX (GSC Only) If:
- ✅ You have an established site (10k+ visits/month)
- ✅ You want real user data (field data)
- ✅ You don't want to manage another API key
- ✅ You only need basic CWV metrics
- ✅ You're already using GSC extensively

### Use PageSpeed (Hybrid) If:
- ✅ You have a new site or low traffic
- ✅ You want detailed optimization suggestions
- ✅ You need accessibility/SEO scores
- ✅ You want to test pages before publishing
- ✅ You need diagnostic information

### Use Both! (Recommended) 🌟
- ✅ Get real user data from CrUX
- ✅ Get detailed testing from PageSpeed
- ✅ Compare field vs lab data
- ✅ Full picture of performance

---

## 💡 Hybrid Approach (Recommended)

The new function automatically uses both:

1. **Checks for PageSpeed API key**
   - If found: Uses PageSpeed for detailed metrics
   - If not found: Falls back to CrUX

2. **Always uses your GSC OAuth**
   - No separate authentication needed
   - Seamless integration

### Setup Hybrid Approach

```bash
# Deploy the hybrid function
supabase functions deploy gsc-fetch-core-web-vitals

# Optional: Add PageSpeed key for enhanced data
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key_here
```

Now you get:
- ✅ CrUX real user data (via GSC)
- ✅ PageSpeed detailed analysis (if key available)
- ✅ Fallback to CrUX if PageSpeed unavailable
- ✅ Automatic selection of best data source

---

## 🔧 Integration with Existing SEO Dashboard

### Update Your Component

```typescript
// Option 1: Use the new GSC-based function (no extra API key)
const checkCoreWebVitals = async () => {
  const { data } = await supabase.functions.invoke('gsc-fetch-core-web-vitals', {
    body: { siteUrl: window.location.origin }
  });

  if (data?.success) {
    console.log('Data source:', data.data.dataSource);
    // "crux_via_gsc" = using GSC/CrUX only
    // "pagespeed_via_gsc" = using PageSpeed (more detailed)
  }
};

// Option 2: Use original function (requires PageSpeed API key)
const checkWithPageSpeed = async () => {
  const { data } = await supabase.functions.invoke('check-core-web-vitals', {
    body: { url: window.location.origin }
  });
};
```

---

## 📊 Data Quality

### CrUX (Field Data) - Real User Experience
- ✅ Real users, real devices, real networks
- ✅ Accurate representation of user experience
- ✅ Includes device, connection, and location variations
- ❌ Requires sufficient traffic (minimum 10k visits/month)
- ❌ Updates daily (not real-time)
- ❌ 75th percentile data (some users may have worse experience)

### PageSpeed (Lab Data) - Controlled Testing
- ✅ Works for any site (no traffic requirement)
- ✅ Real-time results
- ✅ Consistent, reproducible
- ✅ Detailed optimization opportunities
- ❌ Simulated environment (may not match real users)
- ❌ Single test scenario
- ❌ May not reflect actual user experience

### Best Practice: Use Both! 🎯
- **CrUX** = What your users actually experience
- **PageSpeed** = What's technically possible and how to improve
- **Combined** = Complete picture of performance

---

## 🚀 Next Steps

### For Immediate Use (No Extra Setup):

1. ✅ Deploy the new function:
   ```bash
   supabase functions deploy gsc-fetch-core-web-vitals
   ```

2. ✅ Test it:
   ```typescript
   const { data } = await supabase.functions.invoke('gsc-fetch-core-web-vitals', {
     body: { siteUrl: 'https://yoursite.com' }
   });
   console.log(data);
   ```

3. ✅ Done! Uses your existing GSC setup.

### For Enhanced Data (5 Min Setup):

1. Get PageSpeed API key: https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com
2. Set the key:
   ```bash
   supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key
   ```
3. Function automatically uses it for enhanced data!

---

## 📝 Summary

### You Have 3 Options:

| Option | API Keys Needed | Data Quality | Setup Time | Cost |
|--------|----------------|--------------|------------|------|
| **1. GSC + CrUX Only** | GSC OAuth only ✅ | Good (field) | 2 min | FREE |
| **2. PageSpeed Only** | PageSpeed key | Excellent (lab) | 5 min | FREE |
| **3. Hybrid (Both)** | GSC OAuth + PageSpeed | Best (field + lab) | 5 min | FREE |

### Recommended: Option 3 (Hybrid) 🌟

- Get real user data from CrUX
- Get detailed insights from PageSpeed
- Automatic fallback if one fails
- Best of both worlds!

---

## ✅ Already Have GSC Set Up?

If you've already connected Google Search Console for keyword tracking, you're **90% done**!

Just deploy the new function and start getting Core Web Vitals data:

```bash
supabase functions deploy gsc-fetch-core-web-vitals
```

**No extra API keys. No extra OAuth. Just works!** 🎉

---

## 🤔 Which Function Should You Use?

- **`gsc-fetch-core-web-vitals`** ← Use this! (Hybrid, smart, uses GSC OAuth)
- **`check-core-web-vitals`** ← Original (PageSpeed only, requires separate API key)

The new hybrid function is smarter and more flexible. It's the recommended choice.

---

**You're all set!** Deploy the function and start monitoring Core Web Vitals using your existing GSC setup. 🚀
