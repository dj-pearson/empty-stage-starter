# Platform Test - Quick Start Guide

Get your automated testing up and running in 5 minutes.

## What is Platform Test?

Platform Test is an automated testing framework that:
1. **Discovers** all testable elements in your app (forms, buttons, links, etc.)
2. **Generates** comprehensive Playwright test scripts automatically
3. **Executes** tests with self-healing locators and intelligent form filling

## Prerequisites

- Node.js 18+ installed
- Your application running locally (or deployed)
- A test account with login credentials

## Quick Setup (3 Steps)

### Step 1: Install Dependencies

```bash
cd platform-test
npm install

# Install Playwright browsers (required)
npx playwright install
```

**Windows PowerShell:**
```powershell
cd platform-test
npm install
npx playwright install
```

### Step 2: Configure Environment

**If you DON'T have a `.env` file yet:**

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and set these required values:
# PLATFORM_TEST_BASE_URL=http://localhost:8080  # Your app URL
# PLATFORM_TEST_EMAIL=test@example.com          # Test account email
# PLATFORM_TEST_PASSWORD=TestPassword123!       # Test account password
```

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env
notepad .env
```

**If you ALREADY have a `.env` file:**

```bash
# ⚠️ DON'T use cp - it will overwrite your file!
# Instead, just add these 3 required fields to your existing .env:

PLATFORM_TEST_BASE_URL=http://localhost:8080
PLATFORM_TEST_EMAIL=test@example.com
PLATFORM_TEST_PASSWORD=TestPassword123!
```

**Minimum required configuration:**
```env
PLATFORM_TEST_BASE_URL=http://localhost:8080
PLATFORM_TEST_EMAIL=test@example.com
PLATFORM_TEST_PASSWORD=TestPassword123!
```

All other settings in `.env.example` are optional.

### Step 3: Run Your First Test

```bash
# Run the full test pipeline (discover → generate → run)
npm run full
```

That's it! The framework will:
1. Crawl your application and discover all testable elements
2. Generate test scripts automatically
3. Execute all tests and show you the results

## Understanding the Output

After running `npm run full`, you'll see:

```
📡 Starting Element Discovery...
✅ Discovery Complete!
   Pages: 15
   Forms: 8
   Buttons: 42
   Links: 67

⚙️  Generating Tests...
✅ Generation Complete!
   Tests Generated: 89

🚀 Running Tests...
✅ All tests passed!
```

**Reports are saved to:**
- `reports/report-latest.html` - Visual HTML report (open in browser)
- `reports/discovery-latest.json` - Discovered elements
- `reports/report-latest.json` - Test results data

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run full` | Run everything (discover → generate → run) |
| `npm run discover` | Only discover elements (no tests) |
| `npm run generate` | Only generate tests from latest discovery |
| `npm run run` | Only run existing tests |
| `npm run test:headful` | Run with visible browser (for debugging) |
| `npm run test:slow` | Run in slow motion (easier to follow) |

## Viewing Test Reports

### HTML Report (Recommended)

```bash
# Open the latest HTML report in your browser
cd reports
start report-latest.html        # Windows
open report-latest.html         # macOS
xdg-open report-latest.html     # Linux
```

The HTML report shows:
- Pass/fail statistics
- Test duration
- Screenshots on failure
- Detailed error messages

### JSON Report

```bash
# View JSON report in terminal
cat reports/report-latest.json
```

Use the JSON report for:
- CI/CD integrations
- Custom dashboards
- Trend analysis

## Configuring for Your App

### Setting Authentication Routes

If your app has protected routes, configure them in `.env`:

```env
# Routes that require login
PLATFORM_TEST_AUTH_ROUTES=/dashboard/*,/settings/*,/profile/*,/account/*

# Login page (default: /auth)
PLATFORM_TEST_LOGIN_PATH=/login
```

### Excluding Routes

Exclude routes you don't want to test:

```env
PLATFORM_TEST_EXCLUDE_ROUTES=/admin/*,/debug/*,/api/*,/internal/*
```

### Adding More Test Accounts

For multi-user tests:

```env
# Primary account
PLATFORM_TEST_EMAIL=test@example.com
PLATFORM_TEST_PASSWORD=TestPassword123!

# Secondary account
PLATFORM_TEST_EMAIL_2=test2@example.com
PLATFORM_TEST_PASSWORD_2=TestPassword123!

# Admin account
PLATFORM_TEST_ADMIN_EMAIL=admin@example.com
PLATFORM_TEST_ADMIN_PASSWORD=AdminPassword123!
```

## Debugging Failed Tests

### Run with Visible Browser

```bash
npm run test:headful
```

This opens the browser so you can see what's happening.

### Run in Slow Motion

```bash
npm run test:slow
```

Slows down actions so they're easier to follow.

### Check Screenshots

Failed tests automatically save screenshots to:
```
reports/screenshots/
```

### Review Discovery Report

Check what elements were found:
```bash
cat reports/discovery-latest.json
```

Look for:
- Was the form/button discovered?
- Are the locators correct?
- Did it discover the right pages?

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/platform-test.yml`:

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
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Start app
        run: npm run dev &
        env:
          CI: true
      
      - name: Wait for app
        run: npx wait-on http://localhost:8080
      
      - name: Run tests
        run: cd platform-test && npm run full
        env:
          PLATFORM_TEST_BASE_URL: http://localhost:8080
          PLATFORM_TEST_EMAIL: ${{ secrets.TEST_EMAIL }}
          PLATFORM_TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
      
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: platform-test/reports/
```

## Troubleshooting

### "Discovery finds no elements"

**Check:**
- Is `PLATFORM_TEST_BASE_URL` correct?
- Is your dev server running?
- Try running with `npm run test:headful` to see the browser

### "Tests fail to login"

**Check:**
- Are credentials correct in `.env`?
- Is `PLATFORM_TEST_LOGIN_PATH` correct for your app?
- Does the test account exist?

### "Locators not finding elements"

The framework has self-healing locators that try multiple strategies:
1. Role-based (`[role="button"]`)
2. Test ID (`[data-testid="submit"]`)
3. ARIA labels
4. Text content
5. CSS selectors

**To improve reliability, add data-testid attributes:**
```html
<button data-testid="submit-form">Submit</button>
<input data-testid="email-input" type="email" />
```

### "Tests are flaky"

**In `.env`, try:**
```env
PLATFORM_TEST_TIMEOUT=60000  # Increase timeout
PLATFORM_TEST_RETRIES=3      # More retries
```

## What's Next?

### Learn More

- Read the full [README.md](./README.md) for advanced features
- Check [generated/](./generated/) to see the actual test scripts
- Explore [utils/](./utils/) to understand the tools

### Customize Tests

The generated tests are in `generated/` directory. You can:
- Modify them to fit your needs
- Add custom test logic
- Extend with additional assertions

### Add Custom Test Data

Edit `utils/form-filler.ts` to customize how forms are filled:

```typescript
// Example: Custom email format for your domain
if (fieldType === 'email') {
  return `testuser${Date.now()}@yourdomain.com`;
}
```

## Need Help?

1. Check the [README.md](./README.md) for detailed documentation
2. Review the [generated tests](./generated/) to see what's being run
3. Check the [discovery report](./reports/discovery-latest.json) to see what was found
4. Run with `--no-headless` to visually debug

---

**Ready to test?** Just run:
```bash
npm run full
```

And watch the magic happen! 🎉
