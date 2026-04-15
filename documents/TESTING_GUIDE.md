# Testing Guide - EatPal
**Created:** November 13, 2025
**Status:** In Progress
**Target Coverage:** 70%+

---

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [E2E Testing (Playwright)](#e2e-testing-playwright)
3. [Integration Testing](#integration-testing)
4. [Unit Testing](#unit-testing)
5. [Visual Regression Testing](#visual-regression-testing)
6. [Performance Testing](#performance-testing)
7. [Security Testing](#security-testing)
8. [Test Data Management](#test-data-management)
9. [CI/CD Integration](#cicd-integration)
10. [Best Practices](#best-practices)

---

## Testing Strategy

### Testing Pyramid

```
         /\
        /  \  E2E Tests (10%)
       /────\
      /      \ Integration Tests (30%)
     /────────\
    /          \ Unit Tests (60%)
   /────────────\
```

**Distribution:**
- **Unit Tests (60%):** Fast, isolated, many
- **Integration Tests (30%):** Moderate speed, test interactions
- **E2E Tests (10%):** Slow, test critical user journeys

### Test Coverage Goals

| Component Type | Target Coverage | Priority |
|----------------|-----------------|----------|
| **Utilities** | 90%+ | Critical |
| **Business Logic** | 80%+ | Critical |
| **API Functions** | 80%+ | High |
| **React Components** | 70%+ | High |
| **Pages** | 60%+ | Medium |
| **UI Components** | 50%+ | Medium |

---

## E2E Testing (Playwright)

### Setup

Playwright is already installed! Configuration: `playwright.config.ts`

```bash
# Install Playwright browsers (if not done)
npx playwright install

# Run tests
npm run test:e2e

# Run tests in UI mode
npm run test:e2e:ui

# Run tests in specific browser
npm run test:e2e -- --project=chromium
```

### Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Critical E2E Tests

Create `tests/e2e/critical-flows.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys', () => {
  test('User can sign up and complete onboarding', async ({ page }) => {
    // Navigate to landing page
    await page.goto('/');

    // Click sign up
    await page.click('text=Sign Up');

    // Fill registration form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // Should redirect to onboarding
    await expect(page).toHaveURL(/\/dashboard/);

    // Complete onboarding
    await page.fill('input[name="childName"]', 'Emma');
    await page.fill('input[name="childAge"]', '4');
    await page.click('text=Next');

    // Add safe foods
    await page.click('text=Chicken');
    await page.click('text=Rice');
    await page.click('text=Next');

    // Generate first meal plan
    await page.click('text=Generate Meal Plan');

    // Should see meal plan
    await expect(page.locator('.meal-plan')).toBeVisible();
  });

  test('User can create meal plan and generate grocery list', async ({ page }) => {
    // Login
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // Navigate to planner
    await page.goto('/dashboard/planner');

    // Add meal to Monday breakfast
    await page.click('[data-day="monday"] [data-slot="breakfast"]');
    await page.fill('input[placeholder="Search foods"]', 'Oatmeal');
    await page.click('text=Oatmeal');

    // Generate grocery list
    await page.click('text=Generate Grocery List');
    await expect(page).toHaveURL(/\/dashboard\/grocery/);

    // Should see grocery items
    await expect(page.locator('.grocery-item')).toHaveCount.toBeGreaterThan(0);
  });

  test('Pro user can access AI features', async ({ page }) => {
    // Login as Pro user
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'pro@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // Navigate to AI planner
    await page.goto('/dashboard/ai-planner');

    // Should see AI features
    await expect(page.locator('text=AI Meal Suggestions')).toBeVisible();

    // Generate AI meal plan
    await page.click('text=Generate with AI');

    // Wait for AI response
    await page.waitForSelector('.ai-meal-plan', { timeout: 10000 });

    // Should see generated meals
    await expect(page.locator('.meal-card')).toHaveCount.toBeGreaterThan(0);
  });

  test('Admin can access admin dashboard', async ({ page }) => {
    // Login as admin
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'AdminPassword123!');
    await page.click('button[type="submit"]');

    // Navigate to admin dashboard
    await page.goto('/admin-dashboard');

    // Should see admin features
    await expect(page.locator('text=User Intelligence')).toBeVisible();
    await expect(page.locator('text=Revenue Operations')).toBeVisible();

    // Check metrics are loading
    await expect(page.locator('.metric-card')).toHaveCount.toBeGreaterThan(0);
  });
});

test.describe('Payment Flow', () => {
  test('User can upgrade to Pro', async ({ page }) => {
    // Login
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'free@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // Navigate to pricing
    await page.goto('/pricing');

    // Click upgrade to Pro
    await page.click('text=Get Pro');

    // Should redirect to Stripe checkout (don't actually complete payment in test)
    await expect(page).toHaveURL(/stripe\.com\/checkout/);
  });
});

test.describe('Mobile Experience', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Mobile navigation works correctly', async ({ page }) => {
    await page.goto('/');

    // Open mobile menu
    await page.click('[aria-label="Menu"]');

    // Should see navigation
    await expect(page.locator('nav')).toBeVisible();

    // Click link
    await page.click('text=Features');

    // Should navigate
    await expect(page).toHaveURL(/\/#features/);
  });

  test('Touch interactions work correctly', async ({ page }) => {
    await page.goto('/dashboard/planner');

    // Swipe to next day
    const planner = page.locator('.planner');
    await planner.evaluate((el) => {
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [{ clientX: 300, clientY: 100 }] }));
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [{ clientX: 100, clientY: 100 }] }));
      el.dispatchEvent(new TouchEvent('touchend'));
    });

    // Should show next day
    await expect(page.locator('.current-day')).toContainText('Tuesday');
  });
});
```

### Page Object Model

Create reusable page objects:

```typescript
// tests/e2e/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto('/auth');
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');
  }

  async expectLoginSuccess() {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }

  async expectLoginError(message: string) {
    await expect(this.page.locator('.error')).toContainText(message);
  }
}

// Usage
const loginPage = new LoginPage(page);
await loginPage.login('test@example.com', 'password');
await loginPage.expectLoginSuccess();
```

---

## Integration Testing

### Setup

```bash
# Install Vitest
npm install -D vitest @vitest/ui
```

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Integration Test Examples

```typescript
// tests/integration/meal-planning.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMealPlan, generateGroceryList } from '@/lib/mealPlanning';

describe('Meal Planning Integration', () => {
  let testUser: User;
  let testKid: Kid;

  beforeEach(async () => {
    // Setup test data
    testUser = await createTestUser();
    testKid = await createTestKid(testUser.id);
  });

  it('should create meal plan and generate grocery list', async () => {
    // Create meal plan
    const mealPlan = await createMealPlan({
      kidId: testKid.id,
      startDate: '2025-11-13',
      endDate: '2025-11-19',
    });

    expect(mealPlan.entries).toHaveLength(21); // 7 days × 3 meals

    // Generate grocery list
    const groceryList = await generateGroceryList(mealPlan.id);

    expect(groceryList.items.length).toBeGreaterThan(0);
    expect(groceryList.items[0]).toHaveProperty('foodId');
    expect(groceryList.items[0]).toHaveProperty('quantity');
  });

  it('should respect safe foods when generating meal plan', async () => {
    // Add safe foods
    await addSafeFood(testKid.id, 'Chicken');
    await addSafeFood(testKid.id, 'Rice');

    // Generate meal plan
    const mealPlan = await createMealPlan({
      kidId: testKid.id,
      startDate: '2025-11-13',
      endDate: '2025-11-19',
      useSafeFoodsOnly: true,
    });

    // All meals should use safe foods
    for (const entry of mealPlan.entries) {
      const food = await getFood(entry.foodId);
      expect(food.isSafe).toBe(true);
    }
  });
});
```

---

## Unit Testing

### Component Testing

```typescript
// tests/unit/components/OptimizedImage.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OptimizedImage } from '@/components/OptimizedImage';

describe('OptimizedImage', () => {
  it('should render with blur placeholder', () => {
    render(<OptimizedImage src="/test.png" alt="Test" />);

    const img = screen.getByAlt('Test');
    expect(img).toBeInTheDocument();
  });

  it('should load image lazily', async () => {
    const { container } = render(
      <OptimizedImage src="/test.png" alt="Test" priority={false} />
    );

    // Image should not load immediately
    const img = screen.getByAlt('Test');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('should load priority images immediately', () => {
    render(<OptimizedImage src="/test.png" alt="Test" priority={true} />);

    const img = screen.getByAlt('Test');
    expect(img).toHaveAttribute('loading', 'eager');
  });
});
```

### Utility Function Testing

```typescript
// tests/unit/lib/validations.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeHTML, sanitizeInput, emailSchema } from '@/lib/validations';

describe('Validation Utilities', () => {
  describe('sanitizeHTML', () => {
    it('should remove script tags', () => {
      const input = '<p>Hello</p><script>alert("XSS")</script>';
      const output = sanitizeHTML(input);
      expect(output).not.toContain('<script>');
      expect(output).toContain('<p>Hello</p>');
    });

    it('should remove event handlers', () => {
      const input = '<div onclick="alert()">Click</div>';
      const output = sanitizeHTML(input);
      expect(output).not.toContain('onclick');
    });

    it('should remove javascript: protocol', () => {
      const input = '<a href="javascript:alert()">Link</a>';
      const output = sanitizeHTML(input);
      expect(output).not.toContain('javascript:');
    });
  });

  describe('emailSchema', () => {
    it('should validate correct email', () => {
      const result = emailSchema.safeParse('test@example.com');
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = emailSchema.safeParse('invalid-email');
      expect(result.success).toBe(false);
    });
  });
});
```

---

## Visual Regression Testing

### Setup Percy (Optional)

```bash
npm install -D @percy/cli @percy/playwright
```

```typescript
// tests/visual/snapshots.spec.ts
import { test } from '@playwright/test';
import percySnapshot from '@percy/playwright';

test.describe('Visual Regression Tests', () => {
  test('Landing page looks correct', async ({ page }) => {
    await page.goto('/');
    await percySnapshot(page, 'Landing Page');
  });

  test('Dashboard looks correct', async ({ page }) => {
    // Login first
    await page.goto('/dashboard');
    await percySnapshot(page, 'Dashboard');
  });

  test('Mobile meal planner looks correct', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/planner');
    await percySnapshot(page, 'Mobile Meal Planner');
  });
});
```

---

## Performance Testing

### Lighthouse CI

Create `.lighthouserc.js`:

```javascript
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:5173/', 'http://localhost:5173/dashboard'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

Run Lighthouse CI:

```bash
npm install -g @lhci/cli
lhci autorun
```

---

## Security Testing

### OWASP ZAP

```bash
# Run ZAP baseline scan
docker run -t owasp/zap2docker-stable zap-baseline.py -t https://your-domain.com
```

### npm audit

```bash
# Check for vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix

# Force fix (may break things)
npm audit fix --force
```

---

## Test Data Management

### Test Database

Create separate Supabase project for testing or use local Supabase:

```bash
# Start local Supabase
npx supabase start

# Run migrations
npx supabase db reset

# Seed test data
npx supabase db seed
```

### Test Data Factories

```typescript
// tests/factories/user.factory.ts
export function createTestUser(overrides = {}) {
  return {
    id: uuid(),
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    ...overrides,
  };
}

export function createTestKid(userId: string, overrides = {}) {
  return {
    id: uuid(),
    userId,
    name: 'Test Kid',
    age: 4,
    ...overrides,
  };
}
```

---

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run unit tests
        run: npm run test:coverage

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Best Practices

### 1. Test Naming

```typescript
// Good: Descriptive, clear intent
it('should show error when email is invalid')

// Bad: Vague
it('test email')
```

### 2. Arrange-Act-Assert Pattern

```typescript
it('should calculate total correctly', () => {
  // Arrange
  const items = [
    { price: 10, quantity: 2 },
    { price: 5, quantity: 3 },
  ];

  // Act
  const total = calculateTotal(items);

  // Assert
  expect(total).toBe(35);
});
```

### 3. Don't Test Implementation Details

```typescript
// Good: Test behavior
it('should show meals for selected date', async () => {
  await selectDate('2025-11-13');
  expect(getMeals()).toHaveLength(3);
});

// Bad: Test implementation
it('should call getMealsForDate with correct params', () => {
  const spy = vi.spyOn(api, 'getMealsForDate');
  // This tests implementation, not behavior
});
```

### 4. Keep Tests Independent

```typescript
// Each test should be independent
describe('Meal Planning', () => {
  beforeEach(() => {
    // Reset state before each test
    resetDatabase();
  });

  it('test 1', () => { /* ... */ });
  it('test 2', () => { /* ... */ }); // Should not depend on test 1
});
```

### 5. Use Data-Testid for Stable Selectors

```tsx
// Component
<button data-testid="add-meal-button">Add Meal</button>

// Test
await page.click('[data-testid="add-meal-button"]');
```

---

## Next Steps

1. [ ] Set up Vitest for unit tests
2. [ ] Write tests for critical utilities
3. [ ] Create E2E tests for critical user journeys
4. [ ] Set up CI/CD pipeline
5. [ ] Integrate coverage reporting
6. [ ] Set up visual regression testing (optional)
7. [ ] Achieve 70% test coverage

---

**Resources:**
- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Percy Visual Testing](https://percy.io/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
