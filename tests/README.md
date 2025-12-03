# EatPal Test Suite

Comprehensive testing suite including E2E, accessibility, and performance tests.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install --with-deps

# Run all E2E tests
npm run test:e2e

# Run accessibility tests
npm run test:a11y

# Run performance tests (requires k6)
npm run test:perf
```

## Test Types

### 1. E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific test file
npx playwright test tests/auth.spec.ts

# Run in UI mode (interactive)
npm run test:e2e:ui

# Debug tests
npm run test:e2e:debug
```

### 2. Accessibility Tests (axe-core + Playwright)

```bash
# Run accessibility tests
npm run test:a11y

# Run with HTML report
npx playwright test tests/accessibility/ --reporter=html
```

Results are saved to `a11y-results/` directory.

### 3. Performance Tests (k6)

```bash
# Install k6 first
# macOS: brew install k6
# Linux: https://k6.io/docs/get-started/installation/

# Run load test
npm run test:perf

# Run stress test
npm run test:perf:stress

# Run with custom base URL
BASE_URL=https://staging.eatpal.com k6 run tests/performance/load-test.js
```

## Test Coverage

### ✅ Authentication (`auth.spec.ts`)
- Sign up new user
- Sign in existing user
- Form validation
- Session persistence
- Sign out

### ✅ Critical Flows (`critical-flows.spec.ts`)
- Add food to pantry
- Create meal plan
- Generate grocery list
- Manage kids profiles
- View recipes
- Access AI features
- View analytics

### ✅ Payment (`payment.spec.ts`)
- View pricing page
- Initiate checkout
- Subscription status
- Upgrade prompts

### ✅ Accessibility (`accessibility/a11y.spec.ts`)
- WCAG 2.1 AA compliance scanning
- Keyboard navigation
- Screen reader compatibility
- Color contrast verification
- Form accessibility
- Mobile accessibility

### ✅ Performance (`performance/*.js`)
- **Load Test**: Normal traffic simulation (up to 50 users)
- **Stress Test**: Breaking point identification (up to 300 users)

## Before Production Launch

### Required Tests to Pass:
1. ✅ All authentication flows
2. ✅ Core user journey (signup → add kid → add food → create plan → grocery)
3. ✅ Payment checkout initiates correctly
4. ⚠️ Email sending (verify with test email provider)

### Test Data Setup

Create a test user before running tests:
```
Email: test@example.com
Password: TestPassword123!
```

### Stripe Test Mode

Ensure Stripe is in test mode when running payment tests.

Test cards:
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002
- Requires Auth: 4000 0025 0000 3155

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npx playwright test

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Viewing Results

```bash
# Open HTML report
npx playwright show-report
```

## Troubleshooting

### Tests failing on CI
- Increase timeout in `playwright.config.ts`
- Check if dev server starts correctly
- Verify environment variables are set

### Screenshot/video not captured
- Check `use.screenshot` and `use.video` settings in config
- Ensure test failures are properly caught

### Flaky tests
- Add explicit waits: `await page.waitForSelector()`
- Increase timeouts for slow operations
- Use `page.waitForLoadState('networkidle')`

## Next Steps

1. Add more comprehensive test scenarios
2. Add visual regression tests
3. Add API integration tests
4. Add performance tests
5. Set up continuous testing in CI/CD
