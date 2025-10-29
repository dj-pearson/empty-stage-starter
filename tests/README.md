# EatPal E2E Test Suite

Automated end-to-end tests for production readiness verification.

## Setup

```bash
# Install Playwright
npm install -D @playwright/test

# Install browsers
npx playwright install
```

## Running Tests

```bash
# Run all tests
npx playwright test

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run specific test file
npx playwright test tests/auth.spec.ts

# Run tests in UI mode (interactive)
npx playwright test --ui

# Debug tests
npx playwright test --debug
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
