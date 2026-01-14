/**
 * Universal Test Runner
 *
 * Executes generated tests with:
 * - Parallel execution support
 * - Retry logic for flaky tests
 * - Real-time reporting
 * - Self-healing integration
 * - CI/CD friendly output
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config, PlatformTestConfig } from '../config';
import {
  TestResult,
  TestRunSummary,
  StepResult,
  UserFlow,
  FlowStep,
  GeneratedTest,
} from '../core/types';
import { SmartLocator } from '../utils/smart-locator';
import { FormFiller } from '../utils/form-filler';

/**
 * Test Runner class
 */
export class TestRunner {
  private config: PlatformTestConfig;
  private browser: Browser | null = null;
  private runId: string;
  private results: TestResult[] = [];
  private startTime: number = 0;

  constructor(customConfig?: Partial<PlatformTestConfig>) {
    this.config = { ...config, ...customConfig };
    this.runId = `run-${Date.now()}`;
  }

  /**
   * Run all generated tests
   */
  async runAll(): Promise<TestRunSummary> {
    const manifestPath = path.join(__dirname, '..', 'generated', 'test-manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error('Test manifest not found. Run test generator first.');
    }

    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
    const tests: GeneratedTest[] = manifest.tests;

    console.log(`\nRunning ${tests.length} tests...`);
    console.log(`Workers: ${this.config.execution.workers}`);
    console.log(`Retries: ${this.config.execution.retries}`);
    console.log('');

    this.startTime = Date.now();
    this.results = [];

    // Sort tests by dependencies
    const sortedTests = this.sortByDependencies(tests);

    // Run tests (sequentially for now, can be parallelized)
    for (const test of sortedTests) {
      await this.runTest(test);
    }

    const completedAt = Date.now();

    const summary: TestRunSummary = {
      runId: this.runId,
      appName: this.config.appName,
      startedAt: this.startTime,
      completedAt,
      duration: completedAt - this.startTime,
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'passed').length,
        failed: this.results.filter(r => r.status === 'failed').length,
        skipped: this.results.filter(r => r.status === 'skipped').length,
        flaky: this.results.filter(r => r.status === 'flaky').length,
      },
      coverage: {
        pages: new Set(this.results.flatMap(r => r.steps.map(s => s.action))).size,
        forms: this.results.filter(r => r.name.includes('Form')).length,
        buttons: this.results.filter(r => r.name.includes('Button')).length,
        flows: this.results.filter(r => r.name.includes('Flow')).length,
      },
    };

    // Save report
    await this.saveReport(summary);

    // Print summary
    this.printSummary(summary);

    return summary;
  }

  /**
   * Run a single test with retries
   */
  async runTest(test: GeneratedTest): Promise<TestResult> {
    console.log(`Running: ${test.name}`);

    let lastResult: TestResult | null = null;
    let attempts = 0;

    while (attempts <= this.config.execution.retries) {
      attempts++;

      try {
        const result = await this.executeTest(test);

        if (result.status === 'passed') {
          // If passed after retry, mark as flaky
          if (attempts > 1) {
            result.status = 'flaky';
          }
          this.results.push(result);
          console.log(`  ${result.status === 'flaky' ? 'FLAKY' : 'PASSED'} (${result.duration}ms)`);
          return result;
        }

        lastResult = result;
      } catch (error) {
        lastResult = {
          testId: test.id,
          name: test.name,
          status: 'failed',
          duration: 0,
          startedAt: Date.now(),
          completedAt: Date.now(),
          error: {
            message: String(error),
          },
          steps: [],
          retries: attempts - 1,
        };
      }

      if (attempts <= this.config.execution.retries) {
        console.log(`  Retry ${attempts}/${this.config.execution.retries}...`);
      }
    }

    // All retries failed
    if (lastResult) {
      this.results.push(lastResult);
      console.log(`  FAILED: ${lastResult.error?.message}`);
    }

    return lastResult!;
  }

  /**
   * Execute a single test
   */
  private async executeTest(test: GeneratedTest): Promise<TestResult> {
    const startedAt = Date.now();
    const stepResults: StepResult[] = [];
    let error: TestResult['error'];

    // Load the flow from the test file or use embedded flow
    const flow = test.flow;

    try {
      this.browser = await chromium.launch({
        headless: this.config.browser.headless,
        slowMo: this.config.browser.slowMo,
      });

      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        recordVideo: this.config.browser.video !== 'off'
          ? { dir: path.join(this.config.reporting.outputDir, 'videos', test.id) }
          : undefined,
      });

      const page = await context.newPage();
      page.setDefaultTimeout(this.config.timeouts.default);

      const smartLocator = new SmartLocator(page);
      const formFiller = new FormFiller(page, this.config);

      // Execute each step
      for (const step of flow.steps) {
        const stepStart = Date.now();

        try {
          await this.executeStep(page, step, smartLocator, formFiller);

          stepResults.push({
            stepNumber: step.stepNumber,
            action: step.action,
            status: 'passed',
            duration: Date.now() - stepStart,
          });
        } catch (stepError) {
          // Take screenshot on failure
          let screenshot: string | undefined;
          if (this.config.browser.screenshotOnFail) {
            const screenshotPath = path.join(
              this.config.reporting.outputDir,
              'screenshots',
              `${test.id}-step-${step.stepNumber}.png`
            );
            await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
            await page.screenshot({ path: screenshotPath, fullPage: true });
            screenshot = screenshotPath;
          }

          stepResults.push({
            stepNumber: step.stepNumber,
            action: step.action,
            status: 'failed',
            duration: Date.now() - stepStart,
            error: String(stepError),
            screenshot,
          });

          throw stepError;
        }
      }

      await context.close();
    } catch (e) {
      error = {
        message: String(e),
        stack: (e as Error).stack,
      };
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }

    const completedAt = Date.now();

    return {
      testId: test.id,
      name: test.name,
      status: error ? 'failed' : 'passed',
      duration: completedAt - startedAt,
      startedAt,
      completedAt,
      error,
      steps: stepResults,
      retries: 0,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    page: Page,
    step: FlowStep,
    smartLocator: SmartLocator,
    formFiller: FormFiller
  ): Promise<void> {
    switch (step.action) {
      case 'navigate':
        await page.goto(step.target.primary, { waitUntil: 'networkidle' });
        break;

      case 'click':
        await smartLocator.click(step.target);
        break;

      case 'fill':
        const value = step.value?.startsWith('{{') && step.value?.endsWith('}}')
          ? formFiller.generateValue(step.value.slice(2, -2) as any)
          : step.value || '';
        await smartLocator.fill(step.target, value);
        break;

      case 'select':
        await smartLocator.select(step.target, step.value || '');
        break;

      case 'check':
        await smartLocator.check(step.target);
        break;

      case 'uncheck':
        await smartLocator.uncheck(step.target);
        break;

      case 'hover':
        await smartLocator.hover(step.target);
        break;

      case 'wait':
        if (step.waitFor?.type === 'timeout') {
          await page.waitForTimeout(step.waitFor.value as number || 1000);
        } else if (step.waitFor?.type === 'networkidle') {
          await page.waitForLoadState('networkidle');
        } else if (step.waitFor?.type === 'selector') {
          await page.waitForSelector(step.waitFor.value as string);
        }
        break;

      case 'assert':
        await this.executeAssertions(page, step, smartLocator);
        break;

      case 'screenshot':
        await page.screenshot({
          path: path.join(this.config.reporting.outputDir, 'screenshots', `step-${step.stepNumber}.png`),
        });
        break;
    }

    // Execute wait condition if specified
    if (step.action !== 'wait' && step.waitFor) {
      if (step.waitFor.type === 'timeout') {
        await page.waitForTimeout(step.waitFor.value as number || 500);
      } else if (step.waitFor.type === 'networkidle') {
        await page.waitForLoadState('networkidle');
      }
    }

    // Execute assertions if specified
    if (step.assertions && step.assertions.length > 0 && step.action !== 'assert') {
      await this.executeAssertions(page, step, smartLocator);
    }
  }

  /**
   * Execute assertions for a step
   */
  private async executeAssertions(page: Page, step: FlowStep, smartLocator: SmartLocator): Promise<void> {
    for (const assertion of step.assertions || []) {
      const timeout = assertion.timeout || 5000;

      switch (assertion.type) {
        case 'visible':
          const visibleEl = await smartLocator.find(assertion.target || step.target, timeout);
          if (!await visibleEl.isVisible({ timeout })) {
            throw new Error(`Element not visible: ${(assertion.target || step.target).primary}`);
          }
          break;

        case 'hidden':
          const hiddenEl = await smartLocator.find(assertion.target || step.target, timeout);
          if (await hiddenEl.isVisible({ timeout })) {
            throw new Error(`Element should be hidden: ${(assertion.target || step.target).primary}`);
          }
          break;

        case 'text':
          const textEl = await smartLocator.find(assertion.target || step.target, timeout);
          const text = await textEl.textContent();
          if (!text?.includes(String(assertion.expected))) {
            throw new Error(`Expected text "${assertion.expected}" not found. Got: "${text}"`);
          }
          break;

        case 'url':
          const currentUrl = page.url();
          if (!currentUrl.includes(String(assertion.expected))) {
            throw new Error(`Expected URL to contain "${assertion.expected}". Got: "${currentUrl}"`);
          }
          break;

        case 'title':
          const title = await page.title();
          if (!title.includes(String(assertion.expected))) {
            throw new Error(`Expected title to contain "${assertion.expected}". Got: "${title}"`);
          }
          break;

        case 'enabled':
          const enabledEl = await smartLocator.find(assertion.target || step.target, timeout);
          if (!await enabledEl.isEnabled({ timeout })) {
            throw new Error(`Element not enabled: ${(assertion.target || step.target).primary}`);
          }
          break;

        case 'disabled':
          const disabledEl = await smartLocator.find(assertion.target || step.target, timeout);
          if (await disabledEl.isEnabled({ timeout })) {
            throw new Error(`Element should be disabled: ${(assertion.target || step.target).primary}`);
          }
          break;
      }
    }
  }

  /**
   * Sort tests by dependencies
   */
  private sortByDependencies(tests: GeneratedTest[]): GeneratedTest[] {
    const sorted: GeneratedTest[] = [];
    const pending = [...tests];

    while (pending.length > 0) {
      const readyIndex = pending.findIndex(test =>
        test.dependencies.every(dep =>
          sorted.some(s => s.id.includes(dep) || s.flow.tags?.includes(dep))
        ) || test.dependencies.length === 0
      );

      if (readyIndex === -1) {
        // No test ready, add remaining (might have circular dependencies)
        sorted.push(...pending);
        break;
      }

      sorted.push(pending.splice(readyIndex, 1)[0]);
    }

    return sorted;
  }

  /**
   * Save test report
   */
  private async saveReport(summary: TestRunSummary): Promise<void> {
    const outputDir = this.config.reporting.outputDir;
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Save JSON report
    const jsonPath = path.join(outputDir, `report-${this.runId}.json`);
    await fs.promises.writeFile(jsonPath, JSON.stringify(summary, null, 2));

    // Save latest report
    const latestPath = path.join(outputDir, 'report-latest.json');
    await fs.promises.writeFile(latestPath, JSON.stringify(summary, null, 2));

    // Generate HTML report if requested
    if (this.config.reporting.format === 'html' || this.config.reporting.format === 'all') {
      await this.generateHtmlReport(summary);
    }

    // Generate JUnit report if requested
    if (this.config.reporting.format === 'junit' || this.config.reporting.format === 'all') {
      await this.generateJunitReport(summary);
    }

    console.log(`\nReports saved to: ${outputDir}`);
  }

  /**
   * Generate HTML report
   */
  private async generateHtmlReport(summary: TestRunSummary): Promise<void> {
    const htmlPath = path.join(this.config.reporting.outputDir, `report-${this.runId}.html`);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${summary.appName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header h1 { margin: 0 0 10px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 15px; }
    .stat { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px; }
    .stat .value { font-size: 2em; font-weight: bold; }
    .stat.passed .value { color: #22c55e; }
    .stat.failed .value { color: #ef4444; }
    .stat.flaky .value { color: #f59e0b; }
    .stat.skipped .value { color: #6b7280; }
    .tests { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
    .test { padding: 15px 20px; border-bottom: 1px solid #eee; }
    .test:last-child { border-bottom: none; }
    .test-header { display: flex; justify-content: space-between; align-items: center; }
    .test-name { font-weight: 500; }
    .test-status { padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 500; }
    .test-status.passed { background: #dcfce7; color: #166534; }
    .test-status.failed { background: #fee2e2; color: #991b1b; }
    .test-status.flaky { background: #fef3c7; color: #92400e; }
    .test-status.skipped { background: #f3f4f6; color: #374151; }
    .test-duration { color: #6b7280; font-size: 0.9em; margin-top: 5px; }
    .test-error { background: #fef2f2; color: #991b1b; padding: 10px; border-radius: 4px; margin-top: 10px; font-family: monospace; font-size: 0.85em; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${summary.appName} Test Report</h1>
      <p>Run ID: ${summary.runId} | Duration: ${(summary.duration / 1000).toFixed(2)}s</p>
      <div class="summary">
        <div class="stat"><div class="value">${summary.summary.total}</div><div>Total</div></div>
        <div class="stat passed"><div class="value">${summary.summary.passed}</div><div>Passed</div></div>
        <div class="stat failed"><div class="value">${summary.summary.failed}</div><div>Failed</div></div>
        <div class="stat flaky"><div class="value">${summary.summary.flaky}</div><div>Flaky</div></div>
        <div class="stat skipped"><div class="value">${summary.summary.skipped}</div><div>Skipped</div></div>
      </div>
    </div>
    <div class="tests">
      ${summary.results.map(result => `
        <div class="test">
          <div class="test-header">
            <span class="test-name">${result.name}</span>
            <span class="test-status ${result.status}">${result.status.toUpperCase()}</span>
          </div>
          <div class="test-duration">${result.duration}ms | ${result.steps.length} steps | ${result.retries} retries</div>
          ${result.error ? `<div class="test-error">${result.error.message}</div>` : ''}
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;

    await fs.promises.writeFile(htmlPath, html);
  }

  /**
   * Generate JUnit XML report
   */
  private async generateJunitReport(summary: TestRunSummary): Promise<void> {
    const junitPath = path.join(this.config.reporting.outputDir, `report-${this.runId}.xml`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${summary.appName}" tests="${summary.summary.total}" failures="${summary.summary.failed}" time="${summary.duration / 1000}">
  <testsuite name="Platform Tests" tests="${summary.summary.total}" failures="${summary.summary.failed}" time="${summary.duration / 1000}">
    ${summary.results.map(result => `
    <testcase name="${result.name}" classname="PlatformTest" time="${result.duration / 1000}">
      ${result.status === 'failed' && result.error ? `<failure message="${this.escapeXml(result.error.message)}">${this.escapeXml(result.error.stack || '')}</failure>` : ''}
      ${result.status === 'skipped' ? '<skipped/>' : ''}
    </testcase>`).join('')}
  </testsuite>
</testsuites>`;

    await fs.promises.writeFile(junitPath, xml);
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Print summary to console
   */
  private printSummary(summary: TestRunSummary): void {
    console.log('\n========================================');
    console.log('           TEST RUN SUMMARY');
    console.log('========================================');
    console.log(`Duration: ${(summary.duration / 1000).toFixed(2)}s`);
    console.log('');
    console.log(`Total:   ${summary.summary.total}`);
    console.log(`Passed:  ${summary.summary.passed} ✓`);
    console.log(`Failed:  ${summary.summary.failed} ✗`);
    console.log(`Flaky:   ${summary.summary.flaky} ⚠`);
    console.log(`Skipped: ${summary.summary.skipped} -`);
    console.log('========================================');

    if (summary.summary.failed > 0) {
      console.log('\nFailed Tests:');
      for (const result of summary.results.filter(r => r.status === 'failed')) {
        console.log(`  • ${result.name}`);
        if (result.error) {
          console.log(`    ${result.error.message}`);
        }
      }
    }
  }
}

// CLI entry point
if (require.main === module) {
  const runner = new TestRunner();

  runner.runAll()
    .then(summary => {
      const exitCode = summary.summary.failed > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Test run failed:', error);
      process.exit(1);
    });
}

export default TestRunner;
