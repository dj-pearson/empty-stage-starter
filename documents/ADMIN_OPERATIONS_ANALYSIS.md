# Comprehensive Admin Operations Landscape Analysis

## 1. APPLICATION TYPE

This is a **full-stack healthcare/wellness application** for child meal planning and nutrition management with extensive enterprise-grade admin capabilities.

**Technology Stack:**
- **Frontend**: React 19 + TypeScript + Vite + Expo (React Native)
- **Backend**: Supabase (PostgreSQL) + Deno-based Edge Functions
- **Authentication**: Supabase Auth
- **Payment Processing**: Stripe
- **Error Monitoring**: Sentry
- **Email**: Resend/SendGrid/AWS SES
- **Deployment**: Cloudflare Pages, EAS Build (Expo)

---

## 2. ADMIN-RELATED FEATURES & TOOLS

### Core Admin Features (15 Main Modules)

1. **User Management** (`UserManagementDashboard.tsx`)
   - View all platform users with full profiles
   - Search, filter, and sort users
   - User banning/suspension capabilities
   - Onboarding status tracking
   - User engagement scoring

2. **Subscription Management** (`SubscriptionManagement.tsx`)
   - View active subscriptions and billing
   - Stripe integration
   - Subscription status management
   - Invoice tracking
   - Payment failure handling

3. **Complementary Subscriptions** (`ComplementarySubscriptionManager.tsx`)
   - Grant free subscriptions to specific users
   - Promotional/beta user access
   - Discount code management

4. **Referral Program Management** (`ReferralProgramManager.tsx`)
   - Track referral activity
   - Manage referral rewards
   - Affiliate program administration

5. **Promotional Campaigns** (`PromotionalCampaignManager.tsx`)
   - Create and manage discount campaigns
   - Special offers configuration
   - Campaign analytics

6. **Lead Management** (`LeadCampaignManager.tsx`)
   - Lead capture and scoring
   - Campaign performance tracking
   - Lead pipeline management

7. **Social Media Management** (`SocialMediaManager.tsx`)
   - Schedule posts across multiple platforms
   - Content calendar
   - Social analytics

8. **Blog CMS** (`BlogCMSManager.tsx`)
   - AI-powered blog post generation
   - Content management (create/edit/delete)
   - Internal linking optimization
   - Featured image management
   - SEO metadata editing
   - Blog uniqueness tracking
   - Title bank management

9. **Email Marketing** (`EmailMarketingManager.tsx`)
   - Email subscriber management
   - Email campaign creation
   - Email sequence automation
   - Email template management
   - Event tracking

10. **SEO Management** (`SEOManager.tsx`)
    - Google Search Console integration
    - Robots.txt generation
    - Sitemap.xml management
    - Meta tags optimization
    - Core Web Vitals monitoring
    - Keyword position tracking
    - Backlink tracking
    - Mobile-first indexing checks
    - SEO audit automation

11. **Feature Flags** (`FeatureFlagDashboard.tsx`)
    - A/B testing
    - Gradual feature rollouts
    - Percentage-based targeting
    - Feature adoption tracking
    - User targeting rules

12. **Support Tickets** (`TicketQueue.tsx`)
    - Support request management
    - Ticket status tracking (new, in_progress, waiting_user, resolved, closed)
    - Priority assignment (low, medium, high, urgent)
    - Category management (bug, feature_request, question, billing)
    - Ticket assignment to staff
    - Ticket messaging/comments

13. **Nutrition Database** (`NutritionManager.tsx`)
    - Manage shared nutrition information
    - Barcode enrichment tool
    - Food database curation
    - Nutrition data validation

14. **User Roles Management** (`UserRolesManager.tsx`)
    - Admin role assignment
    - Role-based access control (RBAC)

15. **AI Settings** (`AISettingsManager.tsx`)
    - AI cost tracking and budgeting
    - Model pricing configuration
    - Usage limits management
    - AI request monitoring

### Supporting Admin Tools

- **System Health Dashboard** (`SystemHealthDashboard.tsx`)
  - Platform metrics monitoring
  - Real-time system status
  - Performance metrics

- **Live Activity Feed** (`LiveActivityFeed.tsx`)
  - Real-time user activity logging
  - Event stream visualization
  - User action tracking

- **Alert Manager** (`AlertManager.tsx`)
  - Admin notification system
  - Alert configuration
  - Severity-based alerts
  - Email/push notifications

- **Admin Integration Manager** (`AdminIntegrationManager.tsx`)
  - Third-party integrations
  - OAuth configuration
  - API key management

- **Analytics Dashboard** (`AdminDashboard.tsx`)
  - Platform health metrics
  - User engagement analytics
  - Daily activity tracking
  - AI usage metrics
  - Feature adoption rates
  - User retention analysis
  - Error tracking

- **Search Traffic Dashboard** (`SearchTrafficDashboard.tsx`)
  - Traffic forecasts
  - Top pages performance
  - SEO opportunities
  - Query performance analysis
  - Traffic sources
  - Device/browser analytics
  - Geographic breakdown
  - Comparative analytics

- **Content Optimizer** (`ContentOptimizer.tsx`)
  - AI-powered content analysis
  - On-page SEO recommendations

- **Barcode Scanner Dialog** (`BarcodeScannerDialog.tsx`)
  - Product barcode scanning
  - UPC database lookup

- **Email Results Display** (`SEOResultsDisplay.tsx`)
  - Email campaign performance tracking

---

## 3. DATABASE SCHEMA (MODELS)

### Core User & Identity Models
- `profiles` - User profiles
- `user_roles` - Role-based access control (admin, user, moderator)
- `auth.users` - Supabase authentication users

### Admin & Operations Tables
- `admin_live_activity` - Real-time activity feed for admin monitoring
- `admin_alerts` - Automated alerts (error_spike, signup_drop, payment_failure, abuse_detection)
- `admin_alert_preferences` - Admin notification preferences
- `admin_notifications` - Admin notification queue
- `admin_system_health` - System health snapshots
- `support_tickets` - Customer support tickets
- `ticket_messages` - Support ticket conversation threads

### Feature Management
- `feature_flags` - Feature flag definitions with rollout percentages
- `feature_flag_evaluations` - Feature flag evaluation history and analytics

### Email & Marketing Automation
- `email_subscribers` - Email list subscribers
- `email_campaigns` - Marketing campaigns
- `email_templates` - Email templates
- `email_sequences` - Email sequence definitions
- `email_sequence_steps` - Email sequence steps with delays
- `email_events` - Email delivery tracking (sent, bounced, complained, etc.)
- `automation_email_templates` - Automation email templates
- `automation_email_queue` - Email queue for sending
- `automation_email_subscriptions` - Email subscription management
- `automation_email_events` - Email event logs

### Blog & Content Management
- `blog_posts` - Blog post content
- `blog_categories` - Blog categories
- `blog_tags` - Blog tags
- `blog_post_tags` - Blog post tagging
- `blog_comments` - Blog comments
- `blog_title_bank` - Blog title ideas bank
- `blog_generation_history` - AI blog generation tracking
- `blog_content_tracking` - Content uniqueness tracking

### Social Media
- `social_posts` - Social media posts
- `social_content_versions` - Post version history

### Lead & Campaign Management
- `leads` - Lead records
- `campaigns` - Marketing campaigns
- `campaign_analytics` - Campaign performance metrics

### Subscriptions & Billing
- `subscriptions` - User subscription records
- `complementary_subscriptions` - Free tier subscriptions
- `subscription_invoices` - Invoice tracking
- `subscription_payments` - Payment records
- `stripe_product_mapping` - Stripe integration mapping

### AI & Cost Tracking
- `ai_usage_logs` - AI API call tracking
- `ai_cost_tracking` - Cost monitoring
- `ai_cost_budgets` - Budget management
- `ai_model_pricing` - AI model pricing configuration
- `ai_coach_conversations` - AI coach chat history
- `ai_coach_messages` - Individual AI messages

### SEO & Analytics
- `seo_keywords` - Keyword tracking
- `seo_positions` - SERP position tracking
- `seo_backlinks` - Backlink database
- `gsc_properties` - Google Search Console properties
- `gsc_performance_data` - GSC performance data
- `gsc_core_web_vitals` - Core Web Vitals from GSC
- `analytics_platform_connections` - Analytics integrations
- `analytics_insights` - Analytics insights

### Nutrition & Food Data
- `foods` - Food items database
- `nutrition_data` - Nutrition facts
- `food_aisle_mappings` - Grocery store aisle mappings

### Planning & Tracking
- `kids` - Child profiles
- `plan_entries` - Meal plan entries
- `food_attempts` - Food eating attempts
- `kid_achievements` - Achievement tracking
- `recipes` - Recipe database

### System & Infrastructure
- `backup_logs` - Backup operation logs
- `backup_config` - Backup configuration
- `rate_limits` - Rate limiting tracking
- `webhook_logs` - Webhook execution logs
- `system_events` - System event logging

### Analytics Views (SQL Views)
- `admin_platform_health` - Real-time platform health metrics
- `admin_user_engagement` - User engagement scoring and tier classification
- `admin_daily_activity` - Daily activity metrics
- `admin_ai_usage_analytics` - AI usage trends
- `admin_feature_adoption` - Feature usage adoption rates
- `admin_user_retention` - Retention cohort analysis
- `admin_error_tracking` - Error aggregation and tracking

---

## 4. BACKGROUND JOBS & SCHEDULED TASKS

### Supabase Edge Functions (60+ functions)

**Email & Communication:**
- `send-emails` - Queue-based email sender (Resend, SendGrid, AWS SES)
- `send-auth-email` - Authentication emails
- `send-seo-notification` - SEO alert emails
- `process-email-sequences` - Email sequence automation (triggered by cron)
- `generate-social-content` - AI content generation for social media

**Analytics & Monitoring:**
- `sync-analytics-data` - Sync Google Analytics 4 data
- `gsc-sync-data` - Google Search Console data synchronization
- `gsc-fetch-core-web-vitals` - Fetch Core Web Vitals from GSC
- `track-serp-positions` - SERP position tracking
- `check-keyword-positions` - Keyword ranking monitoring
- `run-scheduled-audit` - Automated SEO audits
- `check-core-web-vitals` - PageSpeed Insights monitoring
- `monitor-performance-budget` - Performance monitoring

**SEO & Content:**
- `analyze-blog-posts-seo` - Blog post SEO analysis
- `detect-duplicate-content` - Content duplication detection
- `check-broken-links` - Broken link detection
- `detect-redirect-chains` - Redirect chain analysis
- `validate-structured-data` - Schema validation
- `check-mobile-first` - Mobile-first indexing check
- `check-security-headers` - Security header verification
- `crawl-site` - Website crawling
- `analyze-content` - Content analysis
- `analyze-semantic-keywords` - Keyword semantic analysis
- `analyze-internal-links` - Internal linking analysis
- `analyze-images` - Image SEO analysis
- `apply-seo-fixes` - Automated SEO fixes
- `generate-sitemap` - Sitemap generation
- `generate-blog-content` - AI blog post generation
- `manage-blog-titles` - Blog title management
- `update-blog-image` - Featured image updates
- `optimize-page-content` - Content optimization suggestions

**Stripe & Payments:**
- `stripe-webhook` - Stripe webhook handler
  - Checkout session completion
  - Subscription creation/updates/deletion
  - Payment success/failure handling
- `create-checkout` - Checkout session creation
- `manage-subscription` - Subscription management

**Data Integration:**
- `gsc-oauth` - Google Search Console OAuth flow
- `ga4-oauth` - Google Analytics OAuth
- `bing-webmaster-oauth` - Bing Webmaster OAuth
- `yandex-webmaster-oauth` - Yandex OAuth
- `enrich-barcodes` - Barcode data enrichment
- `lookup-barcode` - UPC barcode lookup

**Food & Nutrition:**
- `identify-food-image` - AI food image recognition
- `suggest-foods` - Food suggestion engine
- `suggest-recipe` - Recipe suggestion
- `suggest-recipes-from-pantry` - Pantry-based recipe suggestions
- `parse-recipe` - Recipe parsing
- `parse-recipe-grocery` - Recipe to grocery parsing
- `calculate-food-similarity` - Food similarity scoring

**AI & Planning:**
- `ai-meal-plan` - AI meal plan generation
- `test-ai-model` - AI model testing

**Administration:**
- `backup-scheduler` - Automated backup scheduling
- `backup-user-data` - User data backup
- `list-users` - User listing (admin)
- `update-user` - User update operations
- `join-waitlist` - Waitlist management
- `weekly-summary-generator` - Weekly admin summaries

---

## 5. LOGGING & MONITORING

### Logger System (`/src/lib/logger.ts`)
- **Custom Logger Class** with environment-aware behavior
  - Development: All levels (debug, info, warn, error)
  - Production: Only warn and error
- **Log Levels**: debug, info, warn, error
- **Context Logging**: Prefix-based contextual logging
- **Singleton pattern** for consistent logging

### Error Monitoring (`/src/lib/sentry.tsx`)
- **Sentry Integration** (production & enabled via env var)
  - Browser tracing (10% in production, 100% in dev)
  - Session replay (10% normal, 100% on errors)
  - Automatic breadcrumb collection
  - Custom event tracking

- **Error Filtering**
  - Ignores browser extension errors
  - Ignores network errors
  - Filters React hydration warnings

- **PII Protection**
  - Removes cookies from requests
  - Removes Authorization headers
  - Removes password/phone/email from breadcrumbs

- **Error Boundary**
  - Fallback UI component
  - Development error details
  - Reset functionality

### Admin Analytics Library (`/src/lib/admin-analytics.ts`)
Comprehensive platform monitoring with real-time metrics:

**Platform Health Metrics:**
- Total users, new users (7d, 30d)
- Active users (7d, 30d)
- Total kids, foods, recipes, plan entries
- Successful food attempts and achievements
- Rate limit hits (1h), failed backups (24h), failed emails (24h)

**User Engagement Metrics:**
- User tier classification (power_user, active, casual, inactive)
- Engagement score (0-100)
- Kids/foods/recipes count per user
- Last activity timestamps
- User tier distribution

**Daily Activity Tracking:**
- Active user counts
- Plan entries created
- Meals logged
- Food attempts
- Successful attempts
- Foods added
- Recipes created
- Achievements earned

**AI Usage Analytics:**
- API endpoint tracking
- Request counts (24h, 7d)
- Unique users per endpoint
- Peak requests per minute
- Average requests per user

**Notifications & Alerts:**
- Admin notification queue
- Read/unread status
- Severity levels (info, warning, error, critical)
- Activity type-based alerts

### Database Monitoring

**Real-time Activity Feed** (`admin_live_activity` table):
- User actions: signup, login, meal plan creation, recipe creation, etc.
- API calls and errors
- Activity severity levels
- Browser/IP/device metadata
- Timestamps for trend analysis

**Admin Alerts Table** (`admin_alerts`):
- Alert types: error_spike, signup_drop, high_api_cost, payment_failure, abuse_detection
- Severity levels: low, medium, high, critical
- Automatic alert triggering based on thresholds
- Alert resolution tracking

**System Health Monitoring** (`admin_system_health`):
- System snapshots
- Component health status
- Performance metrics

---

## 6. API ENDPOINTS & ADMIN ROUTES

### Main Admin Routes

**Page Routes:**
- `/admin` - Main admin dashboard with sidebar navigation
- `/admin-dashboard` - Analytics & metrics dashboard
- `/admin-dashboard?tab=users` - User management tab
- `/admin-dashboard?tab=subscriptions` - Subscription management
- `/admin-dashboard?tab=complementary` - Complementary subscriptions
- `/admin-dashboard?tab=referrals` - Referral program
- `/admin-dashboard?tab=campaigns` - Promotional campaigns
- `/admin-dashboard?tab=leads` - Lead management
- `/admin-dashboard?tab=social` - Social media management
- `/admin-dashboard?tab=blog` - Blog CMS
- `/admin-dashboard?tab=email` - Email marketing
- `/admin-dashboard?tab=seo` - SEO management
- `/admin-dashboard?tab=flags` - Feature flags
- `/admin-dashboard?tab=tickets` - Support tickets
- `/admin-dashboard?tab=nutrition` - Nutrition database
- `/admin-dashboard?tab=roles` - User roles
- `/admin-dashboard?tab=ai` - AI settings
- `/search-traffic` - Search traffic analytics dashboard
- `/seo-dashboard` - SEO-specific dashboard

### Supabase Edge Function Endpoints

All accessible via: `https://{project}.supabase.co/functions/v1/{function-name}`

**Examples:**
- `POST /functions/v1/create-checkout` - Create Stripe checkout
- `POST /functions/v1/stripe-webhook` - Stripe webhook handler
- `POST /functions/v1/send-emails` - Process email queue
- `GET/POST /functions/v1/gsc-oauth` - Google Search Console auth
- `POST /functions/v1/manage-subscription` - Subscription operations
- `GET /functions/v1/analyze-blog-posts-seo` - SEO analysis
- `POST /functions/v1/generate-blog-content` - AI content generation

### RPC Functions (Stored Procedures)

Called via Supabase client `.rpc()` method:
- `enroll_in_email_sequence()` - Email automation enrollment
- Various admin operation functions defined in migrations

### Authentication & Authorization

**Admin Check Hook** (`/src/hooks/useAdminCheck.ts`):
- Verifies user has admin role in `user_roles` table
- Returns `isAdmin` and `isLoading` state
- Protected admin routes redirect non-admins

**RBAC Implementation:**
- Role-based access control via `user_roles` table
- Supabase Row-Level Security (RLS) policies on all admin tables
- Admin-only policies on sensitive tables

---

## 7. KEY SYSTEM INTEGRATIONS

### External Integrations

1. **Stripe** - Payment processing
2. **Google Search Console** - SEO data
3. **Google Analytics 4** - Traffic analytics
4. **Bing Webmaster** - SEO submission
5. **Yandex Webmaster** - International SEO
6. **Sentry** - Error monitoring
7. **Resend/SendGrid/AWS SES** - Email delivery
8. **PageSpeed Insights** - Core Web Vitals
9. **SEO APIs** - SerpAPI, DataForSEO, Ahrefs, Moz

### Internal Integration Points

- OAuth callback handling (`/oauth/callback`)
- Email automation triggers
- Webhook receivers (Stripe, blog webhooks)
- Analytics data synchronization
- Feature flag evaluation system

---

## 8. PERFORMANCE & SCALING FEATURES

### Rate Limiting
- `rate_limits` table for tracking quota usage
- Rate limit configuration by user tier
- Automatic throttling above limits

### Database Optimization
- Multiple performance indexes on high-query tables
- Indexed views for fast analytics queries
- Partitioning support for large tables

### Backup & Recovery
- `backup_logs` tracking backup operations
- `backup_config` for backup scheduling
- Automated backup scheduler (cron job)
- User data backup functionality

### Caching & Performance
- Sentry performance monitoring (10% sample in production)
- React Query for client-side caching
- Lazy loading of admin components

---

## 9. DATA RETENTION & COMPLIANCE

### Privacy Features
- User data backup/export
- Support for GDPR requirements
- PII protection in logging

### Audit Trail
- `admin_live_activity` for action audit logs
- `ticket_messages` for support interactions
- `blog_generation_history` for content tracking
- `analytics_insights` for decision logs

---

## 10. DEPLOYMENT & CI/CD

**Build & Deployment:**
- Cloudflare Pages for web deployment
- EAS Build for Expo mobile apps
- Vite for bundling
- TypeScript for type safety
- ESLint for code quality

**Environment Configuration:**
- Separate dev/production Sentry configs
- Per-environment analytics sampling
- Feature flag rollout control

---

## SUMMARY STATISTICS

- **Total Migrations**: 80+ SQL files with 15,519 lines
- **Admin Components**: 25+ specialized components
- **Supabase Edge Functions**: 60+ functions
- **Database Tables**: 100+ tables/views
- **Admin Features**: 15 major modules
- **Real-time Monitoring**: Live activity feed with 10+ event types
- **API Integrations**: 10+ external services

This represents an enterprise-grade admin operations platform with comprehensive monitoring, user management, content management, analytics, and automation capabilities.
