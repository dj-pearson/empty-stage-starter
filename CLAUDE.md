# CLAUDE.md - AI Assistant Guide for Munch Maker Mate (EatPal)

> **Last Updated**: 2025-11-28
> **Project**: Meal Planning & Nutrition Tracking Application
> **Stack**: Vite + React 19 + TypeScript + Supabase + Expo

## Table of Contents

1. [Project Overview](#project-overview)
2. [Codebase Structure](#codebase-structure)
3. [Development Workflows](#development-workflows)
4. [Key Conventions](#key-conventions)
5. [State Management](#state-management)
6. [Database & Backend](#database--backend)
7. [Testing Guidelines](#testing-guidelines)
8. [Common Tasks](#common-tasks)
9. [Troubleshooting](#troubleshooting)
10. [Changelog](#changelog)

---

## Project Overview

**Munch Maker Mate** (branded as EatPal) is a comprehensive meal planning and nutrition tracking application for families, featuring mobile barcode scanning to easily add food items to your database.

### Core Features
- Multi-child meal planning with allergen tracking
- Recipe management with nutrition analysis
- AI-powered meal planning and coaching
- Grocery list generation with Instacart integration
- Food chaining therapy tools for picky eaters
- Mobile barcode scanning (iOS & Android)
- Budget calculator with USDA data
- Subscription-based SaaS model (Stripe integration)

### Recent Additions (Nov 2025)
- **3D Hero Scene**: Interactive Three.js powered landing page with floating food elements
- **SEO Structured Data**: JSON-LD schema components for rich search results
- **PWA Support**: App installation prompts and offline capabilities
- **Optimized Images**: Lazy loading, WebP/AVIF support, LCP optimization
- **Conversion Tracking**: User journey funnel analytics dashboard
- **Accessibility Improvements**: ARIA labels, reduced motion support, keyboard navigation

### Tech Stack Summary
- **Frontend**: Vite 7.1.12, React 19.1, TypeScript 5.8.3
- **UI**: shadcn-ui (53 components), Tailwind CSS 3.4.17
- **3D Graphics**: Three.js 0.159, @react-three/fiber 9.0, @react-three/drei 10.7
- **Animation**: Framer Motion 12.23, GSAP 3.13, Lottie 3.6
- **Routing**: React Router v6.30 (41 pages)
- **Backend**: Supabase 2.74 (PostgreSQL, Auth, Real-time, Edge Functions)
- **Mobile**: Expo 54.0 + Expo Router v6.0.12
- **Deployment**: Cloudflare Pages (web), EAS Build (mobile)
- **Testing**: Vitest 3.0 (unit), Playwright 1.56 (E2E)
- **Monitoring**: Sentry 10.19 with session replay + Vite plugin for sourcemaps

---

## Codebase Structure

### Directory Layout

```
/
├── src/
│   ├── components/          # 242 total components
│   │   ├── ui/             # 53 shadcn-ui components (button, dialog, etc.)
│   │   ├── admin/          # Admin dashboard components
│   │   ├── blog/           # Blog-related components
│   │   ├── budget/         # Budget calculator UI
│   │   ├── quiz/           # Picky eater quiz
│   │   ├── schema/         # SEO structured data (JSON-LD) components
│   │   └── [feature]/      # Feature-specific components
│   ├── contexts/           # React Context providers
│   │   └── AppContext.tsx  # Main application state (~960 lines)
│   ├── hooks/              # 33 custom React hooks
│   │   └── index.ts        # Centralized hook exports
│   ├── integrations/       # External service integrations
│   │   └── supabase/       # Supabase client & types
│   ├── lib/                # Business logic & utilities (39 files)
│   │   ├── budgetCalculator/
│   │   ├── mealPlanGenerator/
│   │   ├── quiz/
│   │   ├── integrations/   # Instacart API, etc.
│   │   ├── analytics.ts
│   │   ├── sentry.tsx
│   │   ├── platform.ts     # Platform detection (web/mobile)
│   │   ├── seo-config.ts   # SEO configuration
│   │   ├── seo-helpers.ts  # SEO utility functions
│   │   ├── pwa.ts          # PWA utilities
│   │   └── utils.ts
│   ├── pages/              # 41 page components
│   │   ├── dashboard/      # Protected dashboard routes
│   │   ├── Landing.tsx
│   │   ├── Auth.tsx
│   │   └── [page].tsx
│   ├── styles/             # Global styles
│   ├── test/               # Test setup & utilities
│   ├── types/              # TypeScript type definitions
│   └── main.tsx            # Web entry point
├── functions/              # Supabase Edge Functions
│   └── sitemap.xml.ts
├── supabase/
│   ├── migrations/         # Database migration files
│   └── config.toml
├── tests/                  # E2E tests (Playwright)
├── scripts/                # Build & utility scripts
├── public/                 # Static assets
├── index.mobile.js         # Mobile entry point (Expo)
├── app.config.js           # Expo configuration
├── vite.config.ts          # Vite build configuration
├── tailwind.config.ts      # Tailwind CSS config
├── tsconfig.json           # TypeScript config
├── vitest.config.ts        # Unit test config
├── playwright.config.ts    # E2E test config
├── metro.config.cjs        # React Native bundler
└── wrangler.toml           # Cloudflare Pages config
```

### Key File Locations

| Purpose | Location | Notes |
|---------|----------|-------|
| **App Entry (Web)** | `src/main.tsx` | Renders React app, sets up providers |
| **App Entry (Mobile)** | `index.mobile.js` | Expo Router entry |
| **Routing** | `src/App.tsx` | React Router configuration, 41 routes |
| **Global State** | `src/contexts/AppContext.tsx` | Context provider for app-wide state |
| **Supabase Client** | `src/integrations/supabase/client.ts` | Singleton Supabase client instance |
| **Database Types** | `src/integrations/supabase/types.ts` | Auto-generated from Supabase schema |
| **Custom Hooks** | `src/hooks/` | Reusable hooks (storage, media queries, etc.) |
| **UI Components** | `src/components/ui/` | shadcn-ui components (DO NOT modify directly) |
| **Feature Components** | `src/components/` | Custom components (safe to modify) |
| **SEO Schema Components** | `src/components/schema/` | JSON-LD structured data for SEO |
| **Utilities** | `src/lib/utils.ts` | Helper functions (cn, date formatting, etc.) |
| **Platform Utils** | `src/lib/platform.ts` | Web/mobile detection & storage abstraction |
| **SEO Config** | `src/lib/seo-config.ts` | SEO configuration and metadata |
| **PWA Utils** | `src/lib/pwa.ts` | Progressive Web App utilities |

---

## Development Workflows

### Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd empty-stage-starter

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server (web)
npm run dev
# Opens at http://localhost:8080

# Start development server (mobile)
npm run expo:start
```

### Environment Variables Required

```env
# Required for basic functionality
VITE_SUPABASE_URL=https://tbuszxkevkpjcjapbrir.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>

# Optional: Enable error monitoring
VITE_SENTRY_DSN=<your-sentry-dsn>
VITE_SENTRY_ENABLED=true

# Sentry Vite Plugin (for production sourcemaps)
SENTRY_ORG=<your-sentry-org>
SENTRY_PROJECT=<your-sentry-project>
SENTRY_AUTH_TOKEN=<your-sentry-auth-token>

# Optional: Email notifications
EMAIL_PROVIDER=resend
RESEND_API_KEY=<your-key>
EMAIL_FROM=noreply@eatpal.com

# Optional: SEO & Analytics APIs
PAGESPEED_INSIGHTS_API_KEY=<your-google-pagespeed-api-key>  # Free

# Optional: Backlink tracking (choose one)
AHREFS_API_KEY=<your-ahrefs-api-key>
MOZ_ACCESS_ID=<your-moz-access-id>
MOZ_SECRET_KEY=<your-moz-secret-key>

# Optional: Google Search Console OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://your-domain.com/oauth/callback
```

### Development Commands

```bash
# Web Development
npm run dev              # Start Vite dev server (port 8080)
npm run build            # Production build
npm run build:dev        # Development build with sourcemaps
npm run preview          # Preview production build (port 3000)

# Mobile Development
npm run expo:start       # Start Expo dev server
npm run expo:android     # Run on Android emulator
npm run expo:ios         # Run on iOS simulator
npm run expo:web         # Run in web browser
npm run expo:clear       # Clear Expo cache

# Testing
npm run test             # Run Vitest in watch mode
npm run test:ui          # Vitest UI
npm run test:run         # Run tests once
npm run test:coverage    # Generate coverage report
npm run test:e2e         # Run Playwright E2E tests
npm run test:e2e:ui      # Playwright UI mode
npm run test:e2e:debug   # Playwright debug mode

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format with Prettier
npm run format:check     # Check formatting

# Utilities
npm run analyze:bundle   # Analyze bundle size
npm run optimize:images  # Optimize images with Sharp
```

### Git Workflow

1. **Branch Naming**: Feature branches should be descriptive
   ```bash
   git checkout -b feature/add-meal-sharing
   git checkout -b fix/grocery-list-sync
   git checkout -b refactor/state-management
   ```

2. **Commit Messages**: Follow conventional commits
   ```
   feat: add meal sharing functionality
   fix: resolve grocery list sync issue
   refactor: optimize state management
   docs: update API documentation
   test: add tests for meal planner
   ```

3. **Before Committing**:
   ```bash
   npm run lint              # Fix linting issues
   npm run format            # Format code
   npm run test:run          # Ensure tests pass
   ```

### Creating New Components

#### shadcn-ui Component (DO NOT create manually)
```bash
# Use shadcn-ui CLI to add pre-built components
npx shadcn-ui@latest add [component-name]

# Example:
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
```

#### Custom Component Pattern

**Location**: `src/components/[feature]/ComponentName.tsx`

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

interface ComponentNameProps {
  className?: string;
  // Add other props
}

export function ComponentName({ className }: ComponentNameProps) {
  const { foods, addFood } = useApp(); // Access global state
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Card className={cn('p-4', className)}>
      {/* Component content */}
      <Button onClick={() => {}}>
        Action
      </Button>
    </Card>
  );
}
```

### Creating New Pages

1. **Create page component**: `src/pages/MyNewPage.tsx`

```typescript
import { Helmet } from 'react-helmet-async';

export default function MyNewPage() {
  return (
    <>
      <Helmet>
        <title>Page Title - EatPal</title>
        <meta name="description" content="Page description" />
      </Helmet>

      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Page Title</h1>
        {/* Page content */}
      </div>
    </>
  );
}
```

2. **Add route to App.tsx**:

```typescript
import { lazy } from 'react';

const MyNewPage = lazy(() => import('@/pages/MyNewPage'));

// In routes:
<Route path="/my-new-page" element={
  <Suspense fallback={<LoadingFallback />}>
    <MyNewPage />
  </Suspense>
} />
```

3. **For protected routes**:

```typescript
<Route path="/dashboard/my-feature" element={
  <ProtectedRoute>
    <Suspense fallback={<LoadingFallback />}>
      <MyNewPage />
    </Suspense>
  </ProtectedRoute>
} />
```

### Using SEO Schema Components

**Location**: `src/components/schema/`

The schema components generate JSON-LD structured data for rich search results:

```typescript
import { ArticleSchema } from '@/components/schema/ArticleSchema';
import { FAQSchema } from '@/components/schema/FAQSchema';
import { BreadcrumbSchema } from '@/components/schema/BreadcrumbSchema';

// In a blog post page:
export default function BlogPost({ post }) {
  return (
    <>
      <ArticleSchema
        headline={post.title}
        description={post.excerpt}
        image={post.featuredImage}
        datePublished={post.publishedAt}
        dateModified={post.updatedAt}
        author={post.author}
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: '/' },
          { name: 'Blog', url: '/blog' },
          { name: post.title, url: `/blog/${post.slug}` }
        ]}
      />
      {/* Page content */}
    </>
  );
}
```

Available schema components:
- `ArticleSchema` - Blog posts and articles
- `FAQSchema` - FAQ pages
- `BreadcrumbSchema` - Navigation breadcrumbs
- `HowToSchema` - How-to guides
- `OrganizationSchema` - Company information
- `SoftwareAppSchema` - App store listings

### Using Optimized Images

**Location**: `src/components/OptimizedImage.tsx`

```typescript
import { OptimizedImage } from '@/components/OptimizedImage';

// Above-fold image (eager loading, high priority)
<OptimizedImage
  src="/hero-image.webp"
  alt="Hero description"
  width={1200}
  height={600}
  priority  // Loads immediately for LCP
/>

// Below-fold image (lazy loading)
<OptimizedImage
  src="/feature-image.webp"
  alt="Feature description"
  width={800}
  height={400}
  // Lazy loads automatically
/>

// Decorative image (hidden from screen readers)
<OptimizedImage
  src="/decoration.webp"
  alt=""
  decorative
/>
```

### Using 3D Components

**Location**: `src/components/ThreeDHeroScene.tsx`, `src/components/LazyFoodOrbit.tsx`

```typescript
import { lazy, Suspense } from 'react';

const ThreeDHeroScene = lazy(() => import('@/components/ThreeDHeroScene'));

// In your landing page:
<Suspense fallback={<div className="h-screen bg-gradient-to-b from-primary/10" />}>
  <ThreeDHeroScene />
</Suspense>
```

The 3D scene:
- Uses Three.js with @react-three/fiber
- Includes floating food emojis and glass-effect shapes
- Respects `prefers-reduced-motion` for accessibility
- Lazy loads to minimize initial bundle size

### Using PWA Components

**Location**: `src/components/AppInstallPrompt.tsx`

```typescript
import { AppInstallPrompt } from '@/components/AppInstallPrompt';

// Add to your layout or app root:
<AppInstallPrompt />
```

The install prompt:
- Detects Chrome/Edge `beforeinstallprompt` event
- Shows iOS-specific instructions on Safari
- Remembers dismissed state for 7 days
- Checks if already installed via `display-mode: standalone`

### Adding Database Tables

1. **Create migration file**:
   ```bash
   # Use Supabase CLI
   supabase migration new add_new_table
   ```

2. **Edit migration** in `supabase/migrations/[timestamp]_add_new_table.sql`:

```sql
-- Create table
CREATE TABLE public.my_table (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_my_table_user_id ON public.my_table(user_id);

-- Enable RLS
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own records"
  ON public.my_table FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own records"
  ON public.my_table FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own records"
  ON public.my_table FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own records"
  ON public.my_table FOR DELETE
  USING (auth.uid() = user_id);
```

3. **Apply migration**:
   ```bash
   supabase db push
   ```

4. **Regenerate types**:
   ```bash
   supabase gen types typescript --local > src/integrations/supabase/types.ts
   ```

---

## Key Conventions

### TypeScript Guidelines

1. **Interfaces over Types** for object shapes
   ```typescript
   // Preferred
   interface User {
     id: string;
     name: string;
   }

   // Use 'type' for unions, primitives
   type Status = 'active' | 'inactive';
   ```

2. **Use Database Types** from Supabase
   ```typescript
   import type { Database } from '@/integrations/supabase/types';

   type Food = Database['public']['Tables']['foods']['Row'];
   type FoodInsert = Database['public']['Tables']['foods']['Insert'];
   type FoodUpdate = Database['public']['Tables']['foods']['Update'];
   ```

3. **Component Props Naming**
   ```typescript
   interface ComponentNameProps {
     // Props here
   }
   ```

### Styling Conventions

1. **Use Tailwind utility classes**
   ```typescript
   <div className="flex items-center gap-4 p-6 bg-background">
   ```

2. **Use `cn()` for conditional classes**
   ```typescript
   import { cn } from '@/lib/utils';

   <div className={cn(
     'base-classes',
     isActive && 'active-classes',
     className // Allow prop override
   )}>
   ```

3. **Theme-aware styling** (dark mode support)
   ```typescript
   // Use semantic color tokens
   className="bg-background text-foreground"
   className="bg-card text-card-foreground"
   className="bg-primary text-primary-foreground"

   // Don't hardcode colors
   // ❌ className="bg-white text-black"
   // ✅ className="bg-background text-foreground"
   ```

4. **Responsive design**
   ```typescript
   className="flex flex-col md:flex-row gap-4 p-4 md:p-6"
   ```

### Component Patterns

1. **Export named components** (not default for regular components)
   ```typescript
   // ✅ Preferred
   export function MyComponent() {}

   // ❌ Avoid
   export default function MyComponent() {}

   // Exception: Pages can use default export
   ```

2. **Destructure props in function signature**
   ```typescript
   export function Component({
     title,
     isActive = false, // Default values
     onClick
   }: ComponentProps) {
     // ...
   }
   ```

3. **Co-locate related code**
   ```typescript
   // Keep related types, constants near component
   const MAX_ITEMS = 10;

   interface Item {
     id: string;
     name: string;
   }

   export function ItemList() {
     // Component implementation
   }
   ```

### File Naming

- **Components**: PascalCase - `MyComponent.tsx`
- **Utilities**: camelCase - `dateUtils.ts`
- **Hooks**: camelCase with `use` prefix - `useLocalStorage.ts`
- **Pages**: PascalCase - `Dashboard.tsx`
- **Types**: camelCase - `types.ts`
- **Tests**: Match source file - `MyComponent.test.tsx`

### Import Organization

```typescript
// 1. External dependencies
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. UI components
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// 3. Custom components
import { MyComponent } from '@/components/MyComponent';

// 4. Hooks
import { useApp } from '@/contexts/AppContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// 5. Utilities
import { cn } from '@/lib/utils';

// 6. Types
import type { Database } from '@/integrations/supabase/types';
```

### Error Handling

1. **Use try-catch for async operations**
   ```typescript
   try {
     await supabase.from('foods').insert(newFood);
     toast.success('Food added successfully');
   } catch (error) {
     console.error('Error adding food:', error);
     toast.error('Failed to add food');
   }
   ```

2. **Provide user feedback**
   ```typescript
   import { toast } from 'sonner';

   toast.success('Operation successful');
   toast.error('Something went wrong');
   toast.loading('Processing...');
   ```

3. **Validate inputs with Zod**
   ```typescript
   import { z } from 'zod';

   const foodSchema = z.object({
     name: z.string().min(1, 'Name is required'),
     calories: z.number().min(0),
   });

   const result = foodSchema.safeParse(data);
   if (!result.success) {
     toast.error(result.error.errors[0].message);
     return;
   }
   ```

### Performance Best Practices

1. **Lazy load routes and heavy components**
   ```typescript
   const HeavyComponent = lazy(() => import('./HeavyComponent'));

   <Suspense fallback={<LoadingSpinner />}>
     <HeavyComponent />
   </Suspense>
   ```

2. **Memoize expensive computations**
   ```typescript
   import { useMemo } from 'react';

   const expensiveValue = useMemo(() => {
     return computeExpensiveValue(data);
   }, [data]);
   ```

3. **Use useCallback for event handlers passed to children**
   ```typescript
   import { useCallback } from 'react';

   const handleClick = useCallback(() => {
     // Handler logic
   }, [dependencies]);
   ```

4. **Avoid unnecessary re-renders**
   ```typescript
   import { memo } from 'react';

   export const MyComponent = memo(function MyComponent({ data }) {
     // Component implementation
   });
   ```

### Accessibility Guidelines

1. **Always provide semantic HTML**
   ```typescript
   // ✅ Good
   <button onClick={handleClick}>Click me</button>

   // ❌ Bad
   <div onClick={handleClick}>Click me</div>
   ```

2. **Use ARIA labels when needed**
   ```typescript
   <button aria-label="Close dialog" onClick={onClose}>
     <X className="h-4 w-4" />
   </button>
   ```

3. **Keyboard navigation support**
   ```typescript
   import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';

   const handleKeyDown = (e: KeyboardEvent) => {
     if (e.key === 'Escape') onClose();
     if (e.key === 'Enter') onSubmit();
   };
   ```

---

## State Management

### AppContext (Primary State)

**Location**: `src/contexts/AppContext.tsx`

The AppContext is the single source of truth for application-wide state. It manages:
- Foods, Recipes, Kids, Plan Entries, Grocery Items
- Dual storage: localStorage (fallback) + Supabase (primary)
- Real-time synchronization
- Offline support

#### Using AppContext

```typescript
import { useApp } from '@/contexts/AppContext';

export function MyComponent() {
  const {
    foods,
    addFood,
    updateFood,
    deleteFood,
    kids,
    activeKidId,
    setActiveKidId
  } = useApp();

  const handleAddFood = async () => {
    await addFood({
      name: 'Apple',
      category: 'fruit',
      is_safe: true,
    });
  };

  return <div>{/* Component */}</div>;
}
```

#### Important AppContext Methods

```typescript
// Foods
addFood(food: Partial<Food>): Promise<void>
updateFood(id: string, updates: Partial<Food>): Promise<void>
deleteFood(id: string): Promise<void>
addFoods(foods: Partial<Food>[]): Promise<void>  // Bulk operation
updateFoods(updates: { id: string, data: Partial<Food> }[]): Promise<void>

// Kids
addKid(kid: Partial<Kid>): Promise<void>
updateKid(id: string, updates: Partial<Kid>): Promise<void>
deleteKid(id: string): Promise<void>

// Recipes
addRecipe(recipe: Partial<Recipe>): Promise<void>
updateRecipe(id: string, updates: Partial<Recipe>): Promise<void>
deleteRecipe(id: string): Promise<void>

// Plan Entries
addPlanEntry(entry: Partial<PlanEntry>): Promise<void>
updatePlanEntry(id: string, updates: Partial<PlanEntry>): Promise<void>
deletePlanEntry(id: string): Promise<void>
copyWeekPlan(fromDate: string, toDate: string, kidId: string): Promise<void>
deleteWeekPlan(weekStart: string, kidId: string): Promise<void>

// Grocery Items
addGroceryItem(item: Partial<GroceryItem>): Promise<void>
updateGroceryItem(id: string, updates: Partial<GroceryItem>): Promise<void>
deleteGroceryItem(id: string): Promise<void>
```

### Data Flow

```
User Action
    ↓
Component Event Handler
    ↓
AppContext Method
    ↓
1. Update Local State (immediate UI update)
2. Save to Supabase (async)
3. Save to localStorage (backup)
    ↓
Real-time Subscription (if changed by another user/device)
    ↓
Debounced State Update (300ms)
    ↓
Component Re-render
```

### Custom Hooks

**Location**: `src/hooks/` (33 hooks total)

#### Storage Hooks
```typescript
import { useLocalStorage } from '@/hooks/useLocalStorage';

const [value, setValue] = useLocalStorage('key', defaultValue);
```

#### Media Query Hooks
```typescript
import { useIsMobile, useIsTablet, useIsDesktop } from '@/hooks';

const isMobile = useIsMobile();    // < 768px
const isTablet = useIsTablet();    // 768px - 1024px
const isDesktop = useIsDesktop();  // > 1024px
```

#### Subscription Hook
```typescript
import { useSubscription } from '@/hooks/useSubscription';

const {
  subscription,
  isLoading,
  canUpgrade,
  canCancel,
  upgradeSubscription,
  cancelSubscription
} = useSubscription();

// subscription = { status: 'active' | 'trialing' | 'past_due' | 'canceled', ... }
```

#### Accessibility Hooks
```typescript
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';

const prefersReducedMotion = useReducedMotion();  // Respects prefers-reduced-motion
```

#### Viewport & Interaction Hooks
```typescript
import { useInView } from '@/hooks/useInView';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useWindowSize } from '@/hooks/useWindowSize';

const isInView = useInView(ref);  // Intersection observer
const { width, height } = useWindowSize();
```

#### Utility Hooks
```typescript
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useLazyComponent } from '@/hooks/useLazyComponent';

const { state, undo, redo, canUndo, canRedo } = useUndoRedo(initialState);
const isFeatureEnabled = useFeatureFlag('feature-name');
```

---

## Database & Backend

### Supabase Configuration

**Client Location**: `src/integrations/supabase/client.ts`

```typescript
import { supabase } from '@/integrations/supabase/client';

// Query data
const { data, error } = await supabase
  .from('foods')
  .select('*')
  .eq('user_id', userId);

// Insert data
const { data, error } = await supabase
  .from('foods')
  .insert({ name: 'Apple', category: 'fruit' });

// Update data
const { data, error } = await supabase
  .from('foods')
  .update({ is_safe: true })
  .eq('id', foodId);

// Delete data
const { data, error } = await supabase
  .from('foods')
  .delete()
  .eq('id', foodId);
```

### Core Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `kids` | Child profiles | id, name, age, allergens, profile_picture_url |
| `foods` | Food items | id, name, category, is_safe, allergens, nutrition_info |
| `recipes` | Recipe definitions | id, name, food_ids, instructions, nutrition_info |
| `plan_entries` | Meal plan entries | id, kid_id, date, meal_slot, food_id, result |
| `grocery_items` | Grocery list items | id, name, quantity, unit, checked, category |
| `grocery_lists` | Grocery list groups | id, name, icon, color, store_name |
| `user_subscriptions` | Subscription status | id, user_id, plan_id, status, stripe_subscription_id |

### Recent Database Tables (Nov 2025)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `meal_plan_templates` | Reusable meal plan templates | id, name, meals, user_id |
| `push_notifications` | Push notification subscriptions | id, user_id, endpoint, keys |
| `recipe_scaling` | Recipe serving adjustments | id, recipe_id, original_servings, scaled_servings |
| `meal_voting` | Family meal preference voting | id, meal_id, user_id, vote |
| `weekly_reports` | Weekly nutrition summaries | id, user_id, week_start, nutrition_data |
| `meal_suggestions` | AI-generated meal suggestions | id, user_id, suggestion_data, status |
| `grocery_delivery` | Delivery tracking | id, grocery_list_id, delivery_status, eta |
| `custom_domains` | White-label custom domains | id, household_id, domain, verified |

### Real-time Subscriptions

```typescript
import { supabase } from '@/integrations/supabase/client';

// Subscribe to changes
const channel = supabase
  .channel('grocery_items_changes')
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE, or specific event
      schema: 'public',
      table: 'grocery_items',
      filter: `household_id=eq.${householdId}`
    },
    (payload) => {
      console.log('Change received:', payload);
      // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      // payload.new: new row data
      // payload.old: old row data

      // Update state accordingly
    }
  )
  .subscribe();

// Cleanup
channel.unsubscribe();
```

### Authentication

```typescript
import { supabase } from '@/integrations/supabase/client';

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
});

// Sign out
await supabase.auth.signOut();

// Get current session
const { data: { session } } = await supabase.auth.getSession();

// Listen to auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event, session);
});
```

### Edge Functions

**Location**: `functions/`

To create a new edge function:

1. Create file: `functions/my-function.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    // Your function logic
    const { data } = await supabaseClient
      .from('table')
      .select('*');

    return new Response(
      JSON.stringify({ data }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 },
    );
  }
});
```

2. Deploy:
   ```bash
   supabase functions deploy my-function
   ```

3. Call from frontend:
   ```typescript
   const { data, error } = await supabase.functions.invoke('my-function', {
     body: { key: 'value' },
   });
   ```

### Row-Level Security (RLS) Patterns

**Always enable RLS on new tables**:

```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;
```

**Common RLS Policies**:

```sql
-- Users can only see their own data
CREATE POLICY "Users view own records"
  ON public.my_table FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own data
CREATE POLICY "Users insert own records"
  ON public.my_table FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin access
CREATE POLICY "Admins view all"
  ON public.my_table FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Household-based access
CREATE POLICY "Household members access"
  ON public.my_table FOR SELECT
  USING (
    household_id IN (
      SELECT household_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );
```

---

## Testing Guidelines

### Unit Testing (Vitest)

**Location**: `src/**/*.test.ts(x)`

#### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<MyComponent onClick={handleClick} />);

    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('updates state correctly', async () => {
    const { rerender } = render(<MyComponent value="initial" />);
    expect(screen.getByText('initial')).toBeInTheDocument();

    rerender(<MyComponent value="updated" />);
    expect(screen.getByText('updated')).toBeInTheDocument();
  });
});
```

#### Testing Custom Hooks

```typescript
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  it('should return initial value', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'initial'));
    expect(result.current[0]).toBe('initial');
  });

  it('should update value', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'initial'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
  });
});
```

#### Running Tests

```bash
npm run test              # Watch mode
npm run test:run          # Run once
npm run test:coverage     # With coverage
npm run test:ui           # UI mode
```

### E2E Testing (Playwright)

**Location**: `tests/`

#### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can sign in', async ({ page }) => {
    await page.goto('/auth');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/auth');

    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('.error-message')).toBeVisible();
  });
});
```

#### Running E2E Tests

```bash
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # UI mode
npm run test:e2e:debug    # Debug mode
```

### Test Coverage Goals

- **Unit Tests**: Aim for 70%+ coverage
- **Integration Tests**: Test critical user flows
- **E2E Tests**: Test authentication, payments, core features

---

## Common Tasks

### Adding a New Feature

1. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Add necessary components** in `src/components/my-feature/`

3. **Add page if needed** in `src/pages/MyFeature.tsx`

4. **Add route** in `src/App.tsx`

5. **Update AppContext** if new data entities needed

6. **Create database migration** if needed
   ```bash
   supabase migration new add_my_feature_table
   ```

7. **Write tests**
   - Unit tests for components
   - E2E test for critical flow

8. **Test locally**
   ```bash
   npm run dev
   npm run test:run
   npm run test:e2e
   ```

9. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

### Debugging Issues

#### Check Browser Console
```typescript
// Add debug logging
console.log('State:', { foods, kids, recipes });
console.error('Error:', error);
```

#### Check Supabase Logs
- Go to Supabase Dashboard → Logs
- Check Database logs for query errors
- Check Edge Function logs for function errors

#### Check Network Tab
- Verify API requests are being made
- Check request/response payloads
- Look for 4xx/5xx errors

#### Use React DevTools
- Inspect component state
- Check context values
- Profile performance

#### Common Issues

**Issue**: "localStorage is not defined"
- **Cause**: SSR or mobile environment
- **Fix**: Use `getStorage()` from `src/lib/platform.ts`

**Issue**: Real-time updates not working
- **Cause**: RLS policies blocking subscription
- **Fix**: Check RLS policies match filter criteria

**Issue**: Build fails with "Cannot find module"
- **Cause**: Missing dependency or incorrect import path
- **Fix**: Check `tsconfig.json` paths and install dependencies

### Performance Optimization

#### Analyze Bundle Size
```bash
npm run analyze:bundle
```

#### Optimize Images
```bash
npm run optimize:images
```

#### Lazy Load Components
```typescript
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

<Suspense fallback={<LoadingSpinner />}>
  <HeavyComponent />
</Suspense>
```

#### Use React.memo for Expensive Components
```typescript
import { memo } from 'react';

export const ExpensiveComponent = memo(function ExpensiveComponent({ data }) {
  // Component logic
});
```

### Mobile Development

#### Setup Mobile Development Environment

```bash
# Install Expo CLI globally
npm install -g expo-cli

# Install mobile dependencies
npm install

# Start Expo dev server
npm run expo:start
```

#### Test on Physical Device
1. Install Expo Go app on your phone
2. Scan QR code from `npm run expo:start`
3. App will load on your device

#### Build for Production

**iOS**:
```bash
npm run eas:build:ios:production
npm run eas:submit:ios
```

**Android**:
```bash
npm run eas:build:android:production
npm run eas:submit:android
```

### Deployment

#### Web Deployment (Cloudflare Pages)

```bash
# Build for production
npm run build

# Preview locally
npm run preview

# Deploy (automatic on git push to main)
git push origin main
```

#### Manual Deployment
```bash
npx wrangler pages deploy dist
```

---

## Troubleshooting

### Common Errors

#### "Hydration failed" Error
- **Cause**: Server-rendered HTML doesn't match client
- **Fix**: Ensure no browser-only APIs (localStorage, window) in initial render

#### "Cannot read property of undefined"
- **Cause**: Accessing nested property without null check
- **Fix**: Use optional chaining `data?.property?.nested`

#### Supabase "JWT expired" Error
- **Cause**: User session expired
- **Fix**: Implement token refresh or redirect to login

#### Import Path Not Found
- **Cause**: Incorrect alias or missing file
- **Fix**: Check `tsconfig.json` paths configuration

### Performance Issues

#### Slow Page Load
1. Check bundle size: `npm run analyze:bundle`
2. Lazy load heavy components
3. Optimize images
4. Use code splitting

#### Slow Database Queries
1. Add indexes to frequently queried columns
2. Use date range filters (see AppContext pattern)
3. Limit result sets with `.limit()`
4. Use `.select()` to fetch only needed columns

#### Memory Leaks
1. Unsubscribe from real-time channels in cleanup
2. Clear timeouts/intervals in useEffect cleanup
3. Remove event listeners in cleanup

```typescript
useEffect(() => {
  const channel = supabase.channel('my-channel').subscribe();

  return () => {
    channel.unsubscribe(); // Cleanup
  };
}, []);
```

### Getting Help

1. **Check Documentation**
   - This CLAUDE.md file
   - README.md for general info
   - Supabase docs: https://supabase.com/docs
   - Vite docs: https://vitejs.dev
   - React docs: https://react.dev

2. **Check Existing Code**
   - Look for similar implementations in the codebase
   - Study existing components for patterns

3. **Debug Systematically**
   - Reproduce the issue
   - Check browser console
   - Check network requests
   - Add logging
   - Isolate the problem

---

## Best Practices Summary

### Do's ✅

- Use TypeScript strict mode
- Follow conventional commits
- Write tests for new features
- Use semantic HTML
- Implement accessibility features
- Handle errors gracefully
- Provide user feedback (toasts)
- Use loading states
- Optimize images
- Lazy load heavy components
- Enable RLS on all tables
- Clean up subscriptions/listeners
- Use environment variables for secrets
- Follow existing code patterns

### Don'ts ❌

- Don't commit .env files
- Don't disable TypeScript errors
- Don't modify shadcn-ui components directly
- Don't use hardcoded colors (use Tailwind theme)
- Don't skip error handling
- Don't forget to unsubscribe from real-time channels
- Don't expose API keys in frontend code
- Don't bypass RLS policies
- Don't use `any` type
- Don't commit console.logs to production
- Don't forget mobile compatibility
- Don't skip accessibility attributes

---

## Quick Reference

### Frequently Used Commands

```bash
# Development
npm run dev                 # Start dev server
npm run expo:start         # Start mobile dev

# Testing
npm run test               # Run tests
npm run test:e2e          # E2E tests

# Building
npm run build             # Production build
npm run preview           # Preview build

# Code Quality
npm run lint              # Lint code
npm run format            # Format code

# Deployment
git push origin main      # Auto-deploy to Cloudflare
npm run eas:build:ios:production    # Build iOS
npm run eas:build:android:production # Build Android
```

### Key Files to Know

```
src/App.tsx                  # Routes
src/contexts/AppContext.tsx  # Global state
src/integrations/supabase/   # Database client & types
src/hooks/                   # Custom hooks
src/components/ui/           # UI components (shadcn)
vite.config.ts              # Build configuration
```

### Useful Snippets

**Toast Notification**:
```typescript
import { toast } from 'sonner';
toast.success('Success!');
toast.error('Error!');
toast.loading('Loading...');
```

**Supabase Query**:
```typescript
const { data, error } = await supabase
  .from('table')
  .select('*')
  .eq('column', value);
```

**Form with Validation**:
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
});

const { register, handleSubmit } = useForm({
  resolver: zodResolver(schema),
});
```

---

## Changelog

### 2025-11-28
- Updated component count (232 → 242)
- Updated hooks count (20+ → 33)
- Added `src/components/schema/` directory documentation
- Added SEO structured data components (ArticleSchema, FAQSchema, etc.)
- Added OptimizedImage component documentation
- Added 3D graphics (Three.js) integration docs
- Added PWA/AppInstallPrompt documentation
- Updated tech stack with Three.js, animation libraries
- Added new environment variables (Sentry plugin, SEO APIs, Google OAuth)
- Added 8 new database tables documentation
- Expanded custom hooks documentation with accessibility and utility hooks

### 2025-11-16
- Initial comprehensive documentation

---

**Last Updated**: 2025-11-28
**Maintained by**: Development Team
**Questions?**: Check the docs or existing code patterns first!
