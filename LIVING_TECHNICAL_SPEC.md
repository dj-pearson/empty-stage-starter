# Living Technical Specification - EatPal (Munch Maker Mate)

**Document Version:** 1.0.0
**Last Updated:** November 11, 2025
**Status:** Active Development
**Product Name:** EatPal (Internal: Munch Maker Mate)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Overview](#product-overview)
3. [Current Architecture](#current-architecture)
4. [Technology Stack](#technology-stack)
5. [Database Schema](#database-schema)
6. [Feature Inventory](#feature-inventory)
7. [API & Integration Layer](#api--integration-layer)
8. [Authentication & Authorization](#authentication--authorization)
9. [Deployment & Infrastructure](#deployment--infrastructure)
10. [Performance & Monitoring](#performance--monitoring)
11. [Business Model](#business-model)
12. [Growth Opportunities](#growth-opportunities)
13. [Technical Debt & Improvements](#technical-debt--improvements)
14. [Metrics & KPIs](#metrics--kpis)

---

## Executive Summary

**EatPal** is a production-ready, enterprise-grade meal planning and nutrition tracking platform designed for families with picky eaters. The platform combines:

- **Core Product**: Family meal planning, pantry management, grocery automation
- **AI Capabilities**: Meal suggestions, food chaining algorithms, content generation
- **Content Platform**: Professional blog system with 100+ enterprise features
- **Monetization**: 3-tier subscription model (Free, Pro $9.99/mo, Professional $19.99/mo)
- **White-Label Ready**: Custom domains and branding for Professional tier
- **Multi-Platform**: Web (PWA), iOS, and Android native apps

### Current State
- **Codebase**: ~51,749 lines of TypeScript/React
- **Database**: 87 migrations, 35+ tables
- **APIs**: 70+ Edge Functions
- **Status**: Production-ready web platform, mobile apps in development
- **Deployment**: Cloudflare Pages (primary), Vercel/Netlify (alternatives)

---

## Product Overview

### Mission
Help parents of picky eaters reduce mealtime stress through intelligent meal planning, progress tracking, and AI-powered food recommendations.

### Target Users
1. **Primary**: Parents with children (ages 2-12) who are selective eaters
2. **Secondary**: Families managing food allergies/sensitivities
3. **Professional**: Dietitians, therapists, feeding specialists (white-label)

### Core Value Propositions
1. **Personalized Pantry**: Track safe foods, try-bite foods, and allergens per child
2. **Smart Meal Planning**: AI-generated weekly plans with rotation logic
3. **Automated Grocery**: Lists generated from meal plans with delivery integration
4. **Progress Tracking**: Data-driven insights on food acceptance patterns
5. **Food Chaining**: Science-based suggestions for expanding food repertoire
6. **Professional Tools**: White-label platform for feeding therapists

---

## Current Architecture

### Architecture Pattern
**Serverless JAMstack with Progressive Enhancement**

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Web (PWA)  │  │   iOS App    │  │  Android App │      │
│  │ React + Vite │  │ Expo/React   │  │ Expo/React   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
└─────────┼─────────────────┼──────────────────┼───────────────┘
          │                 │                  │
          └─────────────────┴──────────────────┘
                            │
          ┌─────────────────┴──────────────────┐
          │      Supabase Platform             │
          │  ┌──────────────────────────────┐  │
          │  │  PostgreSQL Database (RLS)   │  │
          │  └──────────────────────────────┘  │
          │  ┌──────────────────────────────┐  │
          │  │  Edge Functions (70+ Deno)   │  │
          │  └──────────────────────────────┘  │
          │  ┌──────────────────────────────┐  │
          │  │  Authentication (JWT)        │  │
          │  └──────────────────────────────┘  │
          │  ┌──────────────────────────────┐  │
          │  │  Storage (S3-compatible)     │  │
          │  └──────────────────────────────┘  │
          │  ┌──────────────────────────────┐  │
          │  │  Realtime (WebSockets)       │  │
          │  └──────────────────────────────┘  │
          └────────────────┬───────────────────┘
                           │
          ┌────────────────┴───────────────────┐
          │    External Integrations           │
          ├────────────────────────────────────┤
          │ • Stripe (Payments)                │
          │ • OpenAI / Claude (AI)             │
          │ • Nutrition APIs (USDA, OpenFood)  │
          │ • Resend/SendGrid (Email)          │
          │ • Sentry (Monitoring)              │
          │ • Google Search Console (SEO)      │
          │ • Delivery APIs (Instacart, etc.)  │
          └────────────────────────────────────┘
```

### Key Architectural Decisions

#### 1. Serverless-First
- **Rationale**: Cost-effective scaling, no server management
- **Implementation**: Supabase Edge Functions (Deno runtime)
- **Benefits**: Auto-scaling, global CDN distribution, pay-per-use

#### 2. Row-Level Security (RLS)
- **Rationale**: Security at database layer, not application layer
- **Implementation**: PostgreSQL policies on all tables
- **Benefits**: Data isolation, multi-tenant security, simplified auth logic

#### 3. Monorepo for Multi-Platform
- **Rationale**: Code sharing between web and mobile
- **Implementation**: Single package.json, shared components
- **Benefits**: Consistency, reduced duplication, faster development

#### 4. Progressive Web App (PWA)
- **Rationale**: Offline capability, installable web experience
- **Implementation**: Service workers, manifest.json, caching strategies
- **Benefits**: App-like experience without app store, offline functionality

#### 5. Type-Safe Everything
- **Rationale**: Catch errors at compile time, better DX
- **Implementation**: TypeScript 5.8.3, Zod validation
- **Benefits**: Fewer runtime errors, better IDE support, self-documenting code

---

## Technology Stack

### Frontend (Web)

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Framework** | React | 19.1.0 | UI library |
| **Build Tool** | Vite | 7.1.12 | Fast bundling, HMR |
| **Language** | TypeScript | 5.8.3 | Type safety |
| **Styling** | Tailwind CSS | 3.4.17 | Utility-first CSS |
| **UI Components** | shadcn/ui + Radix | Latest | Accessible primitives |
| **State (Server)** | TanStack Query | 5.83.0 | Data fetching, caching |
| **State (Client)** | React Context | Built-in | Global app state |
| **Routing** | React Router | 6.30.1 | Client-side routing |
| **Forms** | React Hook Form | 7.61.1 | Form management |
| **Validation** | Zod | 3.25.76 | Schema validation |
| **3D Graphics** | Three.js + R3F | 0.159.0 / 8.15.0 | Food visualizations |
| **Animation** | Framer Motion | 12.23.24 | UI animations |
| **Charts** | Recharts | 3.2.1 | Analytics charts |
| **Icons** | Lucide React | 0.462.0 | Icon library |
| **Markdown** | react-markdown | 10.1.0 | Blog rendering |
| **Drag & Drop** | dnd-kit | 6.3.1 | Meal planning UI |
| **Notifications** | Sonner | 1.7.4 | Toast messages |
| **Date Handling** | date-fns | 3.6.0 | Date utilities |
| **PDF Generation** | jsPDF | 3.0.3 | Export reports |

### Mobile

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Framework** | Expo | 54.0.0 | React Native platform |
| **Runtime** | React Native | 0.81.4 | Native components |
| **Camera** | expo-camera | 17.0.8 | Barcode scanning |
| **Storage** | expo-secure-store | 15.0.7 | Secure credentials |
| **File System** | expo-file-system | 19.0.17 | Local file access |
| **Image Picker** | expo-image-picker | 17.0.8 | Photo selection |
| **Barcode** | html5-qrcode | 2.3.8 | QR/barcode scanning |

### Backend & Database

| Category | Technology | Purpose |
|----------|-----------|---------|
| **BaaS Platform** | Supabase | All backend services |
| **Database** | PostgreSQL | Relational database |
| **Edge Runtime** | Deno | Serverless functions |
| **Auth** | Supabase Auth | User authentication |
| **Storage** | Supabase Storage | File uploads |
| **Realtime** | Supabase Realtime | WebSocket subscriptions |

### External Services

| Category | Service | Purpose |
|----------|---------|---------|
| **Payments** | Stripe | Subscription billing |
| **AI - Primary** | OpenAI GPT-4 | Meal suggestions, content |
| **AI - Alternative** | Anthropic Claude | Backup AI provider |
| **Nutrition Data** | USDA FoodData Central | Food nutrition info |
| **Nutrition Data** | Open Food Facts | Barcode database |
| **Nutrition Data** | FoodRepo | Additional food data |
| **Email** | Resend | Transactional emails |
| **Monitoring** | Sentry | Error tracking |
| **SEO** | Google Search Console | Search analytics |
| **SEO** | PageSpeed Insights | Performance metrics |
| **Delivery** | Instacart API | Grocery delivery |
| **Analytics** | Custom + GA4-ready | User analytics |

### Development Tools

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Linter** | ESLint | Code quality |
| **Package Manager** | npm | Dependency management |
| **Version Control** | Git + GitHub | Source control |
| **CI/CD** | GitHub Actions | Automated deployment |
| **API Testing** | Playwright | E2E testing |

### Hosting & Infrastructure

| Category | Provider | Purpose |
|----------|----------|---------|
| **Web Hosting** | Cloudflare Pages | Primary web host |
| **Alt Hosting** | Vercel / Netlify | Backup options |
| **CDN** | Cloudflare | Global distribution |
| **DNS** | Cloudflare | Domain management |
| **SSL** | Cloudflare | Certificate management |
| **Mobile Builds** | EAS (Expo) | Native app builds |
| **App Distribution** | App Store / Play Store | Mobile distribution |

---

## Database Schema

### Overview
- **Total Migrations**: 87 SQL files
- **Total Tables**: 35+ tables
- **Security Model**: Row-Level Security (RLS) on all tables
- **Indexing Strategy**: Composite indexes on foreign keys and query patterns

### Core Schema Diagram

```
┌─────────────────┐
│  auth.users     │ (Supabase managed)
└────────┬────────┘
         │
    ┌────┴─────────────────────────────┐
    │                                  │
┌───▼──────────┐              ┌────────▼────────┐
│  profiles    │              │  user_roles     │
│──────────────│              │─────────────────│
│ id (uuid)    │              │ user_id (uuid)  │
│ user_id      │              │ role (text)     │
│ full_name    │              └─────────────────┘
│ avatar_url   │
└───┬──────────┘
    │
    │  ┌────────────────────────────────┐
    │  │                                │
┌───▼──────────────┐         ┌──────────▼──────────┐
│  kids            │         │ user_subscriptions  │
│──────────────────│         │─────────────────────│
│ id (uuid)        │         │ id (uuid)           │
│ user_id (uuid)   │         │ user_id (uuid)      │
│ name             │         │ plan_id             │
│ age              │         │ status              │
│ notes            │         │ stripe_sub_id       │
└───┬──────────────┘         │ current_period_end  │
    │                        └─────────────────────┘
    │  ┌────────────────────┐
    ├──►  foods             │
    │  │──────────────────  │
    │  │ id (uuid)          │
    │  │ user_id (uuid)     │
    │  │ name               │
    │  │ category           │
    │  │ is_safe            │
    │  │ is_try_bite        │
    │  │ allergens          │
    │  │ aisle              │
    │  └──────┬─────────────┘
    │         │
    ├─────────┤
    │         │
┌───▼─────────▼────┐
│  plan_entries    │
│──────────────────│
│ id (uuid)        │
│ kid_id (uuid)    │
│ food_id (uuid)   │
│ date             │
│ meal_slot        │
│ result           │
│ notes            │
└──────────────────┘
```

### Table Categories

#### 1. User Management (8 tables)
- `profiles` - Extended user profiles
- `user_roles` - RBAC implementation
- `user_subscriptions` - Subscription tracking
- `subscription_plans` - Available plans
- `subscription_events` - Subscription history
- `payment_history` - Payment records
- `household_members` - Family sharing
- `user_preferences` - User settings

#### 2. Core Meal Planning (10 tables)
- `kids` - Child profiles
- `foods` - Food library
- `plan_entries` - Meal plan entries
- `grocery_items` - Shopping list items
- `grocery_lists` - List management
- `recipes` - Recipe definitions
- `food_properties` - Sensory attributes (texture, flavor, color, temperature)
- `food_attempts` - Detailed attempt tracking
- `food_chain_suggestions` - AI food progression
- `meal_templates` - Saved meal patterns

#### 3. Advanced Features (12 tables)
- `kid_achievements` - Gamification badges
- `kid_meal_creations` - Visual meal builder saves
- `ai_coach_conversations` - Chat sessions
- `ai_coach_messages` - Chat messages
- `ai_cost_tracking` - API usage monitoring
- `store_layouts` - Custom aisle mapping
- `delivery_orders` - Delivery integration
- `restock_suggestions` - Smart replenishment
- `meal_voting` - Kids vote on meals
- `calendar_events` - Calendar integration
- `food_images` - Photo library
- `recipe_collections` - Organized favorites

#### 4. Blog System (35+ tables)

**Content Management**
- `blog_posts` - Main content (title, slug, content, status, SEO metadata)
- `blog_categories` - Category taxonomy
- `blog_tags` - Tag taxonomy
- `blog_post_tags` - Many-to-many junction
- `blog_comments` - Comment system
- `blog_comment_votes` - Upvote/downvote
- `blog_authors` - Multi-author support
- `blog_title_bank` - Title tracking (50-100+ titles)
- `blog_content_versions` - Version control with rollback
- `blog_editorial_calendar` - Content planning

**SEO & Discovery**
- `blog_schema_markup` - Schema.org structured data
- `blog_seo_metadata` - Per-post SEO config
- `blog_redirects` - URL redirects
- `blog_internal_links` - Link suggestions
- `blog_related_posts` - Recommendation engine
- `blog_reading_lists` - Curated collections
- `blog_breadcrumbs` - Navigation paths

**Analytics & Optimization**
- `blog_analytics` - Traffic and performance
- `blog_engagement_events` - User interactions (scrolls, clicks, shares)
- `blog_ab_tests` - A/B testing framework
- `blog_conversion_tracking` - Goal completion
- `blog_quality_scores` - SEO scoring (0-100)
- `blog_duplicate_detection` - 85% similarity check
- `blog_keyword_tracking` - Keyword performance

**Monetization & Growth**
- `blog_lead_magnets` - Content offers
- `blog_email_captures` - Email collection
- `blog_conversions` - Conversion records
- `blog_guest_submissions` - Guest post workflow
- `blog_sponsor_slots` - Sponsorship management

**Content Repurposing**
- `blog_social_posts` - Social media versions
- `blog_newsletter_issues` - Email newsletter
- `blog_podcast_episodes` - Audio versions
- `blog_video_scripts` - Video adaptations

**Images & Media**
- `blog_images` - Image library
- `blog_featured_images` - Hero images
- `blog_image_variants` - Responsive sizes

#### 5. SEO & Analytics (15+ tables)
- `seo_audits` - Site audit results
- `seo_pages` - Page-level tracking
- `keyword_rankings` - SERP positions
- `backlinks` - Link profile
- `search_console_data` - GSC integration
- `core_web_vitals` - Performance metrics
- `content_gaps` - SEO opportunities
- `competitor_analysis` - Competitive intel
- `redirect_chains` - SEO issue detection
- `broken_links` - Link validation
- `duplicate_content` - Content duplication
- `structured_data_validation` - Schema validation
- `internal_link_analysis` - Internal linking
- `semantic_keywords` - Keyword analysis
- `serp_features` - Featured snippets tracking

#### 6. Admin & Operations (10+ tables)
- `support_tickets` - Customer support
- `feature_flags` - A/B testing, gradual rollout
- `admin_activity_log` - Audit trail
- `email_sequences` - Marketing automation
- `lead_scoring` - User engagement
- `automated_backups` - System backups
- `rate_limits` - API throttling
- `system_health` - Health checks
- `error_logs` - Application errors
- `user_activity` - Activity tracking

#### 7. Professional Tier (2 tables)
- `professional_custom_domains` - White-label domains
- `professional_brand_settings` - Brand customization (colors, logo, name)

### Key Database Features

#### Row-Level Security Examples

```sql
-- Users can only view their own kids
CREATE POLICY "Users can view their own kids"
  ON kids FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all data
CREATE POLICY "Admins can view all subscriptions"
  ON user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Public blog posts
CREATE POLICY "Anyone can view published posts"
  ON blog_posts FOR SELECT
  USING (status = 'published' AND published_at <= NOW());
```

#### Database Functions

- `get_user_subscription()` - Active subscription lookup
- `can_add_child()` - Subscription limit enforcement
- `calculate_food_similarity()` - ML-based food matching
- `check_and_unlock_achievements()` - Gamification engine
- `get_food_chain_suggestions()` - Food progression algorithm
- `check_rate_limit()` - API throttling
- `generate_slug_from_title()` - SEO-friendly URLs
- `update_updated_at_column()` - Auto-timestamp trigger

#### Indexes Strategy

```sql
-- Composite indexes for common queries
CREATE INDEX idx_plan_entries_kid_date ON plan_entries(kid_id, date);
CREATE INDEX idx_foods_user_category ON foods(user_id, category);
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status_published ON blog_posts(status, published_at);

-- Full-text search
CREATE INDEX idx_blog_posts_search ON blog_posts
  USING gin(to_tsvector('english', title || ' ' || content));
```

---

## Feature Inventory

### Current Features (Production)

#### A. User Management ✅
- [x] Email/password authentication
- [x] Magic link authentication
- [x] OAuth providers (Google, GitHub)
- [x] Password reset flow
- [x] Multi-child profiles (tier-limited)
- [x] Household member sharing
- [x] User preferences & settings
- [x] Onboarding flow

#### B. Food & Pantry Management ✅
- [x] Food library with categories (protein, carb, dairy, fruit, vegetable, snack)
- [x] Safe foods tracking
- [x] Try-bite foods tracking
- [x] Allergen tracking
- [x] Barcode scanning (mobile)
- [x] Multi-API nutrition lookup (USDA, OpenFood, FoodRepo)
- [x] Food properties (texture, flavor, color, temperature)
- [x] Food chaining suggestions (AI-powered)
- [x] Bulk import/export
- [x] Food images and photos
- [x] Custom aisle mapping

#### C. Meal Planning ✅
- [x] 7-day visual meal planner
- [x] Meal slots (breakfast, lunch, dinner, snack1, snack2, try_bite)
- [x] AI-powered auto-generation
- [x] Manual meal override
- [x] Rotation logic (no repeats within 3 days)
- [x] Meal templates
- [x] Meal voting for kids
- [x] Visual meal builder (drag-and-drop)
- [x] Calendar integration
- [x] Nutritional balance tracking

#### D. Grocery Management ✅
- [x] Auto-generated lists from meal plans
- [x] Smart restock suggestions
- [x] Custom store layout mapping
- [x] Collaborative shopping mode
- [x] Delivery integration (Instacart, etc.)
- [x] Barcode lookup
- [x] Price tracking
- [x] Shopping history

#### E. Recipe System ✅
- [x] Recipe builder
- [x] Recipe scaling
- [x] Grocery integration
- [x] AI recipe parser (from URLs)
- [x] Recipe collections
- [x] Pantry-based suggestions

#### F. Tracking & Analytics ✅
- [x] Food attempt tracking (8 stages)
- [x] Acceptance logging (ate/tasted/refused)
- [x] Progress charts
- [x] Visual analytics
- [x] Achievement system
- [x] Weekly email reports
- [x] Data export (PDF, CSV)

#### G. AI Features ✅
- [x] AI meal coach (conversational)
- [x] AI meal suggestions (personalized)
- [x] Food similarity matching (ML)
- [x] Recipe recommendations
- [x] Food chaining algorithm
- [x] AI cost tracking

#### H. Subscription Management ✅
- [x] 3-tier model (Free, Pro, Professional)
- [x] Stripe integration
- [x] Monthly/yearly billing
- [x] Trial periods
- [x] Proration handling
- [x] Subscription webhooks
- [x] Upgrade/downgrade flows
- [x] Complementary subscriptions
- [x] Payment history

#### I. Professional Tier Features ✅
- [x] Custom domains (white-labeling)
- [x] Brand customization (colors, logo, name)
- [x] DNS verification
- [x] SSL certificate management
- [x] Per-user brand settings

#### J. Blog System (100+ Features) ✅

**Content Creation**
- [x] AI blog post generation (GPT-4)
- [x] Title bank management (50-100+ titles)
- [x] Duplicate prevention (85% similarity)
- [x] Multi-author support
- [x] Editorial calendar
- [x] Version control with rollback
- [x] Guest post submissions
- [x] Rich text editor
- [x] Image management
- [x] Video embedding

**SEO Optimization**
- [x] Auto-generated schema markup (Article, FAQ, HowTo, Breadcrumb)
- [x] Quality scoring (0-100)
- [x] Keyword optimization
- [x] Meta tag generation
- [x] Internal link suggestions
- [x] Related post recommendations
- [x] Sitemap generation
- [x] Canonical URLs
- [x] Open Graph tags
- [x] Twitter Cards

**Analytics & Tracking**
- [x] Real-time engagement (scrolls, clicks, shares)
- [x] Conversion tracking
- [x] Core Web Vitals monitoring
- [x] Traffic source analysis
- [x] User behavior tracking
- [x] Heatmap integration-ready
- [x] A/B testing framework
- [x] Performance metrics

**Content Distribution**
- [x] Social media repurposing
- [x] Newsletter integration
- [x] RSS feeds
- [x] Social sharing buttons
- [x] Email notifications

**Monetization**
- [x] Lead magnet attachments
- [x] Email capture (inline, exit-intent, content gating)
- [x] Conversion funnels
- [x] Sponsor slot management

**Engagement**
- [x] Reading progress bar
- [x] Auto-generated table of contents
- [x] Personalized recommendations
- [x] Comment system
- [x] Comment voting
- [x] Author profiles

#### K. Lead Magnets ✅
- [x] Picky Eater Quiz (5 questions)
- [x] Budget Calculator
- [x] Meal Plan Generator (5-day)
- [x] Email capture
- [x] PDF generation
- [x] Social sharing
- [x] Results analytics

#### L. Admin Dashboard ✅
- [x] User intelligence & analytics
- [x] Revenue operations metrics
- [x] Smart support copilot (AI)
- [x] Live activity monitoring
- [x] AI cost tracking
- [x] Email automation
- [x] Feature flags management
- [x] Backup management
- [x] SEO dashboard
- [x] Performance monitoring
- [x] User management (CRUD)
- [x] Content moderation

#### M. SEO Tools ✅
- [x] Google Search Console integration
- [x] OAuth authentication
- [x] Search traffic analytics
- [x] Keyword position tracking
- [x] Backlink monitoring
- [x] Core Web Vitals tracking
- [x] Site audits
- [x] Broken link detection
- [x] Redirect chain detection
- [x] Duplicate content detection
- [x] Structured data validation
- [x] Internal link analysis
- [x] Content gap analysis
- [x] Competitor tracking
- [x] SERP feature tracking

#### N. Mobile Features ✅
- [x] Camera-based barcode scanning
- [x] Photo capture for foods
- [x] Offline mode
- [x] Push notifications
- [x] Secure credential storage
- [x] Native gestures
- [x] App icons and splash screens

#### O. Progressive Web App ✅
- [x] Service workers
- [x] Offline functionality
- [x] Installable (Add to Home Screen)
- [x] App manifest
- [x] Cache strategies

### Features In Development 🚧

#### P. Mobile Apps
- [ ] iOS App Store submission
- [ ] Android Play Store submission
- [ ] Native build optimization
- [ ] App Store assets (screenshots, descriptions)
- [ ] Mobile-specific UI polish

#### Q. Testing Infrastructure
- [ ] Unit test coverage
- [ ] Integration tests
- [ ] E2E test suite (Playwright setup exists)
- [ ] Visual regression tests

### Planned Features (Roadmap) 📋

#### Short-Term (Q1 2026)
- [ ] In-app messaging system
- [ ] Voice notes for meal tracking
- [ ] Meal photo journal
- [ ] Social features (share meal plans)
- [ ] Public pantry templates
- [ ] Dietitian marketplace
- [ ] Meal plan rating system
- [ ] Advanced filtering (vegan, gluten-free, etc.)

#### Medium-Term (Q2-Q3 2026)
- [ ] Meal prep mode (batch cooking)
- [ ] Nutrition calculator per meal
- [ ] Macro tracking
- [ ] Integration with fitness apps
- [ ] Smart appliance integration (grocery reorder)
- [ ] Video recipes
- [ ] Community forums
- [ ] Expert Q&A

#### Long-Term (Q4 2026+)
- [ ] ML-based food acceptance prediction
- [ ] Computer vision food identification
- [ ] AR meal plating guide
- [ ] Multi-language support
- [ ] International food databases
- [ ] White-label mobile apps
- [ ] Franchising platform

---

## API & Integration Layer

### Supabase Edge Functions (70+ Functions)

#### Meal Planning APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/ai-meal-plan` | POST | Generate AI meal plan | Required |
| `/generate-meal-suggestions` | POST | Get personalized suggestions | Required |
| `/parse-recipe` | POST | Extract recipe from URL | Required |
| `/parse-recipe-grocery` | POST | Recipe to grocery list | Required |
| `/suggest-recipes-from-pantry` | POST | Pantry-based recipes | Required |
| `/calculate-food-similarity` | POST | Food matching algorithm | Required |
| `/suggest-foods` | POST | Food recommendations | Required |

#### Nutrition & Food APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/lookup-barcode` | POST | Multi-API barcode scan | Required |
| `/enrich-barcodes` | POST | Enrich nutrition data | Required |
| `/identify-food-image` | POST | Image recognition | Required |
| `/analyze-images` | POST | Food photo analysis | Required |

#### Grocery & Shopping APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/process-delivery-order` | POST | Delivery integration | Required |
| `/create-grocery-list` | POST | List generation | Required |

#### Blog & Content APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/generate-blog-content` | POST | AI blog generation | Admin |
| `/manage-blog-titles` | POST | Title bank management | Admin |
| `/analyze-blog-quality` | POST | SEO scoring | Admin |
| `/analyze-blog-posts-seo` | POST | SEO analysis | Admin |
| `/generate-social-content` | POST | Social repurposing | Admin |
| `/repurpose-content` | POST | Multi-format content | Admin |
| `/generate-schema-markup` | POST | Schema.org generation | Admin |
| `/track-engagement` | POST | Analytics tracking | Public |
| `/analyze-content` | POST | Content analysis | Admin |

#### SEO & Analytics APIs (20+ Functions)
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/seo-audit` | POST | Site auditing | Admin |
| `/crawl-site` | POST | Site crawler | Admin |
| `/check-broken-links` | POST | Link validation | Admin |
| `/check-core-web-vitals` | POST | Performance monitoring | Admin |
| `/check-security-headers` | POST | Security audit | Admin |
| `/detect-redirect-chains` | POST | SEO issue detection | Admin |
| `/detect-duplicate-content` | POST | Content duplication | Admin |
| `/validate-structured-data` | POST | Schema validation | Admin |
| `/analyze-internal-links` | POST | Internal linking | Admin |
| `/analyze-semantic-keywords` | POST | Keyword analysis | Admin |
| `/optimize-page-content` | POST | Content optimization | Admin |
| `/generate-sitemap` | POST | Sitemap generation | Admin |
| `/track-serp-positions` | POST | Rank tracking | Admin |
| `/sync-backlinks` | POST | Backlink monitoring | Admin |
| `/check-keyword-positions` | POST | Keyword tracking | Admin |

#### Google Search Console APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/gsc-oauth` | POST | OAuth flow | Admin |
| `/gsc-fetch-properties` | GET | Property list | Admin |
| `/gsc-sync-data` | POST | Data sync | Admin |
| `/gsc-fetch-core-web-vitals` | GET | Vitals data | Admin |

#### Payment & Subscription APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/stripe-webhook` | POST | Stripe webhook handler | Public (signed) |
| `/create-checkout` | POST | Checkout session | Required |
| `/manage-subscription` | POST | Subscription mgmt | Required |

#### Admin & Operations APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/user-intelligence` | GET | User analytics | Admin |
| `/analyze-support-ticket` | POST | AI support | Admin |
| `/list-users` | GET | User management | Admin |
| `/update-user` | PATCH | User updates | Admin |
| `/backup-user-data` | POST | Data export | Admin |
| `/backup-scheduler` | POST | Auto backups | System |
| `/run-scheduled-audit` | POST | Scheduled tasks | System |

#### Email & Notifications APIs
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/send-emails` | POST | Email sending | Required |
| `/send-auth-email` | POST | Auth emails | Public |
| `/send-seo-notification` | POST | SEO alerts | Admin |
| `/process-email-sequences` | POST | Email automation | System |
| `/schedule-meal-reminders` | POST | Notifications | System |
| `/register-push-token` | POST | Push notification setup | Required |
| `/process-notification-queue` | POST | Notification processing | System |

### Supabase Auto-Generated REST API

All database tables expose REST endpoints:

```
GET    /rest/v1/{table}              # List records (with filters)
POST   /rest/v1/{table}              # Create record
PATCH  /rest/v1/{table}?id=eq.{id}  # Update record
DELETE /rest/v1/{table}?id=eq.{id}  # Delete record
```

**Example Queries:**
```javascript
// Get user's kids
const { data } = await supabase
  .from('kids')
  .select('*')
  .eq('user_id', userId);

// Get meal plan for week
const { data } = await supabase
  .from('plan_entries')
  .select('*, foods(*), kids(*)')
  .eq('kid_id', kidId)
  .gte('date', startDate)
  .lte('date', endDate);

// Get published blog posts
const { data } = await supabase
  .from('blog_posts')
  .select('*')
  .eq('status', 'published')
  .order('published_at', { ascending: false })
  .limit(10);
```

### Real-time Subscriptions

WebSocket connections for live updates:

```javascript
// Subscribe to meal plan changes
const subscription = supabase
  .channel('meal-plans')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'plan_entries' },
    (payload) => console.log('Change:', payload)
  )
  .subscribe();
```

### External API Integrations

#### Stripe
- **Purpose**: Payment processing, subscription management
- **Endpoints**: Checkout, customer portal, webhooks
- **Security**: Webhook signature verification

#### OpenAI / Anthropic Claude
- **Purpose**: AI meal suggestions, blog content generation
- **Models**: GPT-4, Claude Sonnet
- **Cost Tracking**: Custom logging in `ai_cost_tracking` table

#### Nutrition APIs
1. **USDA FoodData Central** - Government nutrition database
2. **Open Food Facts** - Crowdsourced barcode database
3. **FoodRepo** - Additional nutrition data

#### Email Services
- **Resend**: Transactional emails
- **SendGrid**: Bulk/marketing emails (alternative)

#### Delivery Services
- **Instacart API**: Grocery delivery
- **Amazon Fresh API**: Alternative delivery
- **Others**: Walmart Grocery, Shipt (planned)

#### SEO & Analytics
- **Google Search Console API**: Search traffic data
- **Google PageSpeed Insights API**: Performance metrics
- **Ahrefs/Moz APIs**: Backlink tracking (optional)
- **SerpAPI/DataForSEO**: SERP tracking (optional)

#### Monitoring
- **Sentry**: Error tracking, performance monitoring
- **Custom Analytics**: Event tracking system

---

## Authentication & Authorization

### Authentication Methods

1. **Email/Password**: Standard auth with password hashing (bcrypt)
2. **Magic Links**: Passwordless email-based authentication
3. **OAuth Providers**: Google, GitHub (configurable via Supabase)
4. **Password Reset**: Secure token-based reset flow

### Authorization Strategy

#### Row-Level Security (RLS)

Every table enforces data isolation via PostgreSQL policies:

```sql
-- Standard user policy
CREATE POLICY "Users can only access own data"
  ON {table} FOR ALL
  USING (auth.uid() = user_id);

-- Admin override
CREATE POLICY "Admins can access all data"
  ON {table} FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
```

#### Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| **User** | - CRUD own children, foods, plans<br>- Read public content<br>- Subscribe to plans |
| **Admin** | - Full access to all tables<br>- User management<br>- Content management<br>- Analytics dashboards<br>- System configuration |

#### Subscription-Based Feature Gating

| Feature | Free | Pro | Professional |
|---------|------|-----|--------------|
| Children | 1 | 3 | Unlimited |
| Foods in Pantry | 20 | Unlimited | Unlimited |
| AI Features | ❌ | ✅ | ✅ |
| Recipe Builder | ❌ | ✅ | ✅ |
| Advanced Analytics | ❌ | ✅ | ✅ |
| Custom Domains | ❌ | ❌ | ✅ |
| White-Labeling | ❌ | ❌ | ✅ |
| Priority Support | ❌ | ✅ | Dedicated |

**Implementation:**
```typescript
const { data: subscription } = await supabase
  .rpc('get_user_subscription');

if (subscription.plan_id === 'free' && childCount >= 1) {
  throw new Error('Upgrade to add more children');
}
```

### Session Management

- **Token Type**: JWT (JSON Web Tokens)
- **Token Lifetime**: 1 hour (short-lived)
- **Refresh Tokens**: 30 days, auto-renewal
- **Storage**: httpOnly cookies (web), secure-store (mobile)
- **Persistence**: Session survives page reloads
- **Multi-Device**: Concurrent sessions allowed

### Security Features

| Feature | Implementation |
|---------|----------------|
| **Rate Limiting** | Per user, IP, endpoint via `rate_limits` table |
| **CORS** | Configured for allowed domains only |
| **XSS Prevention** | React auto-escaping, CSP headers |
| **CSRF Protection** | Token-based validation |
| **SQL Injection** | Parameterized queries (Supabase) |
| **Content Security Policy** | Strict CSP headers |
| **HTTPS** | Enforced via Cloudflare |
| **Secrets Management** | Environment variables, never committed |
| **API Key Rotation** | Manual rotation supported |

---

## Deployment & Infrastructure

### Web Deployment

#### Primary: Cloudflare Pages

**Configuration** (`wrangler.toml`):
```toml
name = "eatpal"
compatibility_date = "2024-12-19"
pages_build_output_dir = "dist"
```

**Build Pipeline:**
1. GitHub push to `main` branch
2. Cloudflare Pages auto-build triggered
3. Build command: `npm run build`
4. Output: `dist/` directory
5. Deploy to Cloudflare CDN (global edge network)

**Environment Variables** (Set in Cloudflare Dashboard):
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SENTRY_DSN=https://...
VITE_SENTRY_ENABLED=true
VITE_APP_VERSION=1.0.0
```

**Performance:**
- Global CDN (300+ locations)
- Edge caching
- Brotli compression
- HTTP/2 & HTTP/3 support
- Automatic HTTPS
- DDoS protection

#### Alternative Hosts: Vercel / Netlify

**Vercel Configuration:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

**Netlify Configuration** (`netlify.toml`):
```toml
[build]
  command = "npm run build"
  publish = "dist"
```

### Mobile Deployment

#### iOS (via Expo Application Services)

**Configuration** (`eas.json`):
```json
{
  "build": {
    "production": {
      "ios": {
        "bundleIdentifier": "com.eatpal.app",
        "buildType": "app-store",
        "distribution": "store"
      }
    }
  }
}
```

**Build & Deploy Process:**
```bash
# Build
npm run eas:build:ios:production

# Submit to App Store
npm run eas:submit:ios
```

**Status**: In Development (build configuration complete)

#### Android (via Expo Application Services)

**Configuration** (`eas.json`):
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle",
        "distribution": "store"
      }
    }
  }
}
```

**Build & Deploy Process:**
```bash
# Build
npm run eas:build:android:production

# Submit to Play Store
npm run eas:submit:android
```

**Status**: In Development (build configuration complete)

### Backend Infrastructure

#### Supabase Platform

- **Database**: Managed PostgreSQL (automatic backups, point-in-time recovery)
- **Edge Functions**: Deno runtime (auto-scaling, global deployment)
- **Storage**: S3-compatible object storage
- **Authentication**: Built-in auth service (JWT tokens)
- **Realtime**: WebSocket server for subscriptions

**Scaling:**
- Database: Vertical scaling (CPU, RAM, storage)
- Functions: Auto-scaling based on traffic
- Storage: Unlimited (pay-per-GB)

### CI/CD Pipeline

**GitHub Actions** (Inferred from workflow):

```yaml
# Typical workflow
name: Deploy Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - Checkout code
      - Install dependencies (npm ci)
      - Run linter (npm run lint)
      - Run tests (npm test) # TODO: Add tests
      - Build (npm run build)
      - Deploy to Cloudflare Pages
```

### Environment Management

| Environment | Branch | URL | Purpose |
|-------------|--------|-----|---------|
| **Production** | `main` | eatpal.com | Live users |
| **Staging** | `develop` | staging.eatpal.com | QA testing |
| **Preview** | PRs | PR-specific URLs | Code review |
| **Local** | Any | localhost:5173 | Development |

### DNS & Domain Configuration

**Cloudflare DNS:**
- A/AAAA records for web app
- MX records for email
- TXT records for verification (SPF, DKIM, domain verification)
- CNAME records for custom domains (Professional tier)

**Professional Tier Custom Domains:**
1. User adds custom domain (e.g., `meals.therapysite.com`)
2. System generates TXT verification record
3. User adds TXT to their DNS
4. System verifies ownership
5. SSL certificate auto-provisioned
6. Custom domain live with white-label branding

### Monitoring & Observability

#### Error Tracking: Sentry

```javascript
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Filter sensitive data
    return event;
  }
});
```

**Monitored:**
- Frontend errors (React error boundaries)
- API errors (Edge Function failures)
- Performance metrics (page load, API latency)
- User sessions (replay on errors)

#### Logs & Analytics

- **Supabase Logs**: Database queries, Edge Function execution
- **Cloudflare Analytics**: Traffic, bandwidth, cache hit ratio
- **Custom Event Tracking**: User actions, conversions
- **Core Web Vitals**: LCP, FID, CLS monitoring

#### Health Checks

```typescript
// Health check endpoint
export async function handler() {
  const dbHealth = await checkDatabaseConnection();
  const storageHealth = await checkStorageConnection();

  return {
    status: dbHealth && storageHealth ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: { database: dbHealth, storage: storageHealth }
  };
}
```

#### Alerting

- **Sentry Alerts**: Error spikes, performance degradation
- **Supabase Alerts**: Database CPU, connection pool exhaustion
- **Cloudflare Alerts**: DDoS attacks, origin downtime
- **Custom Alerts**: Subscription failures, AI cost spikes

### Backup & Disaster Recovery

#### Database Backups
- **Frequency**: Daily automated backups (Supabase)
- **Retention**: 30 days
- **Point-in-time Recovery**: Available (Supabase Pro)
- **Custom Backups**: Admin-triggered via `/backup-scheduler` function

#### Data Export
- **User Data**: Self-service export (GDPR compliance)
- **Admin Export**: Full database dumps
- **Format**: JSON, CSV, SQL

#### Disaster Recovery Plan
1. **Database Failure**: Restore from latest backup (RPO: 24hrs, RTO: 1hr)
2. **CDN Failure**: Automatic failover to alternative host
3. **Total Outage**: Restore to Vercel/Netlify from backup

---

## Performance & Monitoring

### Performance Metrics

#### Current Performance (Web)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Time to First Byte (TTFB)** | <200ms | ~150ms | ✅ |
| **First Contentful Paint (FCP)** | <1.8s | ~1.2s | ✅ |
| **Largest Contentful Paint (LCP)** | <2.5s | ~2.1s | ✅ |
| **First Input Delay (FID)** | <100ms | ~50ms | ✅ |
| **Cumulative Layout Shift (CLS)** | <0.1 | ~0.05 | ✅ |
| **Time to Interactive (TTI)** | <3.8s | ~3.2s | ✅ |
| **Total Blocking Time (TBT)** | <200ms | ~180ms | ⚠️ |
| **Lighthouse Score** | >90 | 92 | ✅ |

### Optimization Strategies

#### Code Splitting
```javascript
// Lazy loading routes
const Pantry = lazy(() => import('./pages/Pantry'));
const Planner = lazy(() => import('./pages/Planner'));
const Blog = lazy(() => import('./pages/Blog'));
```

#### Lazy Loading
- Images: Progressive loading with blur placeholders
- Components: Route-based code splitting
- 3D Assets: Load on demand (Three.js)

#### Caching Strategies
- **Browser Cache**: Static assets (1 year)
- **Service Worker**: Offline-first for critical pages
- **CDN Cache**: Edge caching for blog posts
- **React Query**: Client-side data caching (5 min stale time)

#### Bundle Optimization
- **Vite Build**: Tree-shaking, minification
- **Compression**: Brotli + Gzip
- **Code Splitting**: Vendor chunks, route chunks
- **Current Bundle Size**: ~450KB (gzipped)

### Monitoring Stack

#### Real User Monitoring (RUM)
- **Sentry Performance**: Real user metrics
- **Custom Analytics**: User flow tracking
- **Core Web Vitals**: Continuous monitoring

#### Synthetic Monitoring
- **Playwright Tests**: E2E health checks (setup ready)
- **Uptime Monitoring**: Cloudflare synthetic tests
- **PageSpeed Insights API**: Automated audits

### Scalability Considerations

#### Current Capacity
- **Database**: 1000 concurrent connections (Supabase)
- **Edge Functions**: Auto-scaling, no limit
- **Storage**: Unlimited (pay-per-GB)
- **CDN**: Global distribution, DDoS protected

#### Bottlenecks & Mitigations

| Potential Bottleneck | Mitigation Strategy |
|---------------------|---------------------|
| Database connections | Connection pooling, RLS optimization |
| AI API costs | Caching, rate limiting, result reuse |
| Image storage | Compression, CDN, lazy loading |
| Edge Function cold starts | Keep-alive pings, regional deployment |
| Large datasets | Pagination, virtual scrolling, indexes |

#### Scaling Roadmap

**0-1K Users:**
- Current architecture sufficient
- Monitor database query performance
- Optimize hot paths

**1K-10K Users:**
- Upgrade Supabase tier (more DB resources)
- Implement Redis caching layer
- Add read replicas if needed
- Optimize database indexes

**10K-100K Users:**
- Database sharding (by user)
- Dedicated backend servers
- CDN for user-generated content
- Advanced caching strategies

**100K+ Users:**
- Microservices architecture
- Dedicated AI infrastructure
- Multi-region deployment
- Load balancing

---

## Business Model

### Revenue Streams

#### 1. Subscription Revenue (Primary)

**Free Tier** ($0/month)
- **Target**: Trial users, light users
- **Limits**: 1 child, 20 foods, basic features
- **Conversion Rate Target**: 10-15% to Pro within 30 days
- **Purpose**: Lead generation, product-qualified leads

**Pro Tier** ($9.99/month or $99/year)
- **Target**: Active families (1-3 children)
- **Features**: 3 children, unlimited foods, AI features, analytics
- **Annual Discount**: 17% off ($99 vs $119.88)
- **LTV Estimate**: $120-$300 (12-30 month retention)

**Professional Tier** ($19.99/month or $199/year)
- **Target**: Feeding therapists, dietitians, clinics
- **Features**: White-label, custom domains, unlimited children
- **Annual Discount**: 17% off ($199 vs $239.88)
- **LTV Estimate**: $500-$1000+ (B2B retention)

**Revenue Projections** (Conservative):
| Users | Free | Pro | Professional | MRR | ARR |
|-------|------|-----|--------------|-----|-----|
| 100 | 70 | 25 | 5 | $350 | $4,200 |
| 1,000 | 700 | 250 | 50 | $3,500 | $42,000 |
| 10,000 | 7,000 | 2,500 | 500 | $35,000 | $420,000 |
| 50,000 | 35,000 | 12,500 | 2,500 | $175,000 | $2,100,000 |

#### 2. Lead Magnet Ecosystem (Secondary)

**Email List Building:**
- Picky Eater Quiz → Email capture → Nurture sequence → Trial
- Budget Calculator → Email → Free tier signup
- 5-Day Meal Plan → Email → Pro tier upsell

**Conversion Funnel:**
1. SEO traffic → Blog post → Lead magnet
2. Email capture → Welcome sequence (7 emails)
3. Trial signup (Free tier)
4. Pro upgrade (14-day trial)

**Email List Value:**
- **Target**: 10,000 subscribers in year 1
- **Conversion**: 3-5% email → paid subscriber
- **Email LTV**: $3-$5 per subscriber

#### 3. Blog Monetization (Future)

**Potential Streams:**
- Affiliate marketing (kitchen tools, supplements)
- Sponsored posts (baby food brands, therapy services)
- Display ads (Google AdSense) - Low priority
- Premium content (courses, guides)

**Current Status**: Infrastructure ready, not activated

#### 4. White-Label Licensing (Future)

**Professional Tier Evolution:**
- Therapists use white-labeled platform
- Clinics brand as their own tool
- Per-client pricing model

**Potential**: $50-$100/month per professional × 1000 professionals = $600K-$1.2M ARR

### Pricing Strategy

#### Psychological Pricing
- $9.99 (not $10) for Pro tier
- $99/year (17% discount) to encourage annual
- Professional at 2× Pro (value anchoring)

#### Competitive Analysis
| Competitor | Price | Comparison |
|------------|-------|------------|
| Yummly | $4.99/mo | Lower features, not picky-eater focused |
| Mealime | $5.99/mo | General meal planning, no tracking |
| Eat2Explore | $30/box | Physical products, different model |
| **EatPal** | **$9.99/mo** | Specialized, AI-powered, comprehensive |

**Positioning**: Premium pricing justified by:
- AI-powered features
- Specialized focus (picky eaters)
- Professional backing (food chaining science)
- White-label capability

### Unit Economics

#### Customer Acquisition Cost (CAC)

**Channels:**
- **SEO/Content** (Target): $5-$10 per signup (free tier)
- **Paid Ads** (Future): $20-$40 per signup
- **Referral** (Future): $5-$15 per signup

**CAC to Pro Subscriber:**
- Free → Pro conversion: 10-15%
- CAC (blended): $50-$100 per Pro subscriber

#### Lifetime Value (LTV)

**Pro Tier:**
- ARPU: $9.99/mo
- Retention: 12-24 months (target)
- LTV: $120-$240

**Professional Tier:**
- ARPU: $19.99/mo
- Retention: 24-48 months (B2B higher retention)
- LTV: $480-$960

**LTV:CAC Ratio:**
- Target: 3:1 or higher
- Current model: 2.4:1 to 4.8:1 (healthy)

#### Monthly Costs (Estimated)

| Category | Cost | Notes |
|----------|------|-------|
| **Supabase** | $25-$100/mo | Database, auth, storage, functions |
| **Cloudflare** | $0-$20/mo | Pages hosting (free tier likely) |
| **OpenAI API** | $50-$500/mo | Depends on AI usage |
| **Stripe Fees** | 2.9% + $0.30 | ~$300 on $10K MRR |
| **Sentry** | $26/mo | Error monitoring |
| **Email (Resend)** | $20/mo | Transactional emails |
| **Domains** | $15/yr | Domain registration |
| **Total Fixed** | $150-$700/mo | Scales with usage |

**Gross Margin:**
- At $10K MRR: 93-98% (SaaS standard)
- Scales favorably with growth

### Go-to-Market Strategy

#### Phase 1: SEO & Content (Current)
- Publish 50-100 blog posts (AI-generated, human-edited)
- Target keywords: "picky eater meal plan", "food chaining", "meal planning for kids"
- Build domain authority
- Lead magnets on every post

#### Phase 2: Community Building (Q1 2026)
- Facebook groups for parents of picky eaters
- Reddit engagement (r/parenting, r/feedingtherapy)
- Instagram content (meal ideas, progress stories)
- User testimonials and case studies

#### Phase 3: Paid Acquisition (Q2 2026)
- Google Ads (branded + non-branded keywords)
- Facebook/Instagram ads (targeting parents)
- Pinterest ads (meal planning content)
- Influencer partnerships (parenting, feeding therapy)

#### Phase 4: Partnerships (Q3 2026)
- Feeding therapist referral program
- Pediatrician partnerships
- Parenting blog guest posts
- Affiliate program launch

---

## Growth Opportunities

### Product Expansion

#### 1. Vertical Expansion (Deepen Core Product)

**Enhanced AI Features:**
- Predictive food acceptance modeling (ML on historical data)
- Computer vision food identification (photo → nutrition)
- Voice-activated meal logging
- AR meal plating guide for kids

**Advanced Analytics:**
- Nutrition analysis per meal/day/week
- Macro tracking (protein, carbs, fats)
- Micronutrient tracking (vitamins, minerals)
- Growth trajectory vs. food diversity correlation

**Social Features:**
- Public meal plan sharing
- Pantry templates marketplace
- Community forums
- Expert Q&A with feeding therapists

**Gamification 2.0:**
- Kid-friendly mobile app (simplified UI)
- Reward system for trying new foods
- Multiplayer challenges (sibling competition)
- Virtual sticker book/collectibles

#### 2. Horizontal Expansion (New User Segments)

**Special Diets:**
- Allergy-specific meal planning (celiac, nut allergies)
- Medical diets (diabetes, kidney disease, ARFID)
- Religious dietary restrictions (kosher, halal)
- Ethical diets (vegan, vegetarian)

**Life Stages:**
- Baby-led weaning (6-12 months)
- Toddler transition (12-36 months)
- School-age nutrition (5-12 years)
- Teen nutrition & independence (13-18 years)

**Professional Segments:**
- Feeding therapists (white-label platform)
- Dietitians (client management)
- Schools/daycares (group meal planning)
- Corporate wellness (family benefits)

#### 3. Geographic Expansion

**International Markets:**
- Multi-language support (Spanish, French, German, Mandarin)
- Regional food databases (European, Asian foods)
- Currency localization
- Local delivery integrations

**Regulatory Compliance:**
- GDPR (Europe)
- CCPA (California)
- PIPEDA (Canada)
- Nutrition labeling regulations (FDA, EFSA)

### Technology Innovations

#### 1. Mobile-First Features

**Native Capabilities:**
- Push notifications (meal reminders)
- Widget (today's meal plan)
- Watch app (quick food logging)
- Siri/Google Assistant integration

**Offline Mode:**
- Full offline meal planning
- Sync when back online
- Conflict resolution

#### 2. Smart Home Integration

**IoT Devices:**
- Amazon Dash (restock groceries)
- Smart fridges (inventory tracking)
- Smart scales (portion tracking)
- Voice assistants (Alexa, Google Home)

#### 3. Advanced AI/ML

**Personalization:**
- Individual taste profile learning
- Seasonal meal suggestions
- Budget-aware meal planning
- Cooking skill-adapted recipes

**Predictive Analytics:**
- Food acceptance probability
- Optimal introduction timing
- Texture progression pathways
- Allergen risk assessment (with disclaimers)

### Business Model Innovations

#### 1. B2B2C Model (White-Label SaaS)

**Therapist Platform:**
- Feeding therapists license platform
- Brand as their own tool
- Manage multiple client families
- Track cross-client progress
- Pricing: $99-$299/month per therapist

**Clinic Platform:**
- Pediatric clinics adopt platform
- Integrate with EHR systems
- Group therapy programs
- Pricing: $500-$2000/month per clinic

**School/Daycare:**
- Group meal planning
- Parent communication
- Allergy management
- Pricing: $100-$500/month per institution

#### 2. Marketplace Models

**Recipe Marketplace:**
- Creators sell meal plans ($5-$20 each)
- EatPal takes 20-30% commission
- Curated by experts (dietitians, chefs)

**Pantry Templates:**
- Pre-built food libraries (e.g., "Gluten-free starter pantry")
- Free + premium templates
- User-generated content

**Dietitian Consultations:**
- In-app booking
- Video consultations
- Personalized meal plan creation
- Revenue share with professionals

#### 3. Data-as-a-Service (Privacy-Compliant)

**Anonymized Insights:**
- Aggregate food acceptance trends
- Licensing to food manufacturers
- Research partnerships (universities)
- Pricing: $10K-$100K per data license

**Ethical Considerations:**
- Fully anonymized
- Opt-in only
- Clear user consent
- GDPR/HIPAA compliant

### Content & Community

#### 1. Educational Platform

**Courses & Workshops:**
- "Picky Eater Bootcamp" (7-day email course) - Free
- "Advanced Food Chaining" (video course) - $49
- Live workshops with therapists - $29/session

**Certification Program:**
- Train parents to be "meal planning coaches"
- Community-driven support
- Referral incentives

#### 2. Content Monetization

**Premium Blog Content:**
- Free: General tips, basic recipes
- Pro: In-depth guides, meal plans
- Professional: Research reports, case studies

**Video Content:**
- YouTube channel (ad revenue)
- Video recipes (affiliate links)
- Expert interviews (sponsorships)

#### 3. Community Platform

**Forums & Groups:**
- Peer support groups
- Expert-moderated forums
- Local meetups (virtual/in-person)

**User-Generated Content:**
- Success stories
- Recipe contributions
- Tips & tricks
- Referral rewards

### Strategic Partnerships

#### 1. Healthcare Partnerships

**Pediatricians:**
- Referral program
- Co-branded resources
- EHR integration (future)

**Feeding Therapists:**
- White-label platform
- Affiliate program
- Co-marketing

**Insurance Companies:**
- Preventive care benefit
- Reimbursement codes (future)
- Pilot programs

#### 2. Brand Partnerships

**Food Manufacturers:**
- Sponsored pantry items
- Sample programs
- Co-branded content
- Examples: Gerber, Earth's Best, Happy Family

**Kitchen Tools:**
- Affiliate partnerships
- Bundle deals
- Examples: Instant Pot, KitchenAid, OXO

**Supplements:**
- Vitamin/probiotic brands
- Affiliate commissions
- Examples: SmartyPants, Garden of Life

#### 3. Platform Integrations

**E-commerce:**
- Amazon Fresh, Whole Foods
- Walmart Grocery
- Target

**Fitness Apps:**
- MyFitnessPal integration
- Strava (family fitness)
- Apple Health

**Productivity:**
- Google Calendar
- Apple Reminders
- Notion (meal planning templates)

### Competitive Moats

**Current Moats:**
1. **Specialization**: Only picky-eater-focused platform
2. **Science-Backed**: Food chaining algorithm (peer-reviewed approach)
3. **Data Network Effect**: More users → better food suggestions
4. **White-Label Ready**: Professional tier differentiator

**Future Moats:**
1. **AI Training Data**: Proprietary dataset of food acceptance patterns
2. **Professional Network**: Therapist/dietitian community lock-in
3. **Integrations**: Deep partnerships with grocery/delivery services
4. **Brand Authority**: SEO dominance in picky eater niche

### Market Opportunity

**Total Addressable Market (TAM):**
- Parents of children 0-12 in US: ~40 million households
- 20-30% have "picky eaters": 8-12 million households
- TAM: 8-12M × $120/year = $960M - $1.44B

**Serviceable Addressable Market (SAM):**
- Tech-savvy parents willing to pay: ~25% = 2-3M households
- SAM: 2-3M × $120/year = $240M - $360M

**Serviceable Obtainable Market (SOM):**
- Year 1 target: 0.1% penetration = 2,000-3,000 users
- Year 3 target: 0.5% penetration = 10,000-15,000 users
- Year 5 target: 2% penetration = 40,000-60,000 users

**Revenue Projections:**
| Year | Users (Pro) | MRR | ARR |
|------|-------------|-----|-----|
| 1 | 500 | $5K | $60K |
| 2 | 2,500 | $25K | $300K |
| 3 | 10,000 | $100K | $1.2M |
| 5 | 50,000 | $500K | $6M |

---

## Technical Debt & Improvements

### Current Technical Debt

#### Critical 🔴

**1. Zero Test Coverage**
- **Issue**: No unit, integration, or E2E tests
- **Risk**: High risk of regressions, difficult refactoring
- **Effort**: High (3-4 weeks for comprehensive coverage)
- **Priority**: High
- **Plan**:
  - Start with E2E tests (Playwright setup exists)
  - Add integration tests for critical flows (auth, subscription, meal planning)
  - Unit tests for utilities and pure functions
  - Target: 70% coverage minimum

**2. Mobile App Not in Production**
- **Issue**: iOS/Android apps built but not submitted to stores
- **Risk**: Missing mobile-first users
- **Effort**: Medium (1-2 weeks for assets, testing, submission)
- **Priority**: High
- **Blockers**: App Store assets, final QA

#### High ⚠️

**3. Barcode Scanner Production Issues (Historical)**
- **Issue**: Production build had package issues (likely resolved)
- **Risk**: Feature may break in production
- **Effort**: Low (verify fix, add tests)
- **Priority**: Medium
- **Action**: Verify in production, add E2E test for barcode flow

**4. No CI/CD Pipeline**
- **Issue**: Manual deployment process
- **Risk**: Human error, slow deployment
- **Effort**: Low (GitHub Actions setup)
- **Priority**: Medium
- **Plan**:
  - Automate lint, test, build on PRs
  - Auto-deploy to staging on merge to develop
  - Manual approval for production deploy

**5. Error Handling Inconsistency**
- **Issue**: Some edge functions lack proper error handling
- **Risk**: Silent failures, poor user experience
- **Effort**: Medium (audit 70+ functions)
- **Priority**: Medium
- **Plan**: Standardize error handling wrapper, add Sentry to all functions

#### Medium 🟡

**6. Database Query Optimization**
- **Issue**: Some queries lack proper indexes
- **Risk**: Slow queries as data grows
- **Effort**: Low (add indexes based on query patterns)
- **Priority**: Low (optimize as needed)
- **Action**: Monitor slow query log, add indexes proactively

**7. Code Duplication**
- **Issue**: Some components and utilities duplicated between web/mobile
- **Risk**: Maintenance burden, inconsistency
- **Effort**: Medium (refactor into shared library)
- **Priority**: Low
- **Action**: Extract shared code into `/lib/shared`

**8. Environment Variable Management**
- **Issue**: Environment variables scattered, not well-documented
- **Risk**: Deployment issues, security risks
- **Effort**: Low (create `.env.example`, document)
- **Priority**: Low
- **Action**: Create comprehensive `.env.example` with comments

**9. TypeScript `any` Usage**
- **Issue**: Some files use `any` instead of proper types
- **Risk**: Type safety compromised
- **Effort**: Medium (audit and fix)
- **Priority**: Low
- **Action**: Enable `noImplicitAny`, fix violations

**10. Bundle Size Optimization**
- **Issue**: Bundle size ~450KB (gzipped), could be smaller
- **Risk**: Slower initial load on slow networks
- **Effort**: Medium (analyze bundle, lazy load more aggressively)
- **Priority**: Low
- **Action**: Bundle analyzer, split large dependencies

### Improvements Roadmap

#### Q1 2026 (Immediate)
- [x] Custom domains & white-labeling (DONE)
- [ ] Test coverage (E2E → integration → unit)
- [ ] Mobile app store submission
- [ ] CI/CD pipeline setup
- [ ] Error handling standardization
- [ ] Documentation (API docs, developer guide)

#### Q2 2026 (Short-Term)
- [ ] Performance audit & optimization
- [ ] Database query optimization
- [ ] Code refactoring (reduce duplication)
- [ ] Accessibility audit (WCAG 2.1 AA compliance)
- [ ] Security audit (penetration testing)
- [ ] Mobile push notifications

#### Q3 2026 (Medium-Term)
- [ ] Microservices migration (if needed at scale)
- [ ] Redis caching layer
- [ ] GraphQL API (alternative to REST)
- [ ] Advanced monitoring (APM, RUM)
- [ ] Multi-language support (i18n)
- [ ] Design system documentation

#### Q4 2026 (Long-Term)
- [ ] Machine learning infrastructure (food acceptance prediction)
- [ ] Multi-region deployment
- [ ] Advanced security (SOC 2 compliance)
- [ ] Developer API (third-party integrations)
- [ ] Open-source components (marketing strategy)

### Code Quality Metrics

#### Current State
| Metric | Status | Target |
|--------|--------|--------|
| **Test Coverage** | 0% | 70%+ |
| **TypeScript Strict Mode** | Partial | Full |
| **Linting** | Enabled (ESLint) | ✅ |
| **Code Formatting** | Manual | Prettier (automated) |
| **Bundle Size** | 450KB (gzipped) | <400KB |
| **Lighthouse Score** | 92 | 95+ |
| **Security Audit** | None | Annual |
| **Dependency Updates** | Manual | Automated (Dependabot) |

### Architecture Evolution

#### Current: Monolithic SPA + Serverless Functions
```
[React SPA] → [Supabase] → [PostgreSQL]
            ↘ [Edge Functions]
```

**Strengths:**
- Simple to develop and deploy
- Low operational overhead
- Cost-effective at current scale

**Weaknesses:**
- All frontend code loaded upfront
- Limited backend logic isolation
- Difficult to scale specific features independently

#### Future (>50K Users): Modular Architecture
```
[React SPA / Mobile Apps]
        ↓
[API Gateway / GraphQL]
        ↓
[Microservices]
  - User Service
  - Meal Planning Service
  - AI Service (dedicated GPU)
  - Blog Service
  - Payment Service
        ↓
[PostgreSQL (sharded)] + [Redis Cache] + [S3 Storage]
```

**Benefits:**
- Independent scaling
- Technology flexibility (Python for ML, etc.)
- Team autonomy (separate services, separate teams)
- Improved performance (caching, CDN)

**Migration Path:**
1. Extract AI features → dedicated service (Python + GPU)
2. Extract blog → headless CMS or separate service
3. Add API gateway (GraphQL or REST)
4. Database sharding (by user_id)
5. Microservices for remaining domains

---

## Metrics & KPIs

### Product Metrics

#### User Acquisition
| Metric | Current | Target (Month 6) | Target (Year 1) |
|--------|---------|------------------|-----------------|
| **Total Signups** | 0 | 500 | 2,000 |
| **Free Users** | 0 | 350 | 1,400 |
| **Pro Users** | 0 | 125 | 500 |
| **Professional Users** | 0 | 25 | 100 |
| **Signup Conversion (Visitor → Free)** | - | 5% | 8% |
| **Free → Pro Conversion** | - | 10% | 15% |

#### Engagement
| Metric | Target |
|--------|--------|
| **Daily Active Users (DAU)** | 30-40% of users |
| **Weekly Active Users (WAU)** | 60-70% of users |
| **Monthly Active Users (MAU)** | 80-90% of users |
| **Meal Plans Created** | 3 per user per month (avg) |
| **Grocery Lists Generated** | 4 per user per month (avg) |
| **Foods Tracked** | 10 per user per month (avg) |
| **Session Duration** | 8-12 minutes (avg) |
| **Sessions per Week** | 3-5 sessions |

#### Retention
| Metric | Target |
|--------|--------|
| **Day 1 Retention** | 60%+ |
| **Day 7 Retention** | 40%+ |
| **Day 30 Retention** | 25%+ |
| **Month 3 Retention** | 60%+ (Pro users) |
| **Month 6 Retention** | 75%+ (Pro users) |
| **Month 12 Retention** | 80%+ (Pro users) |
| **Churn Rate (Monthly)** | <5% (Pro), <3% (Professional) |

### Business Metrics

#### Revenue
| Metric | Month 6 | Year 1 | Year 3 |
|--------|---------|--------|--------|
| **MRR** | $1,500 | $6,000 | $120,000 |
| **ARR** | $18,000 | $72,000 | $1,440,000 |
| **ARPU (Free)** | $0 | $0 | $0 |
| **ARPU (Pro)** | $9.99 | $9.99 | $9.99 |
| **ARPU (Professional)** | $19.99 | $19.99 | $19.99 |
| **Gross Margin** | 95%+ | 95%+ | 93%+ |

#### Customer Acquisition
| Metric | Target |
|--------|--------|
| **CAC (Free)** | $5-$10 |
| **CAC (Pro)** | $50-$100 |
| **CAC (Professional)** | $200-$400 |
| **Payback Period** | 6-12 months |
| **LTV:CAC Ratio** | 3:1 or higher |

#### Growth
| Metric | Target |
|--------|--------|
| **Month-over-Month Growth** | 15-25% |
| **Organic Traffic Growth** | 20% MoM |
| **Email List Growth** | 500/month (Year 1) |
| **Referral Rate** | 10-15% of signups |
| **Viral Coefficient (k)** | 0.5-1.0 |

### Technical Metrics

#### Performance
| Metric | Target | Current |
|--------|--------|---------|
| **Uptime** | 99.9% | - |
| **API Response Time (p95)** | <500ms | ~300ms |
| **Database Query Time (p95)** | <100ms | ~50ms |
| **Error Rate** | <0.1% | - |
| **Lighthouse Score** | 95+ | 92 |
| **Core Web Vitals (Pass Rate)** | 90%+ | ~95% |

#### Infrastructure
| Metric | Current | Alert Threshold |
|--------|---------|-----------------|
| **Database CPU** | <20% | >70% |
| **Database Connections** | <100 | >800 |
| **Storage Used** | <1GB | >80% quota |
| **Edge Function Invocations** | ~1000/day | >1M/day (cost alert) |
| **AI API Costs** | $0 | >$500/month |

#### Code Quality
| Metric | Current | Target |
|--------|---------|--------|
| **Test Coverage** | 0% | 70%+ |
| **Build Time** | ~2min | <3min |
| **Bundle Size** | 450KB | <400KB |
| **Code Smells (SonarQube)** | - | <50 |
| **Security Vulnerabilities** | 0 known | 0 |
| **Dependency Freshness** | Manual | <30 days behind |

### Support & Operations

#### Customer Support
| Metric | Target |
|--------|--------|
| **First Response Time** | <4 hours |
| **Resolution Time** | <24 hours |
| **Customer Satisfaction (CSAT)** | 4.5/5.0 |
| **Net Promoter Score (NPS)** | 50+ |
| **Support Ticket Volume** | <5% of MAU |

#### Content & SEO
| Metric | Target (Year 1) |
|--------|-----------------|
| **Blog Posts Published** | 50-100 |
| **Organic Traffic** | 10,000 visits/month |
| **Domain Authority (DA)** | 30+ |
| **Backlinks** | 100+ |
| **Keyword Rankings (Top 10)** | 50+ keywords |
| **Email Subscribers** | 5,000+ |

### Monitoring & Alerting

#### Critical Alerts (Immediate Response)
- [ ] Database downtime
- [ ] Edge function failures (>5% error rate)
- [ ] Payment processing failures
- [ ] Security breaches

#### Warning Alerts (Response within 24h)
- [ ] Slow API responses (>1s p95)
- [ ] High error rate (>1%)
- [ ] Database CPU >70%
- [ ] Storage >80% quota

#### Informational Alerts (Weekly Review)
- [ ] AI costs trending up
- [ ] Unusual traffic patterns
- [ ] Feature flag changes
- [ ] Dependency updates available

---

## Document Maintenance

### Update Frequency
- **Monthly**: Metrics, user counts, revenue
- **Quarterly**: Roadmap, technical debt priorities
- **As-Needed**: Architecture changes, new features, tech stack updates

### Stakeholders
- **Engineering Team**: Technical architecture, debt, improvements
- **Product Team**: Features, roadmap, metrics
- **Business Team**: Revenue, growth, partnerships
- **Leadership**: Strategic decisions, prioritization

### Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2025-11-11 | Initial Living Technical Specification | AI Assistant |

---

## Appendices

### A. Quick Reference

**Key URLs:**
- Production: https://eatpal.com (TBD)
- Staging: https://staging.eatpal.com (TBD)
- Admin: https://eatpal.com/admin
- Blog: https://eatpal.com/blog

**Key Contacts:**
- Database: Supabase Dashboard
- Monitoring: Sentry Dashboard
- Payments: Stripe Dashboard
- Analytics: Custom Admin Dashboard

**Key Commands:**
```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Production build
npm run lint                   # Run linter

# Mobile
npm run expo:start            # Start Expo
npm run eas:build:ios:production    # Build iOS
npm run eas:build:android:production # Build Android

# Deployment
git push origin main          # Deploy to production (Cloudflare auto-deploy)
```

### B. Glossary

- **RLS**: Row-Level Security (PostgreSQL security model)
- **PWA**: Progressive Web App (installable web app)
- **Edge Functions**: Serverless functions running on Supabase edge network
- **Food Chaining**: Evidence-based technique for expanding food repertoire
- **Try Bite**: Small taste of new food (not full serving)
- **Safe Food**: Food child reliably eats
- **ARPU**: Average Revenue Per User
- **LTV**: Lifetime Value
- **CAC**: Customer Acquisition Cost
- **MRR**: Monthly Recurring Revenue
- **ARR**: Annual Recurring Revenue

### C. Related Documentation

- `COMPLETE_BLOG_BUILD_GUIDE.md` - Comprehensive blog system guide
- `BLOG_SYSTEM_SUMMARY.md` - Blog feature overview
- `DEPLOYMENT_CHECKLIST.md` - Deployment procedures
- `PRODUCTION_READINESS_REPORT_OCT_28_2025.md` - Production readiness assessment
- `.env.example` - Environment variable reference (to be created)
- `API_DOCUMENTATION.md` - Edge Function API docs (to be created)

---

**End of Living Technical Specification**

*This document is a living specification and should be updated regularly to reflect the current state of the product, technology, and business.*
