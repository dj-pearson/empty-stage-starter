# Scripts Directory

Utility scripts for EatPal project management and operations.

## Available Scripts

### 🔐 Password Management

#### `change-supabase-password.ps1`
**Automates PostgreSQL password changes for self-hosted Supabase instances**

```powershell
.\change-supabase-password.ps1 -ServerAddress root@yourserver.com
```

**Features:**
- Connects via SSH to your server
- Changes password in PostgreSQL database
- Updates all environment variables automatically
- Updates connection strings (DATABASE_URL, etc.)
- Restarts services in correct order
- Backs up .env files before changes
- Optionally updates your local .env file

**Documentation:** See [PASSWORD_CHANGE_GUIDE.md](./PASSWORD_CHANGE_GUIDE.md)

---

### 💳 Stripe Setup

#### `setup-stripe-products.ps1` / `setup-stripe-products.sh`
**Creates Stripe products and pricing for subscription plans**

```powershell
# PowerShell
.\setup-stripe-products.ps1

# Bash
./setup-stripe-products.sh
```

**Creates:**
- Basic Plan ($9.99/month)
- Pro Plan ($19.99/month)  
- Family Plan ($29.99/month)

**Output:**
- JSON file with Stripe IDs
- SQL file to update Supabase database

---

### 🖼️ Image Optimization

#### `optimize-images.js`
**Optimizes images for web delivery**

```bash
node optimize-images.js
```

**Features:**
- Converts to WebP/AVIF formats
- Generates responsive image sizes
- Compresses images
- Preserves originals

---

### 🖼️ Social Share Image

#### `build/generate-og-image.mjs`
**Builds `public/Cover-og.webp`, the 1200x630 og:image**

```bash
node scripts/build/generate-og-image.mjs
```

Not wired into `npm run build`; the output is committed. Run it when
`public/Cover.webp` changes, and look at the result -- it centre-crops.

---

### 🗺️ Sitemap Generation

There is no sitemap script here. `/sitemap.xml` is generated at request time by the
Supabase edge function `supabase/functions/generate-sitemap/`, proxied by the
Cloudflare Pages function `functions/sitemap.xml.ts`, which falls back to a static
list of the marketing routes if that call fails.

A second generator, `scripts/generate-sitemap.js`, used to sit here. It could never
have run: it declared TypeScript interfaces inside a `.js` file, so node threw a
SyntaxError before reaching any of it. Nothing referenced it, and had it worked it
would have written `/recipes/<id>` URLs for a route that only exists behind auth,
plus a `sitemap-index.xml` pointing at a `sitemap-dynamic.xml` nothing serves.

---

### 📱 Mobile Assets

#### `setup-mobile-assets.cjs`
**Sets up mobile app assets (icons, splash screens)**

```bash
node setup-mobile-assets.cjs
```

**Generates:**
- iOS app icons
- Android app icons
- Splash screens
- PWA icons

---

### 📜 Push Certificate Management

#### `manage-push-certs.sh`
**Manages iOS push notification certificates**

```bash
./manage-push-certs.sh
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Change database password | `.\change-supabase-password.ps1` |
| Setup Stripe products | `.\setup-stripe-products.ps1` |
| Optimize images | `node optimize-images.js` |
| Setup mobile assets | `node setup-mobile-assets.cjs` |

## Requirements

### All Scripts
- Node.js 18+ (for JavaScript scripts)
- PowerShell 5.1+ or 7+ (for PowerShell scripts)
- Bash (for shell scripts)

### Password Change Script
- SSH access to server
- Docker and docker-compose on server
- Supabase instance running

### Stripe Scripts
- Stripe CLI installed
- Stripe account with API keys
- Environment variables configured

## Environment Variables

Scripts may require these environment variables:

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...

# For password change script (on server)
POSTGRES_PASSWORD=your_password
DATABASE_URL=postgresql://user:pass@host:port/db
```

## File Outputs

Scripts generate various files:

```
scripts/
├── stripe-ids-*.json          # Stripe product IDs
├── update-stripe-ids-*.sql    # SQL to update database
├── .env.backup.*              # Environment backups
└── PASSWORD_CHANGE_GUIDE.md   # Password change documentation
```

## Security Notes

⚠️ **Important Security Practices:**

1. **Never commit real credentials** to git
2. **Use environment variables** for secrets
3. **Backup before changes** (scripts do this automatically)
4. **Test in staging** before running in production
5. **Use strong passwords** (16+ characters)
6. **Rotate passwords regularly** (quarterly recommended)

## Troubleshooting

### PowerShell Execution Policy

If you get "cannot be loaded because running scripts is disabled":

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### SSH Key Issues

If SSH connection fails:

```powershell
# Test SSH manually
ssh root@yourserver.com

# If password needed, you'll be prompted
# Consider setting up SSH keys for easier access
```

### Node Script Errors

If Node scripts fail:

```bash
# Install dependencies in project root
cd ..
npm install

# Then run script
cd scripts
node script-name.js
```

## Getting Help

- **Password Changes**: See [PASSWORD_CHANGE_GUIDE.md](./PASSWORD_CHANGE_GUIDE.md)
- **Project Issues**: Check main [README.md](../README.md)
- **Development Guide**: See [CLAUDE.md](../CLAUDE.md)

---

**Last Updated**: 2026-01-14
