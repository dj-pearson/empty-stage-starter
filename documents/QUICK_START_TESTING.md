# Quick Start: Testing Webhook Integration

## Prerequisites

1. Admin access to the EatPal dashboard
2. Make.com account (or Zapier)
3. Database migration applied

---

## Step 1: Apply Database Migration

Run the migration to add new columns:

```bash
cd supabase
supabase db push
```

Or if you prefer to apply individually:
```bash
supabase migration up 20251009160000_add_social_content_versions
```

---

## Step 2: Set Up Make.com Webhook

### Create a New Scenario

1. Go to Make.com and create a new scenario
2. Add a "Webhook" trigger module
3. Choose "Custom webhook"
4. Click "Add" to create a new webhook
5. **Copy the webhook URL** (you'll need this)

### Test Webhook Setup

Add a "Tools" → "Set Variable" module after webhook to see the data:
- Name: `webhook_data`
- Value: `{{webhook payload}}`

---

## Step 3: Configure Social Media Webhook

1. Go to **Admin Dashboard** → **Social Media** → **Connected Accounts** tab
2. Click "Add Webhook"
3. Paste your Make.com webhook URL
4. Click "Save Webhook"

You should see the webhook listed as "Active" ✓

---

## Step 4: Test Social Media Publishing

### Test 1: Manual Post

1. Go to **Social Media** → **Posts** tab
2. Click "AI Generate"
3. Enter a topic: "3 easy snack ideas for toddlers"
4. Click "Generate Content"
5. Review the generated content (notice short and long versions)
6. Click "New Post" to create from the AI content
7. Fill in details and click "Create Draft"
8. Find your draft post and click "Publish"

**Expected Result**:
- Post shows as "Published"
- Make.com webhook receives data
- Check Make.com for the webhook payload

**Webhook should contain**:
```json
{
  "type": "social_post_published",
  "short_form": "...",
  "long_form": "...",
  "url": "https://tryeatpal.com",
  "hashtags": [...]
}
```

---

## Step 5: Configure Blog Webhook

1. Go to **Admin Dashboard** → **Blog** tab
2. Click the "Webhook" button (top right)
3. Paste your Make.com webhook URL (can be the same or different)
4. Click "Save Webhook"

Green checkmark should appear next to Webhook button ✓

---

## Step 6: Test Blog Publishing

### Test 2: Manual Blog Publish

1. Go to **Blog** tab
2. Click "AI Generate Article"
3. Enter topic: "5 strategies to introduce vegetables to picky eaters"
4. Enter keywords: "picky eaters, vegetables, toddler nutrition"
5. Click "Generate Article"
6. Wait for generation (may take 30-60 seconds)
7. Review the blog post
8. Click "Publish"

**Expected Result**:
- Blog post shows as "Published"
- Social media posts are automatically generated
- Dialog shows generated social posts
- Make.com webhook receives data

**Webhook should contain**:
```json
{
  "type": "blog_published",
  "blog_title": "...",
  "blog_url": "https://tryeatpal.com/blog/...",
  "short_form": "...",
  "long_form": "...",
  "hashtags": [...]
}
```

---

## Step 7: Test Full Automation (Advanced)

### Option A: Test via API

Use Postman or curl to test edge functions:

```bash
# Test Social Auto-Publish
curl -X POST \
  https://your-project.supabase.co/functions/v1/generate-social-content \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Quick breakfast ideas for busy parents",
    "autoPublish": true,
    "webhookUrl": "YOUR_MAKE_WEBHOOK_URL"
  }'

# Test Blog Auto-Publish
curl -X POST \
  https://your-project.supabase.co/functions/v1/generate-blog-content \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "How to meal prep for picky eaters",
    "keywords": "meal prep, picky eaters, planning",
    "autoPublish": true,
    "webhookUrl": "YOUR_MAKE_WEBHOOK_URL"
  }'
```

### Option B: Set Up Make.com Schedule

**Social Media Scenario:**
1. Add "Schedule" module (e.g., daily at 9 AM)
2. Add "HTTP" module with request to `generate-social-content`
3. Set `autoPublish: true` in body
4. Add webhook module to catch response
5. Run once to test

**Blog Scenario:**
1. Add "Schedule" module (e.g., weekly on Monday)
2. Add "HTTP" module with request to `generate-blog-content`
3. Set `autoPublish: true` in body
4. Add webhook module to catch response
5. Run once to test

---

## Verification Checklist

### Social Media

- [ ] Webhook shows as "Active" in Connected Accounts
- [ ] Can generate AI content with short and long forms
- [ ] Publishing sends data to webhook
- [ ] Webhook receives correct payload structure
- [ ] short_form is under 280 characters
- [ ] long_form is 150-250 words
- [ ] Hashtags are included
- [ ] URL defaults to https://tryeatpal.com

### Blog

- [ ] Webhook button shows green checkmark when configured
- [ ] Can generate AI blog articles
- [ ] Publishing generates social posts automatically
- [ ] Social posts dialog displays generated content
- [ ] Webhook receives blog + social data
- [ ] blog_url is correctly formatted
- [ ] Both short and long social forms are included
- [ ] Hashtags extracted from social content

### Automation

- [ ] Edge function responds to autoPublish parameter
- [ ] autoPublish creates post in database
- [ ] autoPublish sends to webhook
- [ ] Webhook receives data immediately after creation
- [ ] Make.com can call edge functions successfully

---

## Troubleshooting

### Webhook Not Receiving Data

**Check:**
1. Webhook URL is correct (no typos)
2. Webhook is active in Make.com
3. No firewall blocking requests
4. Review webhook logs in Admin Dashboard

**Fix:**
- Copy webhook URL again from Make.com
- Re-save in admin dashboard
- Test with a simple post first

### Social Posts Not Generating

**Check:**
1. AI model configured in Admin → AI Settings
2. API key set in environment variables
3. Edge function logs in Supabase dashboard

**Fix:**
- Verify AI Settings configuration
- Check Supabase logs for errors
- Test edge function directly with curl

### Blog Social Generation Fails

**Check:**
1. Edge function has access to Supabase client
2. generate-social-content function is deployed
3. Blog slug is being generated correctly

**Fix:**
- Review edge function logs
- Check blog_posts table for published post
- Verify social content generation parameters

---

## Next Steps

After successful testing:

1. **Connect Social Platforms** in Make.com:
   - Add Facebook Pages module
   - Add Twitter module
   - Add LinkedIn module
   - Route short_form to Twitter
   - Route long_form to Facebook/LinkedIn

2. **Set Up Schedules**:
   - Social posts: 2-3 times per week
   - Blog posts: 1 time per week
   - Vary timing for optimal engagement

3. **Monitor Performance**:
   - Check webhook logs regularly
   - Review social media engagement
   - Adjust content based on performance

4. **Customize Content**:
   - Fine-tune AI prompts
   - Add brand voice guidelines
   - Adjust hashtag strategies

---

## Support Resources

- **WEBHOOK_AUTOMATION_GUIDE.md** - Complete automation guide
- **IMPLEMENTATION_SUMMARY_WEBHOOK_SYSTEM.md** - Technical details
- Supabase edge function logs
- Make.com execution history
- Admin dashboard webhook logs

---

## Quick Test Commands

```bash
# Check migration status
supabase migration list

# View edge function logs
supabase functions logs generate-social-content
supabase functions logs generate-blog-content

# Test webhook with curl
curl -X POST YOUR_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

---

## Success Indicators

You'll know everything is working when:

✓ Webhook shows as configured (green checkmark)
✓ Publishing triggers webhook call
✓ Make.com receives correctly formatted data
✓ Social posts include both short and long versions
✓ Blog publishing generates social content
✓ Automated calls create and publish content
✓ All content appears in database
✓ Webhook logs show successful calls

---

Ready to automate your social media and blog content! 🚀

