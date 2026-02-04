# Edge Functions Test Suite

Comprehensive testing framework for EatPal's 78+ Supabase Edge Functions.

## Quick Start

```bash
# Run the complete test pipeline (discover → generate → run)
npm run test:functions

# Or run individual phases
npm run test:functions:discover   # Discover all functions
npm run test:functions:generate   # Generate tests
npm run test:functions:run        # Execute tests

# Run critical function tests only
npm run test:functions:critical
```

## Directory Structure

```
tests/functions/
├── config/
│   └── functions-test.config.ts   # Test configuration
├── discovery/
│   ├── function-discovery.ts      # Function discovery tool
│   └── discovered-functions.json  # Discovery results (generated)
├── generator/
│   └── test-generator.ts          # Test generator
├── generated/                     # Auto-generated tests (gitignored)
│   ├── core.functions.spec.ts
│   ├── payment.functions.spec.ts
│   └── ...
├── critical/                      # Hand-written critical tests
│   ├── health-check.spec.ts
│   ├── barcode-lookup.spec.ts
│   ├── payment-functions.spec.ts
│   ├── ai-meal-plan.spec.ts
│   └── weekly-report.spec.ts
├── runner/
│   └── function-test-runner.ts    # Test orchestrator
├── setup/
│   └── global-setup.ts            # Playwright global setup
├── results/                       # Test results (gitignored)
├── playwright.functions.config.ts # Playwright config for functions
├── index.ts                       # Main entry point
└── README.md                      # This file
```

## Environment Variables

Create a `.env` file or set these environment variables:

```env
# Required
VITE_FUNCTIONS_URL=https://functions.tryeatpal.com
VITE_SUPABASE_ANON_KEY=your-anon-key

# Recommended
VITE_SUPABASE_URL=https://api.tryeatpal.com
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=TestPassword123!

# For admin functions
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# For cron job functions
CRON_SECRET=your-cron-secret
```

## Commands

### Full Pipeline

```bash
npm run test:functions
```

Runs all three phases:
1. **Discovery** - Scans `supabase/functions/` to find all Edge Functions
2. **Generation** - Creates Playwright tests for each function
3. **Execution** - Runs all generated tests

### Individual Phases

```bash
# Discovery only
npm run test:functions:discover

# Generation only (requires previous discovery)
npm run test:functions:generate

# Execution only (requires previous generation)
npm run test:functions:run

# Show current status
npm run test:functions:status
```

### Advanced Options

```bash
# Run with verbose output
npx ts-node tests/functions/index.ts full --verbose

# Run in headed mode (see browser)
npx ts-node tests/functions/index.ts run --headed

# Run tests sequentially
npx ts-node tests/functions/index.ts run --no-parallel

# Filter by category
npx ts-node tests/functions/index.ts run --category core --category payment

# Filter by function name
npx ts-node tests/functions/index.ts run --function lookup-barcode --function _health

# Custom reporter
npx ts-node tests/functions/index.ts run --reporter json
```

## Function Categories

| Category | Description | Auth Type |
|----------|-------------|-----------|
| `core` | Health checks, infrastructure | None |
| `user-management` | User CRUD operations | Service Role |
| `barcode` | Product lookup, enrichment | None/Bearer |
| `meal-planning` | AI meal plans, suggestions | Bearer |
| `weekly-reports` | Report generation | Service Role |
| `blog` | Content management | Bearer |
| `email` | Email sending, sequences | Service Role |
| `payment` | Stripe integration | Bearer |
| `seo` | SEO audits, sitemaps | Various |
| `analytics` | GA4, GSC integration | OAuth |
| `ai` | AI model testing | Service Role |
| `delivery` | Grocery delivery | Bearer |
| `notifications` | Push notifications | Bearer |
| `misc` | Other utilities | Various |

## Writing Custom Tests

### Critical Tests

Place important tests in `tests/functions/critical/`:

```typescript
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';

test.describe('My Function', () => {
  test('should handle valid request', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/functions/v1/my-function`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
      },
      data: {
        param: 'value',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
```

### Test Patterns

**CORS Preflight Test:**
```typescript
test('should respond to OPTIONS', async ({ request }) => {
  const response = await request.fetch(ENDPOINT, { method: 'OPTIONS' });
  expect(response.status()).toBe(200);
  expect(response.headers()['access-control-allow-origin']).toBeDefined();
});
```

**Authentication Test:**
```typescript
test('should reject unauthorized requests', async ({ request }) => {
  const response = await request.post(ENDPOINT, { data: {} });
  expect([401, 403]).toContain(response.status());
});
```

**Parameter Validation:**
```typescript
test('should require param', async ({ request }) => {
  const response = await request.post(ENDPOINT, {
    headers: { 'Authorization': `Bearer ${token}` },
    data: {}, // Missing required param
  });
  expect([400, 422]).toContain(response.status());
});
```

## Test Results

Results are saved to `tests/functions/results/`:

- `latest.json` - Most recent run results
- `run-{timestamp}.json` - Historical results
- `html-report/` - Playwright HTML report
- `test-results.json` - Detailed test results

View HTML report:
```bash
npx playwright show-report tests/functions/results/html-report
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# GitHub Actions example
jobs:
  test-functions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Run function tests
        run: npm run test:functions
        env:
          VITE_FUNCTIONS_URL: ${{ secrets.FUNCTIONS_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SERVICE_ROLE_KEY }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: function-test-results
          path: tests/functions/results/
```

## Troubleshooting

### Tests Failing with 401

- Verify `VITE_SUPABASE_ANON_KEY` is set correctly
- For admin functions, ensure `SUPABASE_SERVICE_ROLE_KEY` is set
- Check if test user credentials are valid

### Tests Timing Out

- AI functions may take up to 60 seconds
- Increase timeout in test or config
- Check if Edge Functions are deployed and accessible

### Discovery Not Finding Functions

- Ensure `supabase/functions/` directory exists
- Check each function has an `index.ts` file
- Run with `--verbose` to see errors

### Generation Creating Empty Tests

- Run discovery first: `npm run test:functions:discover`
- Check `discovered-functions.json` was created

## Contributing

When adding new Edge Functions:

1. The function will be auto-discovered on next test run
2. Add critical tests for important functions in `critical/`
3. Update function documentation if needed
