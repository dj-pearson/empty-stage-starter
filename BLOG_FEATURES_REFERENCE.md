# Blog System Feature Reference Guide

Complete guide to all features, functions, and capabilities of the advanced blog system.

---

## Table of Contents

1. [Core Features](#core-features)
2. [Admin Interface](#admin-interface)
3. [Content Generation](#content-generation)
4. [SEO & Analytics](#seo--analytics)
5. [Engagement Features](#engagement-features)
6. [Monetization](#monetization)
7. [API Reference](#api-reference)
8. [Database Functions](#database-functions)

---

## Core Features

### Blog Posts Management

**Location:** Admin Panel → Blog CMS

#### Create/Edit Posts

**Manual Creation:**
```
1. Click "Create New Post"
2. Enter title, content (Markdown or HTML)
3. Set excerpt, category, tags
4. Upload featured image
5. Configure SEO (meta title, description)
6. Set status: draft, published, scheduled
7. Save
```

**AI Generation:**
```
1. Click "AI Generate Article"
2. Choose title bank (auto-select) or custom topic
3. Add keywords (optional)
4. System generates:
   - Unique title (if using title bank)
   - SEO-optimized content
   - Meta description
   - Excerpt
   - Suggested tags
5. Review and edit as needed
6. Publish or save as draft
```

#### Post Statuses

- **draft**: Not visible to public, editable
- **published**: Live on site, indexed by search engines
- **scheduled**: Will publish automatically at specified time

### Title Bank System

**Purpose:** Ensure systematic coverage of all planned topics without duplication.

**How It Works:**
1. Store 50-100+ pre-planned blog titles
2. Track usage of each title
3. Auto-rotate to unused/least-used titles
4. Prevent duplicate content

**Usage:**
```
Admin Panel → Title Bank Button

Tabs:
- Overview: See stats (total, unused, most used)
- Suggestions: Get 10 recommended titles to write next
- Import: Import titles from Blog_Titles.md
```

**API Call:**
```typescript
// Get next title from bank
const { data } = await supabase.rpc('get_next_blog_title');
// Returns: { title: "...", times_used: 0 }

// Get suggestions
const { data } = await supabase.rpc('get_diverse_title_suggestions', { count: 10 });
```

### Categories & Tags

**Categories:** Broad topics (Meal Planning, Nutrition, etc.)
- Each post has ONE category
- Used for main navigation
- Affects breadcrumb structure

**Tags:** Specific topics (gluten-free, quick-meals, etc.)
- Each post can have MULTIPLE tags
- Used for filtering and related posts
- Helps with internal linking

**Managing:**
```
1. Admin Panel → Blog CMS
2. View existing categories/tags in sidebar
3. Click to filter posts by category/tag
4. Add new via database or admin UI
```

---

## Admin Interface

### Dashboard

**Location:** Admin Panel → Blog CMS

**Sections:**

1. **Statistics Card**
   - Total posts
   - Published posts
   - Total views
   - Total comments

2. **Posts List**
   - Sortable columns
   - Status badges
   - Quick actions (Edit, Generate Social, Delete)

3. **Filters**
   - By status
   - By category
   - Search by title

4. **Bulk Operations** (Coming soon)
   - Publish multiple
   - Change category
   - Delete selected

### Content Calendar

**Location:** Admin Panel → Content Calendar (if implemented)

**Features:**
- Drag-and-drop scheduling
- Visual timeline view
- Assign posts to team members
- Track content pipeline (planned → in progress → review → published)
- Set priority levels
- Target keywords planning

**Usage:**
```sql
-- Add to calendar
INSERT INTO blog_content_calendar (
  planned_publish_date,
  title_suggestion,
  priority,
  target_keywords
) VALUES (
  '2025-02-15',
  'Top 10 Picky Eater Tips',
  1,
  ARRAY['picky eaters', 'meal planning']
);
```

### Analytics Dashboard

**Location:** Admin Panel → Analytics

**Metrics Available:**

**Post Performance:**
- Pageviews (total, unique)
- Average time on page
- Bounce rate
- Scroll depth
- CTA clicks
- Conversions

**Traffic Sources:**
- Organic (search)
- Direct
- Social
- Referral

**SEO Rankings:**
- Target keywords
- Current positions
- Position changes (7d, 30d)
- Search volume
- Competition level

**Core Web Vitals:**
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)

**Query Example:**
```sql
-- Get post analytics for last 30 days
SELECT
  bp.title,
  SUM(ba.pageviews) as total_views,
  AVG(ba.avg_time_on_page) as avg_time,
  SUM(ba.conversions) as conversions
FROM blog_posts bp
JOIN blog_analytics ba ON bp.id = ba.post_id
WHERE ba.date > CURRENT_DATE - INTERVAL '30 days'
GROUP BY bp.id
ORDER BY total_views DESC;
```

---

## Content Generation

### AI-Powered Generation

**Supported Models:**
- OpenAI (GPT-4, GPT-4o, GPT-4o-mini)
- Anthropic Claude
- Azure OpenAI
- Any OpenAI-compatible API

**Configuration:**
```
Admin Panel → AI Settings
- Select model
- Set temperature (creativity)
- Set max tokens
- Configure API endpoint
```

**Generation Process:**

1. **Title Selection**
   - From title bank (auto-rotate)
   - OR custom topic

2. **Uniqueness Check**
   - Compare against existing titles (85% similarity threshold)
   - Check content hash for duplicates
   - Reject if too similar (95%+)

3. **Content Generation**
   - AI generates based on:
     - Selected tone (conversational, professional, empathetic, direct, storytelling)
     - Perspective (evidence-based, parent stories, expert advice, step-by-step, myth-busting, problem-solving)
     - Target keywords
     - Recent generation history (avoid repetition)

4. **Output**
   - Title
   - Full content (1000-2000 words)
   - Meta description
   - Excerpt
   - Suggested tags

**Advanced Options:**

```typescript
// Custom generation with specific parameters
const response = await supabase.functions.invoke('generate-blog-content', {
  body: {
    topic: "Custom Topic Here",
    keywords: "keyword1, keyword2",
    targetAudience: "Parents of toddlers with ARFID",
    useTitleBank: false, // Use custom topic instead
    autoPublish: false,
    webhookUrl: "https://your-automation.com/webhook"
  }
});
```

### Content Repurposing

**Turn one blog post into 8+ content pieces**

**Supported Platforms:**
- Twitter/X Thread
- Instagram Carousel
- LinkedIn Article
- YouTube Description
- Newsletter
- Email Sequence (5 emails)
- TikTok Script
- Pinterest Description

**Usage:**

```typescript
// Via Admin UI
1. Edit post → "Repurpose" button
2. Select platforms
3. Generate
4. Review and publish

// Via API
const response = await supabase.functions.invoke('repurpose-content', {
  body: {
    post_id: 'uuid-here',
    platforms: ['twitter_thread', 'instagram_carousel'],
    save_to_db: true
  }
});

// Returns platform-optimized content
```

**Output Examples:**

**Twitter Thread:**
```
TWEET 1: 🧵 Struggling with picky eaters? Here are 5 game-changing strategies...
TWEET 2: Strategy #1: The "Try Bite" Method
Let your child take just ONE tiny bite...
[continues for 8-10 tweets]
```

**Instagram Carousel:**
```
SLIDE 1: [Eye-catching hook]
5 Picky Eater Strategies That Actually Work

SLIDE 2: Strategy #1 - The Try Bite Method
[Visual-friendly text]

[continues for 10 slides]
```

---

## SEO & Analytics

### Automatic SEO Optimization

**Schema Markup Generation**

Automatically creates:
- Article schema (BlogPosting)
- Breadcrumb schema
- FAQ schema (if detected in content)
- HowTo schema (for step-by-step guides)
- Organization schema

**Usage:**
```typescript
// Generate for a post
const response = await supabase.functions.invoke('generate-schema-markup', {
  body: {
    post_id: 'uuid',
    site_url: 'https://yourdomain.com'
  }
});

// Returns JSON-LD for:
response.schemas.article
response.schemas.breadcrumb
response.schemas.faq  // if applicable
response.schemas.howTo  // if applicable
```

**Auto-includes in post pages** - No manual work needed.

### Content Quality Scoring

**Analyzes your posts for:**

1. **SEO Score (0-100)**
   - Title length optimal?
   - Meta description present and optimal?
   - Proper heading structure (H1, H2, H3)?
   - Images with alt text?
   - Internal links (2-5 recommended)?
   - External links to authority sites?
   - Keyword density optimal?

2. **Readability Score (0-100)**
   - Flesch Reading Ease
   - Average sentence length
   - Word count (1000-2000 optimal)
   - Paragraph length

3. **Engagement Score (0-100)**
   - Has bullet points/lists?
   - Has images?
   - Has clear CTAs?
   - Proper formatting?

4. **Overall Score**
   - Weighted average of all scores
   - Issues identified
   - Specific suggestions

**Usage:**
```
Admin Panel → Edit Post → "Analyze Quality" button

Returns:
- Overall score (e.g., 87/100)
- Issues found (e.g., "Title too short", "Missing alt text")
- Suggestions (e.g., "Add 2-3 internal links")
```

**API:**
```typescript
const response = await supabase.functions.invoke('analyze-blog-quality', {
  body: {
    post_id: 'uuid',
    target_keyword: 'picky eaters'  // optional
  }
});

// Returns detailed analysis
console.log(response.analysis.seo_score);  // 85
console.log(response.analysis.suggestions);  // Array of improvements
```

### SEO Ranking Tracking

**Track positions for target keywords**

```sql
-- Add keyword to track
INSERT INTO blog_target_keywords (
  post_id,
  keyword,
  keyword_type,  -- primary, secondary, LSI
  search_volume,
  competition_score
) VALUES (
  'post-uuid',
  'picky eater tips',
  'primary',
  1200,
  0.65
);

-- Record rankings (integrate with SEO tool)
INSERT INTO blog_seo_rankings (
  post_id,
  keyword,
  position,
  tracked_date
) VALUES (
  'post-uuid',
  'picky eater tips',
  15,
  CURRENT_DATE
);

-- View ranking progress
SELECT
  keyword,
  position,
  change_7d,
  change_30d,
  featured_snippet
FROM blog_seo_rankings
WHERE post_id = 'uuid'
ORDER BY tracked_date DESC;
```

### Backlink Monitoring

**Track who's linking to your posts**

```sql
-- Add backlink
INSERT INTO blog_backlinks (
  post_id,
  source_url,
  source_domain,
  anchor_text,
  domain_authority,
  link_type
) VALUES (
  'post-uuid',
  'https://example.com/article',
  'example.com',
  'picky eater strategies',
  45,
  'dofollow'
);

-- View backlinks
SELECT * FROM blog_backlinks
WHERE post_id = 'uuid' AND is_active = true
ORDER BY domain_authority DESC;
```

### Content Gap Analysis

**Find opportunities**

```sql
-- Add opportunity
INSERT INTO blog_content_gaps (
  keyword,
  search_volume,
  keyword_difficulty,
  competitor_urls,
  priority
) VALUES (
  'ARFID treatment for toddlers',
  800,
  45,
  ARRAY['https://competitor1.com/article', 'https://competitor2.com/post'],
  'high'
);

-- View opportunities
SELECT * FROM blog_content_gaps
WHERE status = 'identified'
ORDER BY opportunity_score DESC;
```

---

## Engagement Features

### Reading Progress Indicator

**Auto-enabled on all blog posts**

**Features:**
- Visual progress bar at top
- Tracks scroll percentage
- Logs engagement milestones (25%, 50%, 75%, 100%)
- Stores in analytics

**Customization:**
```typescript
// In BlogPost.tsx
<ReadingProgress
  postId={post.id}
  onProgressChange={(percentage) => {
    // Custom logic
    console.log(`User read ${percentage}%`);
  }}
/>
```

### Table of Contents

**Auto-generated from H2 and H3 headings**

**Features:**
- Sticky sidebar
- Smooth scroll navigation
- Highlights current section
- Automatically extracts headings

**Usage:**
```typescript
<TableOfContents content={post.content} />
```

### Social Sharing

**Share buttons with tracking**

**Platforms:**
- Twitter/X
- Facebook
- LinkedIn
- Pinterest
- Copy link

**Features:**
- Tracks share clicks
- Shows share count
- Optimized share text for each platform

**Customization:**
```typescript
<ShareButtons
  url={postUrl}
  title={post.title}
  description={post.excerpt}
/>
```

### Comments System

**Threaded comments with voting**

**Features:**
- Parent/child comments (threading)
- Upvote/downvote
- Spam detection (when integrated)
- Moderation (pending/approved/spam)
- User authentication
- Email notifications

**Admin Moderation:**
```sql
-- Approve comment
UPDATE blog_comments
SET status = 'approved'
WHERE id = 'comment-uuid';

-- Mark as spam
UPDATE blog_comments
SET status = 'spam'
WHERE id = 'comment-uuid';

-- View pending
SELECT * FROM blog_comments
WHERE status = 'pending'
ORDER BY created_at DESC;
```

### Personalized Recommendations

**Show readers more relevant content**

**Based on:**
- Reading history
- Topics engaged with
- Time spent on similar posts

**Usage:**
```typescript
// Get recommendations for logged-in user
const { data } = await supabase.rpc('get_personalized_recommendations', {
  for_user_id: userId,
  limit_count: 5
});

// Returns:
// - post_id
// - post_title
// - post_slug
// - relevance_score
// - reason ("Based on your reading history")
```

### Internal Linking Intelligence

**Automatically suggest related posts for linking**

```typescript
// Get suggestions for a post
const { data } = await supabase.rpc('suggest_internal_links', {
  for_post_id: 'uuid',
  limit_count: 5
});

// Returns posts with:
// - relevance_score (based on keyword overlap)
// - suggested_anchor (ideal link text)

// Admin UI shows these when editing
```

---

## Monetization

### Lead Magnets

**Offer downloadable resources to capture emails**

**Types:**
- Checklist
- eBook
- Template
- Tool/Calculator
- Quiz
- Guide

**Setup:**
```sql
-- Create lead magnet
INSERT INTO blog_lead_magnets (
  post_id,
  magnet_type,
  magnet_title,
  magnet_description,
  file_url,
  is_active
) VALUES (
  'post-uuid',
  'checklist',
  '10-Point Picky Eater Checklist',
  'Free printable checklist to tackle picky eating',
  'https://yoursite.com/downloads/checklist.pdf',
  true
);

-- Track downloads
-- Auto-incremented when user downloads

-- View performance
SELECT
  lm.magnet_title,
  lm.downloads_count,
  COUNT(ec.id) as email_captures,
  (COUNT(ec.id)::float / NULLIF(lm.downloads_count, 0) * 100) as conversion_rate
FROM blog_lead_magnets lm
LEFT JOIN blog_email_captures ec ON ec.lead_magnet_id = lm.id
GROUP BY lm.id;
```

### Email Capture Forms

**Capture emails throughout blog posts**

**Form Types:**
- Inline (mid-content)
- Sidebar
- Exit-intent popup
- Content gate (unlock with email)

**Setup:**
```sql
-- Configure exit-intent popup
INSERT INTO blog_exit_intent_popups (
  title,
  message,
  cta_text,
  offer_text,
  target_posts,  -- null = all posts
  show_delay_seconds,
  is_active
) VALUES (
  'Wait! Before You Go...',
  'Get our free meal planning guide delivered to your inbox!',
  'Send Me The Guide',
  'Free 7-Day Meal Plan for Picky Eaters',
  NULL,
  0,
  true
);

-- Configure content gating
INSERT INTO blog_content_gating (
  post_id,
  gate_after_percentage,  -- Show gate after X% of content
  gate_title,
  gate_message,
  is_active
) VALUES (
  'post-uuid',
  50,
  'Unlock Full Article',
  'Enter your email to read the complete guide and get weekly tips!',
  true
);
```

### A/B Testing

**Test different variations to optimize performance**

**What You Can Test:**
- Titles
- Excerpts
- Featured images
- Intro paragraphs

**Setup:**
```sql
-- Create A/B test
INSERT INTO blog_ab_tests (
  post_id,
  variant_type,
  variant_a,
  variant_b
) VALUES (
  'post-uuid',
  'title',
  '5 Picky Eater Tips That Actually Work',
  'Finally! Picky Eater Strategies Backed by Science'
);

-- System automatically:
-- - Splits traffic 50/50
-- - Tracks views, clicks, conversions
-- - Calculates statistical confidence

-- View results
SELECT
  variant_a,
  variant_b,
  variant_a_views,
  variant_b_views,
  variant_a_conversions,
  variant_b_conversions,
  winner,
  confidence_level
FROM blog_ab_tests
WHERE post_id = 'uuid';
```

### Conversion Tracking

**Track valuable user actions**

**Conversion Types:**
- email_signup
- tool_usage
- premium_upgrade
- purchase

**Auto-tracked via engagement endpoint:**
```typescript
// Track conversion
await fetch(`${supabaseUrl}/functions/v1/track-engagement`, {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({
    post_id: 'uuid',
    event_type: 'conversion_email_signup',
    user_id: userId,
    metadata: {
      value: 0,  // or monetary value
      source: 'exit_intent_popup'
    }
  })
});
```

---

## API Reference

### Edge Functions

#### 1. generate-blog-content

**Purpose:** AI-powered blog post generation

**Endpoint:** `/functions/v1/generate-blog-content`

**Parameters:**
```typescript
{
  topic?: string,  // Custom topic (or leave blank to use title bank)
  keywords?: string,  // Target keywords
  targetAudience?: string,  // Audience description
  useTitleBank?: boolean,  // Default: true
  autoPublish?: boolean,  // Default: false
  webhookUrl?: string  // Automation webhook
}
```

**Returns:**
```typescript
{
  success: true,
  post: {
    id: "uuid",
    title: "...",
    content: "...",
    excerpt: "...",
    meta_description: "...",
    status: "draft"
  }
}
```

#### 2. analyze-blog-quality

**Purpose:** SEO and quality scoring

**Endpoint:** `/functions/v1/analyze-blog-quality`

**Parameters:**
```typescript
{
  post_id: string,
  target_keyword?: string
}
```

**Returns:**
```typescript
{
  success: true,
  analysis: {
    seo_score: 87,
    readability_score: 75,
    engagement_score: 82,
    uniqueness_score: 90,
    comprehensiveness_score: 85,
    overall_score: 84,
    issues: [
      { type: "seo", severity: "medium", message: "..." }
    ],
    suggestions: [
      { category: "SEO", suggestion: "...", impact: "high" }
    ]
  }
}
```

#### 3. track-engagement

**Purpose:** Real-time analytics tracking

**Endpoint:** `/functions/v1/track-engagement`

**Parameters:**
```typescript
{
  post_id: string,
  session_id: string,
  event_type: string,  // scroll_25, cta_clicked, conversion_email_signup, etc.
  user_agent?: string,
  referrer?: string,
  user_id?: string,
  metadata?: object
}
```

**Event Types:**
- `scroll_25`, `scroll_50`, `scroll_75`, `scroll_100`
- `cta_clicked`
- `share_twitter`, `share_facebook`, etc.
- `conversion_email_signup`, `conversion_tool_usage`, etc.

#### 4. generate-schema-markup

**Purpose:** Automatic SEO schema generation

**Endpoint:** `/functions/v1/generate-schema-markup`

**Parameters:**
```typescript
{
  post_id: string,
  site_url?: string  // Default: from config
}
```

**Returns:**
```typescript
{
  success: true,
  schemas: {
    article: { /* ArticleSchema */ },
    breadcrumb: { /* BreadcrumbSchema */ },
    faq: { /* FAQSchema (if detected) */ },
    howTo: { /* HowToSchema (if detected) */ },
    organization: { /* OrganizationSchema */ }
  },
  markup: "<!-- JSON-LD markup ready to embed -->"
}
```

#### 5. repurpose-content

**Purpose:** Multi-platform content generation

**Endpoint:** `/functions/v1/repurpose-content`

**Parameters:**
```typescript
{
  post_id: string,
  platforms: string[],  // ['twitter_thread', 'instagram_carousel', ...]
  save_to_db?: boolean  // Default: true
}
```

**Platforms:**
- `twitter_thread`
- `instagram_carousel`
- `linkedin_article`
- `youtube_description`
- `newsletter`
- `email_sequence`
- `tiktok_script`
- `pinterest_description`

**Returns:**
```typescript
{
  success: true,
  post_title: "...",
  results: {
    twitter_thread: {
      type: "twitter_thread",
      tweets: ["...", "..."],
      total_tweets: 8
    },
    instagram_carousel: {
      type: "instagram_carousel",
      slides: ["...", "..."],
      total_slides: 10
    }
  }
}
```

---

## Database Functions

### Content Functions

```sql
-- Get next title from bank
SELECT * FROM get_next_blog_title();

-- Get title suggestions
SELECT * FROM get_diverse_title_suggestions(10);

-- Check title similarity
SELECT * FROM check_title_similarity('Proposed Title', 0.85);

-- Detect stale content
SELECT * FROM detect_stale_content();

-- Suggest internal links
SELECT * FROM suggest_internal_links('post-uuid', 5);

-- Get personalized recommendations
SELECT * FROM get_personalized_recommendations('user-uuid', 5);
```

### Analytics Functions

```sql
-- Refresh materialized views (run daily via cron)
SELECT refresh_blog_materialized_views();

-- Get blog stats
SELECT * FROM get_blog_stats();

-- Get popular posts (from materialized view)
SELECT * FROM blog_popular_posts LIMIT 10;
```

---

## Best Practices

### Content Creation

1. **Use title bank** for systematic coverage
2. **Generate with AI** then personalize with your voice
3. **Always set featured image** for social sharing
4. **Add internal links** to 2-5 related posts
5. **Target one primary keyword** per post
6. **Aim for 1500-2000 words** for SEO

### SEO Optimization

1. **Run quality analysis** before publishing
2. **Fix all high-severity issues**
3. **Optimize meta description** (150-160 chars)
4. **Add alt text** to all images
5. **Use proper heading hierarchy** (one H1, multiple H2s)
6. **Include schema markup** (auto-generated)

### Analytics

1. **Track engagement milestones** (scroll depth)
2. **Monitor top traffic sources**
3. **Identify best-performing posts**
4. **A/B test headlines** for key posts
5. **Refresh underperforming content** quarterly

### Monetization

1. **Add lead magnets** to high-traffic posts
2. **Test exit-intent popups** (don't overuse)
3. **Gate premium content** strategically
4. **Track conversion funnels**
5. **Optimize CTAs** based on data

---

## Workflow Examples

### Weekly Content Schedule

**Monday:**
- Review analytics from previous week
- Identify top/bottom performers
- Plan 3 new posts for the week

**Tuesday:**
- Generate 2 posts with AI
- Edit and personalize
- Add featured images and internal links

**Wednesday:**
- Publish post #1
- Repurpose for social media
- Schedule social posts

**Thursday:**
- Run quality analysis on upcoming posts
- Fix any issues
- Optimize for target keywords

**Friday:**
- Publish post #2
- Monitor engagement
- Respond to comments

**Weekend:**
- Brainstorm new title ideas
- Add to title bank
- Review competitor content

### Monthly SEO Audit

**Week 1:**
- Run `detect_stale_content()`
- Refresh outdated posts
- Update statistics and data

**Week 2:**
- Review SEO rankings
- Identify opportunities
- Plan content for gaps

**Week 3:**
- Analyze backlink profile
- Reach out for guest posts
- Build internal linking

**Week 4:**
- A/B test analysis
- Declare winners
- Optimize based on learnings

---

## Success Metrics

### Content Health
- Posts published per week: 2-3
- Average quality score: 80+
- Duplicate rate: < 2%
- Content gaps addressed: 5+ per month

### Traffic
- Organic sessions growth: 10-20% MoM
- Average time on page: 3+ minutes
- Bounce rate: < 60%
- Pages per session: 2+

### Engagement
- Comments per post: 3-5
- Social shares per post: 10+
- Newsletter signups: 50+ per month
- Lead magnet downloads: 100+ per month

### SEO
- Top 10 rankings: 10+ keywords
- Top 3 rankings: 3+ keywords
- Average position improvement: 5+ positions per quarter
- Featured snippets: 2+

---

This reference guide covers the major features. For specific technical implementation details, see the Replication Guide.
