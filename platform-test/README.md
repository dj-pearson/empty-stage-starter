# Platform Test - Universal Testing Framework

A comprehensive, universal testing framework that automatically discovers all testable elements in your application and generates executable test scripts.

> **🚀 New here?** Check out the [QUICKSTART.md](./QUICKSTART.md) guide to get up and running in 5 minutes!

## Features

- **Automatic Element Discovery**: Crawls your application to find all forms, buttons, links, modals, and interactive elements
- **Smart Test Generation**: Creates comprehensive Playwright test scripts based on discovered elements
- **Self-Healing Locators**: Multiple fallback strategies when primary locators fail
- **Intelligent Form Filling**: Generates realistic test data based on field type classification
- **Universal Design**: Works across different platforms with minimal configuration
- **CI/CD Ready**: JUnit XML reports, HTML reports, and exit codes for pipeline integration

## Quick Start

### 1. Setup

```bash
# Navigate to the platform-test directory
cd platform-test

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your settings
# - Set PLATFORM_TEST_BASE_URL to your app URL
# - Set test account credentials
```

### 2. Run Full Test Pipeline

```bash
# Run discovery, generation, and execution in one command
npm run full

# Or with visible browser (for debugging)
npm run test:headful

# Or slow motion (easier to follow)
npm run test:slow
```

### 3. Individual Commands

```bash
# Step 1: Discover elements
npm run discover

# Step 2: Generate tests
npm run generate

# Step 3: Run tests
npm run run
```

## How It Works

### Phase 1: Element Discovery (`npm run discover`)

The Element Finder crawls your application and discovers:

- **Forms**: All form elements with their fields, validation rules, and submit buttons
- **Buttons**: Interactive buttons and clickable elements
- **Links**: Navigation links and anchors
- **Modals/Dialogs**: Popup content and dialog boxes
- **Input Fields**: Text inputs, selects, checkboxes, file uploads, date pickers

The discovery phase outputs a detailed JSON report (`reports/discovery-latest.json`) containing:
- All discovered pages with their elements
- Smart locators with fallback strategies
- Field type classifications (email, password, phone, etc.)
- Suggested test flows

### Phase 2: Test Generation (`npm run generate`)

The Test Generator reads the discovery report and creates:

- **Form Tests**: Happy path, validation, and empty submission tests for each form
- **Button Tests**: Click tests for all interactive buttons
- **Navigation Tests**: Tests for all navigation links
- **Smoke Tests**: Quick verification that all pages load correctly
- **Flow Tests**: Complete user journey tests based on suggested flows

Generated tests are saved to the `generated/` directory and include:
- Playwright test scripts
- Smart locators with self-healing
- Intelligent form filling with realistic data

### Phase 3: Test Execution (`npm run run`)

The Test Runner executes all generated tests with:

- **Parallel execution** support (configurable workers)
- **Retry logic** for flaky tests
- **Self-healing** when locators fail
- **Screenshots** on failure
- **Video recording** (optional)
- **Multiple report formats**: HTML, JSON, JUnit XML

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Required: Your application URL
PLATFORM_TEST_BASE_URL=http://localhost:8080

# Required: Test account credentials
PLATFORM_TEST_EMAIL=test@example.com
PLATFORM_TEST_PASSWORD=TestPassword123!

# Optional: Browser settings
PLATFORM_TEST_BROWSER=chromium
PLATFORM_TEST_HEADLESS=true

# Optional: Discovery limits
PLATFORM_TEST_MAX_DEPTH=5
PLATFORM_TEST_MAX_PAGES=100

# Optional: Routes to exclude
PLATFORM_TEST_EXCLUDE_ROUTES=/admin/*,/debug/*,/api/*

# Optional: Routes requiring authentication
PLATFORM_TEST_AUTH_ROUTES=/dashboard/*,/settings/*,/profile/*
```

See `.env.example` for all available options.

### Multiple Accounts

The framework supports multiple test accounts:

```env
# Primary account (main tests)
PLATFORM_TEST_EMAIL=test@example.com
PLATFORM_TEST_PASSWORD=TestPassword123!

# Secondary account (multi-user tests)
PLATFORM_TEST_EMAIL_2=test2@example.com
PLATFORM_TEST_PASSWORD_2=TestPassword123!

# Admin account (admin feature tests)
PLATFORM_TEST_ADMIN_EMAIL=admin@example.com
PLATFORM_TEST_ADMIN_PASSWORD=AdminPassword123!
```

### Payment Testing

For Stripe payment testing:

```env
PLATFORM_TEST_STRIPE_CARD=4242424242424242
PLATFORM_TEST_STRIPE_EXP=12/28
PLATFORM_TEST_STRIPE_CVC=123
PLATFORM_TEST_STRIPE_ZIP=12345
```

## Directory Structure

```
platform-test/
├── core/
│   └── types.ts           # Type definitions
├── discovery/
│   └── element-finder.ts  # Element discovery engine
├── generators/
│   └── test-generator.ts  # Test script generator
├── runners/
│   └── test-runner.ts     # Test execution engine
├── utils/
│   ├── smart-locator.ts   # Self-healing locators
│   └── form-filler.ts     # Intelligent form filling
├── generated/             # Generated test scripts (auto-created)
│   ├── forms/
│   ├── buttons/
│   ├── navigation/
│   ├── flows/
│   ├── smoke/
│   └── test-manifest.json
├── reports/               # Test reports (auto-created)
│   ├── discovery-latest.json
│   ├── report-latest.json
│   ├── screenshots/
│   └── videos/
├── fixtures/              # Test fixtures
│   └── test-file.txt
├── config.ts              # Configuration loader
├── index.ts               # CLI entry point
├── .env.example           # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Self-Healing Locators

The framework uses multiple strategies to find elements:

1. **Role-based**: `[role="button"]`
2. **Test ID**: `[data-testid="submit"]`
3. **ARIA Label**: `[aria-label="Submit form"]`
4. **Text content**: `text="Submit"`
5. **CSS selectors**: `#submit-button`, `.btn-primary`
6. **XPath**: `//button[contains(text(), "Submit")]`

When a primary locator fails, the system automatically tries fallback strategies and logs healing events for review.

## Intelligent Form Filling

The form filler classifies fields and generates appropriate test data:

| Field Type | Example Values |
|------------|----------------|
| email | `john123@example.com` |
| password | `Abc123!@#xyz` |
| phone | `(555) 123-4567` |
| first-name | `John`, `Sarah`, `Michael` |
| address | `1234 Main St` |
| credit-card | `4242424242424242` |
| date | Future dates within 1 year |

Field classification is based on:
- Input type attribute (`type="email"`)
- Name/ID attributes (`name="email"`)
- Placeholder text
- Associated labels
- Autocomplete attribute

## Reports

### HTML Report

Open `reports/report-latest.html` in a browser for a visual summary with:
- Pass/fail statistics
- Test duration
- Error messages
- Screenshots (on failure)

### JSON Report

`reports/report-latest.json` contains structured data for:
- CI/CD integration
- Custom dashboards
- Trend analysis

### JUnit XML

`reports/report-[runId].xml` for:
- Jenkins integration
- GitHub Actions
- CI pipeline reporting

## CI/CD Integration

### GitHub Actions

```yaml
name: Platform Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install
          cd platform-test && npm install

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Start application
        run: npm run dev &
        env:
          CI: true

      - name: Wait for app
        run: npx wait-on http://localhost:8080

      - name: Run platform tests
        run: cd platform-test && npm run full
        env:
          PLATFORM_TEST_BASE_URL: http://localhost:8080
          PLATFORM_TEST_EMAIL: ${{ secrets.TEST_EMAIL }}
          PLATFORM_TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: platform-test-reports
          path: platform-test/reports/
```

## Extending the Framework

### Custom Test Generation

Create custom test generators in `generators/`:

```typescript
import { DiscoveryReport, UserFlow } from '../core/types';

export function generateCustomTests(report: DiscoveryReport): UserFlow[] {
  // Your custom logic here
  return [];
}
```

### Custom Form Data

Extend `FormFiller` with custom data generators:

```typescript
import { FormFiller } from '../utils/form-filler';

class CustomFormFiller extends FormFiller {
  generateValue(fieldType: string): string {
    if (fieldType === 'custom-field') {
      return 'custom value';
    }
    return super.generateValue(fieldType);
  }
}
```

### Additional Locator Strategies

Add to `SmartLocator.selfHeal()`:

```typescript
// Strategy: Find by custom attribute
async () => {
  const el = this.page.locator(`[data-custom="${locator.description}"]`);
  if (await el.isVisible({ timeout: 1000 })) {
    return el;
  }
  return null;
}
```

## Using on Other Platforms

This framework is designed to be universal. To use on another platform:

1. Copy the `platform-test` folder to your project
2. Install dependencies: `npm install`
3. Configure `.env` with your platform's URL and credentials
4. Update `PLATFORM_TEST_AUTH_ROUTES` for your app's protected routes
5. Run `npm run full`

The framework will:
- Discover your platform's unique elements
- Generate tests specific to your forms and flows
- Execute tests with your credentials

## Troubleshooting

### Discovery finds no elements

- Check that `PLATFORM_TEST_BASE_URL` is correct and accessible
- Ensure the dev server is running
- Check browser console for JavaScript errors
- Try running with `--no-headless` to see the browser

### Tests fail to authenticate

- Verify test credentials in `.env`
- Check that the auth page URL matches your app (`/auth`, `/login`, etc.)
- Ensure the test user exists in your system

### Locators not finding elements

- The self-healing feature will try fallbacks automatically
- Check `reports/discovery-latest.json` for locator details
- Add `data-testid` attributes to improve reliability

### Tests are flaky

- Increase timeouts in `.env`: `PLATFORM_TEST_TIMEOUT=60000`
- Add more retries: `PLATFORM_TEST_RETRIES=3`
- Check for race conditions in your app

## License

MIT
