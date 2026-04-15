# ⚡ Quick Start: Advanced SEO Features

## 🚀 Get Started in 3 Steps (10 Minutes)

### Step 1: Get Your FREE API Key (5 min)

1. Visit: https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com
2. Enable the PageSpeed Insights API
3. Create API key: https://console.cloud.google.com/apis/credentials
4. Add to Supabase secrets:
   ```bash
   supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key_here
   ```

### Step 2: Deploy Functions (3 min)

```bash
supabase functions deploy check-core-web-vitals
supabase functions deploy check-broken-links
supabase functions deploy analyze-content
supabase functions deploy sync-backlinks
supabase functions deploy track-serp-positions
```

### Step 3: Test It! (2 min)

```typescript
// In your browser console or component
import { supabase } from '@/integrations/supabase/client';

// Test Core Web Vitals
const { data } = await supabase.functions.invoke('check-core-web-vitals', {
  body: { url: window.location.origin }
});

console.log('Performance Score:', data.data.metrics.performanceScore);
```

---

## 📝 Quick Usage Examples

### Check Core Web Vitals

```typescript
const { data, error } = await supabase.functions.invoke('check-core-web-vitals', {
  body: {
    url: 'https://yoursite.com',
    strategy: 'mobile' // or 'desktop'
  }
});

if (data?.success) {
  console.log('LCP:', data.data.metrics.lcp);
  console.log('CLS:', data.data.metrics.cls);
  console.log('Performance Score:', data.data.metrics.performanceScore);
}
```

**What you get:**
- Performance score (0-100)
- Core Web Vitals (LCP, FID, CLS)
- Optimization opportunities
- Mobile + Desktop metrics

---

### Scan for Broken Links

```typescript
const { data, error } = await supabase.functions.invoke('check-broken-links', {
  body: {
    url: 'https://yoursite.com/page',
    checkExternal: true,
    maxLinks: 100
  }
});

if (data?.success) {
  console.log('Broken links found:', data.data.brokenLinksFound);
  console.log('Links checked:', data.data.totalLinksChecked);
}
```

**What you get:**
- All broken links (internal + external)
- HTTP status codes
- Priority levels (critical/high/medium/low)
- Automatic tracking and alerts

---

### Analyze Content Quality

```typescript
const { data, error } = await supabase.functions.invoke('analyze-content', {
  body: {
    url: 'https://yoursite.com/blog/article',
    targetKeyword: 'meal planning',
    contentType: 'blog_post'
  }
});

if (data?.success) {
  console.log('Overall Score:', data.data.scores.overall);
  console.log('Readability:', data.data.scores.readability);
  console.log('Keyword Density:', data.data.metrics.keywordDensity + '%');
  console.log('Suggestions:', data.data.suggestions);
}
```

**What you get:**
- Readability score (Flesch Reading Ease)
- Keyword density analysis
- Content structure score
- Actionable improvement suggestions

---

### Track Backlinks (Manual Entry)

```typescript
const { data, error } = await supabase.functions.invoke('sync-backlinks', {
  body: {
    targetDomain: 'yoursite.com',
    source: 'manual',
    manualBacklinks: [
      {
        sourceUrl: 'https://example.com/article',
        targetUrl: 'https://yoursite.com',
        anchorText: 'great resource',
        linkType: 'dofollow',
        domainAuthority: 65,
        notes: 'Found in industry roundup'
      }
    ]
  }
});
```

**What you get:**
- Backlink quality tracking
- Historical metrics
- Lost link detection
- Toxic link alerts

---

### Track SERP Positions

```typescript
// Requires SERPApi or DataForSEO API key
const { data, error } = await supabase.functions.invoke('track-serp-positions', {
  body: {
    keyword: 'meal planning for picky eaters',
    domain: 'yoursite.com',
    location: 'United States',
    device: 'desktop',
    competitors: ['competitor1.com', 'competitor2.com']
  }
});

if (data?.success) {
  console.log('Your position:', data.data.yourPosition);
  console.log('Position change:', data.data.positionChange);
  console.log('Competitors:', data.data.competitors);
}
```

**What you get:**
- Your ranking position
- Competitor positions
- SERP features (featured snippets, PAA)
- Position trend (up/down/stable)

---

## 📊 Query Your Data

### Get Core Web Vitals Trend

```sql
SELECT * FROM get_core_web_vitals_trend(
  'https://yoursite.com',
  30 -- last 30 days
);
```

### Get Backlink Summary

```sql
SELECT * FROM get_backlink_summary();
```

Returns:
- Total backlinks
- Active/Lost/Toxic counts
- Average domain authority
- New backlinks (last 30 days)

### Get Broken Links by Priority

```sql
SELECT * FROM get_broken_links_by_priority();
```

### Get SERP Position Changes

```sql
SELECT * FROM get_serp_position_changes(7); -- last 7 days
```

---

## 🔔 Automated Alerts

These triggers automatically create alerts in the `seo_alerts` table:

1. **Core Web Vitals Drop**
   - Triggers when performance drops ≥10 points
   - Severity: medium (10-14 drop), high (15-19), critical (20+)

2. **Toxic Backlink Detected**
   - Triggers when spam score ≥70
   - Severity: medium (70-79), high (80-89), critical (90+)

3. **Critical Broken Link**
   - Triggers for critical/high priority broken links
   - Severity: high (critical links), medium (high priority)

4. **SERP Position Drop**
   - Triggers for significant ranking drops
   - Integrates with existing keyword tracking

---

## 🎨 Add to Your SEO Dashboard

### Example Component

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function CoreWebVitalsCard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkVitals = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke('check-core-web-vitals', {
      body: { url: window.location.origin }
    });

    if (data?.success) {
      setMetrics(data.data.metrics);
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Core Web Vitals</CardTitle>
      </CardHeader>
      <CardContent>
        <button onClick={checkVitals} disabled={loading}>
          {loading ? 'Checking...' : 'Check Performance'}
        </button>

        {metrics && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between">
              <span>Performance Score</span>
              <Badge variant={metrics.performanceScore >= 90 ? 'success' : 'warning'}>
                {metrics.performanceScore}/100
              </Badge>
            </div>

            <div className="flex justify-between">
              <span>LCP</span>
              <span>{metrics.lcp}s</span>
            </div>

            <div className="flex justify-between">
              <span>CLS</span>
              <span>{metrics.cls}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 🔄 Automate with Cron Jobs

### Daily Core Web Vitals Check

```typescript
// Create a cron job that runs daily
// Example using Supabase Edge Functions with cron

// In your cron handler:
const pages = [
  'https://yoursite.com',
  'https://yoursite.com/blog',
  'https://yoursite.com/pricing'
];

for (const url of pages) {
  await supabase.functions.invoke('check-core-web-vitals', {
    body: { url }
  });
}
```

### Weekly Broken Link Scan

```typescript
// Run weekly on all important pages
const pages = await supabase
  .from('seo_page_scores')
  .select('page_url')
  .eq('is_important', true);

for (const page of pages.data) {
  await supabase.functions.invoke('check-broken-links', {
    body: { url: page.page_url }
  });
}
```

---

## 💡 Pro Tips

### 1. Start Small
- Test with 1-2 pages first
- Check Core Web Vitals (FREE)
- Scan for broken links (FREE)
- Analyze content (FREE)

### 2. Monitor Trends
- Run weekly checks
- Compare historical data
- Track improvements

### 3. Fix Issues Progressively
- Prioritize by impact
- Start with critical issues
- Track fixes in the database

### 4. Automate Gradually
- Manual checks first
- Add automation when comfortable
- Use cron jobs for regular scans

### 5. Budget Wisely
- Start with FREE tier
- Add SERP tracking ($30/month) when ready
- Consider backlink APIs ($79-99/month) later

---

## 🆘 Common Issues

### "API Key Not Found"

```bash
# Check secrets
supabase secrets list

# Set secret
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key

# Restart functions
supabase functions deploy check-core-web-vitals --no-verify-jwt
```

### "Rate Limit Exceeded"

- PageSpeed API: 25,000 requests/day (FREE)
- Solution: Implement request caching
- Or: Add delay between requests

### "Function Timeout"

For broken link checker:
- Reduce `maxLinks` parameter
- Set `checkExternal: false` to skip external links
- Run on smaller pages first

---

## 📈 Measure Your Success

### Week 1
- ✅ Core Web Vitals baseline established
- ✅ Broken links identified and fixed
- ✅ Content analysis completed

### Week 2-4
- ✅ Performance improved (target: 90+ score)
- ✅ All critical broken links resolved
- ✅ Content optimized (target: 80+ scores)

### Month 2+
- ✅ Automated monitoring in place
- ✅ Historical trends tracked
- ✅ Proactive issue detection

---

## 🎯 Next Steps

1. ✅ Get FREE PageSpeed API key → `API_SETUP_GUIDE.md`
2. ✅ Deploy functions (5 min)
3. ✅ Test Core Web Vitals check
4. ✅ Scan your homepage for broken links
5. ✅ Analyze your best blog post
6. 🔄 Set up weekly automation
7. 🔄 Integrate into SEO Dashboard UI
8. 🔄 Add paid APIs (optional)

---

## 📚 Full Documentation

- **Features Overview:** `ADVANCED_SEO_FEATURES.md`
- **API Setup:** `API_SETUP_GUIDE.md`
- **Implementation Summary:** `SEO_IMPLEMENTATION_SUMMARY.md`

---

**Ready to test? Start with:**

```typescript
const { data } = await supabase.functions.invoke('check-core-web-vitals', {
  body: { url: window.location.origin }
});

console.log(data);
```

**Let's dominate search rankings! 🚀**
