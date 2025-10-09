# Blog Post Dynamic SEO & Social Media Preview Setup

## Overview

Your blog posts now have **dynamic social media previews** that automatically use:
1. **Featured Image** (if set) - Custom image for that specific blog post
2. **Cover.png** (fallback) - Default site image if no featured image is set

This ensures every blog post shared on social media has an optimized, engaging preview image.

---

## How It Works

### CloudFlare Pages Edge Function
When someone accesses a blog post URL (e.g., `https://tryeatpal.com/blog/picky-eater-tips`), the CloudFlare edge function:

1. **Intercepts the request** before serving the HTML
2. **Fetches the blog post data** from Supabase by slug
3. **Dynamically injects** Open Graph and Twitter Card meta tags
4. **Uses featured_image** if available, otherwise falls back to **Cover.png**
5. **Returns modified HTML** with proper social media tags

### Database Schema
```sql
blog_posts table:
- id
- title
- slug
- excerpt
- content
- meta_title
- meta_description
- featured_image (NEW) ← URL to custom image
- status
- published_at
- created_at
```

---

## Setup Instructions

### 1. Run Database Migration
```bash
# Run the migration to add featured_image column
supabase db push
```

Or manually run in Supabase SQL Editor:
```sql
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured_image TEXT;
```

### 2. Configure CloudFlare Environment Variables

In your CloudFlare Pages dashboard:
1. Go to **Settings** → **Environment Variables**
2. Add these variables:
   - `SUPABASE_URL`: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key

### 3. Deploy to CloudFlare Pages

The edge function in `functions/_middleware.ts` will automatically activate on deployment.

```bash
npm run build
# Then deploy via CloudFlare Pages dashboard or CLI
wrangler pages deploy dist
```

---

## Using Featured Images in Blog Posts

### In the Blog CMS (Admin Panel)

1. Go to **Admin** → **Blog CMS**
2. Click **Edit** on any blog post
3. Fill in the **Featured Image URL** field with:
   - Relative path: `/blog-images/my-post-image.png`
   - Full URL: `https://tryeatpal.com/blog-images/my-post-image.png`
   - External URL: `https://cdn.example.com/image.jpg`
4. **Leave blank** to use `Cover.png` as the default

### Image Best Practices

**Optimal Dimensions:** 1200x630px
**File Size:** Under 1MB for fast loading
**Format:** PNG or JPG
**Content:** Include branding, title, and engaging visuals

### Where to Store Blog Images

**Option 1: Public Folder** (Simple)
```
public/
  blog-images/
    post-1.png
    post-2.png
```
Use in CMS: `/blog-images/post-1.png`

**Option 2: Supabase Storage** (Recommended for scale)
```typescript
// Upload to Supabase Storage bucket 'blog-images'
const { data, error } = await supabase.storage
  .from('blog-images')
  .upload('post-1.png', file);

// Get public URL
const url = supabase.storage
  .from('blog-images')
  .getPublicUrl('post-1.png').data.publicUrl;
```
Use in CMS: Full Supabase storage URL

**Option 3: CDN** (Best for performance)
- Upload to CloudFlare Images, Imgix, or Cloudinary
- Use the CDN URL in the CMS

---

## What Gets Generated for Each Blog Post

When a blog post URL like `/blog/5-tips-for-picky-eaters` is accessed:

```html
<!-- Dynamic Meta Tags Injected -->
<title>5 Tips for Picky Eaters | EatPal Blog</title>
<meta name="description" content="[post excerpt]" />

<!-- Open Graph for Facebook, LinkedIn, WhatsApp -->
<meta property="og:type" content="article" />
<meta property="og:title" content="5 Tips for Picky Eaters" />
<meta property="og:description" content="[post excerpt]" />
<meta property="og:image" content="https://tryeatpal.com/blog-images/post-1.png" />
<!-- OR if no featured_image -->
<meta property="og:image" content="https://tryeatpal.com/Cover.png" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="[featured_image or Cover.png]" />

<!-- Article Structured Data -->
<script type="application/ld+json">
{
  "@type": "BlogPosting",
  "headline": "5 Tips for Picky Eaters",
  "image": "[featured_image or Cover.png]",
  "datePublished": "2025-01-09T12:00:00Z",
  ...
}
</script>
```

---

## Testing Social Media Previews

After deploying with a featured image:

### Facebook/LinkedIn
1. Go to: https://developers.facebook.com/tools/debug/
2. Enter: `https://tryeatpal.com/blog/your-post-slug`
3. Click "Scrape Again" to refresh cache
4. Verify the featured image shows up

### Twitter/X
1. Go to: https://cards-dev.twitter.com/validator
2. Enter: `https://tryeatpal.com/blog/your-post-slug`
3. Preview the card

### Test Locally
Since the edge function only runs on CloudFlare, you can't test locally. But you can:
1. Deploy to CloudFlare Pages preview branch
2. Test with social media validators
3. Check HTML source to verify meta tags are injected

---

## Fallback Strategy

The system uses a smart fallback:

```
1. Check if post has featured_image
   ├─ Yes → Use featured_image URL
   └─ No  → Use Cover.png

2. If blog post not found
   └─ Serve original HTML with default Cover.png

3. If Supabase is down
   └─ Serve original HTML with default Cover.png
```

This ensures social media previews **always work**, even if something fails.

---

## SEO Benefits

✅ **Unique images per blog post** - Better engagement on social media
✅ **Proper article schema** - Google rich results eligibility
✅ **Dynamic meta descriptions** - Tailored for each post
✅ **Canonical URLs** - Prevents duplicate content issues
✅ **Article published dates** - Freshness signals for search engines
✅ **Automatic fallback** - Never show broken images

---

## Troubleshooting

### Social media showing old image
- **Facebook:** Use [Sharing Debugger](https://developers.facebook.com/tools/debug/) and click "Scrape Again"
- **Twitter:** Clear cache (can take up to 7 days)
- **LinkedIn:** Use [Post Inspector](https://www.linkedin.com/post-inspector/)

### Featured image not loading
1. Check the URL is publicly accessible
2. Verify CORS headers allow external access
3. Ensure image dimensions are at least 200x200px
4. Check CloudFlare environment variables are set

### Edge function not running
1. Verify `functions/_middleware.ts` exists in deployment
2. Check CloudFlare Pages build logs
3. Ensure environment variables are set in CloudFlare dashboard
4. Test with: `curl -I https://tryeatpal.com/blog/test-slug`

---

## Future Enhancements

Consider adding:
1. **Image upload UI** in Blog CMS (drag & drop)
2. **Auto-resize images** to 1200x630px
3. **Image preview** before publishing
4. **Multiple image sizes** for different social platforms
5. **AI-generated featured images** based on blog content

---

## Files Modified

1. `functions/_middleware.ts` - CloudFlare edge function for dynamic meta injection
2. `supabase/migrations/20250109000000_add_featured_image_to_blog.sql` - Database schema
3. `src/components/admin/BlogCMSManager.tsx` - Added featured_image field to UI
4. `index.html` - Default meta tags use Cover.png

---

## Summary

Your blog is now SEO-optimized with:
- ✅ Dynamic social media previews per post
- ✅ Featured image OR Cover.png fallback
- ✅ Proper article structured data
- ✅ CloudFlare edge function for fast meta tag injection
- ✅ Easy-to-use CMS interface

Every blog post you publish will have professional, engaging social media previews that drive clicks and traffic!
