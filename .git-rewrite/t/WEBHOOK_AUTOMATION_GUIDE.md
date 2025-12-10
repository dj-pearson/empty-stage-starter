# Webhook Automation Guide

## Overview

This guide explains how to fully automate social media posting and blog publishing using Make.com (or Zapier) webhooks with EatPal's admin dashboard.

---

## Social Media Automation

### Setup in Admin Dashboard

1. Navigate to **Admin Dashboard** > **Social Media** > **Connected Accounts** tab
2. Click "Add Webhook"
3. Paste your Make.com webhook URL
4. Save the webhook configuration

### Publishing Workflow

#### Manual Publishing
1. Generate AI content or create a post manually
2. Save as draft
3. Click "Publish" - this sends all data to your webhook

#### Webhook Payload (Social Media)

When you publish a social post, the webhook receives:

```json
{
  "type": "social_post_published",
  "post_id": "uuid",
  "title": "Post title",
  "short_form": "Twitter version (under 280 chars)",
  "long_form": "Facebook/LinkedIn version",
  "url": "https://tryeatpal.com",
  "hashtags": ["EatPal", "ParentingTips"],
  "images": ["url1", "url2"],
  "platforms": ["facebook", "twitter", "linkedin"],
  "published_at": "2025-10-09T16:00:00Z"
}
```

### Full Automation with Make.com

#### Scenario 1: Scheduled Social Posts

**Modules:**
1. **Schedule** - Set to run at specific times (e.g., daily at 9 AM)
2. **HTTP Request** - Call edge function:
   ```
   POST https://your-project.supabase.co/functions/v1/generate-social-content
   Headers:
   - Authorization: Bearer YOUR_ANON_KEY
   - Content-Type: application/json
   
   Body:
   {
     "topic": "5 tips for picky eaters",
     "contentGoal": "Drive website visits",
     "autoPublish": true,
     "webhookUrl": "YOUR_MAKE_WEBHOOK_URL"
   }
   ```
3. **Webhook Response** - Catches the published post data
4. **Router** - Route to different platforms:
   - **Facebook Module**: Use `long_form` content
   - **Twitter Module**: Use `short_form` content
   - **LinkedIn Module**: Use `long_form` content

---

## Blog Automation

### Setup in Admin Dashboard

1. Navigate to **Admin Dashboard** > **Blog** tab
2. Click the "Webhook" button (next to "AI Generate Article")
3. Paste your Make.com webhook URL
4. Save the webhook configuration

### Publishing Workflow

#### Manual Publishing
1. Generate AI blog article
2. Edit if needed
3. Click "Publish" - this automatically:
   - Publishes the blog
   - Generates social media posts about the blog
   - Sends everything to your webhook

#### Webhook Payload (Blog)

When you publish a blog post, the webhook receives:

```json
{
  "type": "blog_published",
  "blog_id": "uuid",
  "blog_title": "10 Creative Ways to Get Toddlers to Eat Vegetables",
  "blog_url": "https://tryeatpal.com/blog/creative-ways-toddlers-eat-vegetables",
  "blog_excerpt": "Brief summary of the article...",
  "short_form": "Twitter version with link and hashtags",
  "long_form": "Facebook version with link and hashtags",
  "hashtags": ["EatPal", "PickyEaters", "ParentingTips"],
  "published_at": "2025-10-09T16:00:00Z"
}
```

### Full Automation with Make.com

#### Scenario 2: Automated Blog Publishing

**Modules:**
1. **Schedule** - Set to run weekly (e.g., Mondays at 10 AM)
2. **HTTP Request** - Call edge function:
   ```
   POST https://your-project.supabase.co/functions/v1/generate-blog-content
   Headers:
   - Authorization: Bearer YOUR_ANON_KEY
   - Content-Type: application/json
   
   Body:
   {
     "topic": "How to introduce new foods to toddlers",
     "keywords": "picky eaters, toddler nutrition, food introduction",
     "autoPublish": true,
     "webhookUrl": "YOUR_MAKE_WEBHOOK_URL"
   }
   ```
3. **Webhook Response** - Catches the blog and social data
4. **Router** - Route to platforms:
   - **Facebook Module**: Post `long_form` with `blog_url`
   - **Twitter Module**: Post `short_form` with `blog_url`
   - **LinkedIn Module**: Post `long_form` with `blog_url`

---

## Make.com Setup Examples

### Example 1: Simple Social Media Router

```
[Webhook Trigger]
    ↓
[Router]
    ├─→ [Facebook Pages] → Post "{{long_form}}" + "{{url}}"
    ├─→ [Twitter] → Post "{{short_form}}" + "{{url}}"
    └─→ [LinkedIn] → Post "{{long_form}}" + "{{url}}"
```

### Example 2: Advanced with Image Support

```
[Webhook Trigger]
    ↓
[Router]
    ├─→ [Facebook Pages]
    │      ├─ Download Images from {{images}}
    │      └─ Post with Images + "{{long_form}}"
    │
    ├─→ [Twitter]
    │      ├─ Download Images from {{images}}
    │      └─ Post with Images + "{{short_form}}"
    │
    └─→ [LinkedIn]
           └─ Post "{{long_form}}" + "{{url}}"
```

### Example 3: Full Blog + Social Automation

```
[Schedule: Monday 10 AM]
    ↓
[HTTP: Generate Blog]
    ↓
[Webhook Trigger: Blog Published]
    ↓
[Router]
    ├─→ [Facebook] → Post blog announcement
    ├─→ [Twitter] → Post blog announcement
    ├─→ [LinkedIn] → Post blog announcement
    └─→ [Pinterest] → Create Pin with {{blog_url}}
```

---

## API Endpoints

### Generate Social Content

```
POST /functions/v1/generate-social-content
```

**Parameters:**
- `topic` (required): The topic for the social post
- `contentGoal`: Marketing goal (default: "Drive website visits")
- `targetAudience`: Target audience (default: "Parents of picky eaters")
- `url`: URL to include in posts (default: "https://tryeatpal.com")
- `autoPublish`: Boolean - if true, creates and publishes post automatically
- `webhookUrl`: URL to send published post data

**Response:**
```json
{
  "success": true,
  "content": {
    "title": "Post title",
    "twitter": "Short form content...",
    "facebook": "Long form content..."
  },
  "autoPublished": true
}
```

### Generate Blog Content

```
POST /functions/v1/generate-blog-content
```

**Parameters:**
- `topic` (required): The topic for the blog article
- `keywords`: SEO keywords (comma-separated)
- `targetAudience`: Target audience (default: "Parents of picky eaters")
- `autoPublish`: Boolean - if true, publishes blog and sends to webhook
- `webhookUrl`: URL to send published blog data

**Response:**
```json
{
  "success": true,
  "content": {
    "title": "Article title",
    "seo_title": "SEO optimized title",
    "seo_description": "Meta description",
    "excerpt": "Brief summary",
    "body": "Full article content...",
    "faq": [...]
  },
  "autoPublished": true
}
```

---

## Best Practices

### 1. Test Before Full Automation
- Test webhooks manually first
- Verify content appears correctly on each platform
- Check hashtag formatting and links

### 2. Content Scheduling
- **Social Posts**: 2-3 times per week
- **Blog Posts**: 1 time per week
- Vary posting times for optimal engagement

### 3. Content Quality
- Always review AI-generated content before publishing
- Customize hashtags for your audience
- Add relevant images when possible

### 4. Platform-Specific Tips
- **Twitter**: Keep under 280 chars, use 2-3 hashtags
- **Facebook**: Longer posts (150-250 words), use 3-5 hashtags
- **LinkedIn**: Professional tone, focus on value, 1-3 hashtags

### 5. Webhook Security
- Use HTTPS webhooks only
- Don't share webhook URLs publicly
- Rotate webhook URLs periodically

---

## Troubleshooting

### Webhook Not Receiving Data
1. Check webhook URL is correct in settings
2. Verify webhook is active in Make.com
3. Check webhook logs in Make.com for errors
4. Test with a manual post first

### Content Not Posting to Social Media
1. Verify social media account permissions
2. Check character limits (especially Twitter)
3. Review Make.com execution logs
4. Ensure images URLs are publicly accessible

### AI Content Generation Fails
1. Check AI model is configured in Admin > AI Settings
2. Verify API keys are set in environment variables
3. Review edge function logs in Supabase dashboard
4. Check rate limits on AI provider

---

## Example Make.com Scenarios

### Scenario: Daily Social Media Automation

**Schedule**: Every day at 9 AM EST

**Flow:**
1. HTTP Request to generate social content
2. Wait for webhook response
3. Post to Facebook (use long_form)
4. Wait 15 minutes
5. Post to Twitter (use short_form)
6. Wait 30 minutes
7. Post to LinkedIn (use long_form)

### Scenario: Weekly Blog with Social Promotion

**Schedule**: Every Monday at 10 AM EST

**Flow:**
1. HTTP Request to generate blog
2. Wait for webhook response
3. Post to Facebook announcing blog
4. Post to Twitter announcing blog
5. Post to LinkedIn announcing blog
6. Send email to subscribers with blog link
7. Create Pinterest pin with blog URL

---

## Support

For questions or issues:
1. Check Supabase edge function logs
2. Review Make.com execution history
3. Check webhook logs in Admin Dashboard
4. Test with manual publishing first

---

## Updates

- **2025-10-09**: Initial setup with webhook automation
- Content types: social_post_published, blog_published
- Auto-publish support in edge functions

