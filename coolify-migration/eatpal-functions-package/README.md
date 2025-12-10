# EatPal Edge Functions Deployment Package

## Contents

- **73 Edge Functions** - All your Supabase Edge Functions
- **_shared/** - Shared utilities and headers
- **deploy.sh** - Deployment script for Coolify server

## Deployment Instructions

### Method 1: Via SCP + SSH (Recommended)

1. **Upload package to Coolify server:**

```bash
scp -r eatpal-functions-package root@<your-server-ip>:/tmp/
```

2. **SSH into server and deploy:**

```bash
ssh root@<your-server-ip>
cd /tmp/eatpal-functions-package
chmod +x deploy.sh
./deploy.sh
```

### Method 2: Via Coolify UI

1. **Zip the package:**
   - Right-click `eatpal-functions-package` folder
   - Select "Send to" â†’ "Compressed (zipped) folder"

2. **Upload via Coolify:**
   - Go to Coolify Dashboard
   - Services â†’ EatPal â†’ Files
   - Navigate to: `/data/coolify/services/ig8ow4o4okkogowggkog4cww/volumes/functions/`
   - Upload and extract all function folders

3. **Restart edge functions container:**
   - In Coolify: Services â†’ EatPal â†’ supabase-edge-functions
   - Click "Restart"

### Method 3: Manual Copy

If you have direct access to the server:

```bash
cp -r /tmp/eatpal-functions-package/* /data/coolify/services/ig8ow4o4okkogowggkog4cww/volumes/functions/
docker restart supabase-edge-functions-ig8ow4o4okkogowggkog4cww
```

## Function List (73 total)

### AI & Content (12)
- ai-meal-plan, generate-blog-content, generate-social-content, etc.

### SEO & Analytics (21)
- seo-audit, analyze-blog-posts-seo, check-core-web-vitals, etc.

### Payments (5)
- create-checkout, stripe-webhook, manage-subscription, etc.

### Food & Nutrition (10)
- lookup-barcode, identify-food-image, parse-recipe, etc.

### Full list in DEPLOYMENT_PLAN.md

## Testing

After deployment:

```bash
# Test a function
curl https://functions.tryeatpal.com/ai-meal-plan \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

## Troubleshooting

- **Functions not responding**: Restart the container
- **401 errors**: Check SUPABASE_ANON_KEY in environment
- **500 errors**: Check container logs in Coolify

For more help, see: DATABASE_FIX_OPTIONS.md
