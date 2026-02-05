/**
 * Test Generator
 *
 * Takes the discovery report from the Element Finder and generates
 * executable Playwright test scripts. Creates comprehensive tests for:
 * - Form submissions
 * - Button clicks
 * - Navigation flows
 * - Modal interactions
 * - Complete user journeys
 */

import * as fs from 'fs';
import * as path from 'path';
import { config, PlatformTestConfig } from '../config';
import {
  DiscoveryReport,
  DiscoveredPage,
  DiscoveredForm,
  DiscoveredElement,
  UserFlow,
  FlowStep,
  GeneratedTest,
  InputFieldType,
  SmartLocator,
} from '../core/types';

/**
 * Test Generator class
 */
export class TestGenerator {
  private config: PlatformTestConfig;
  private report: DiscoveryReport | null = null;
  private generatedTests: GeneratedTest[] = [];

  constructor(customConfig?: Partial<PlatformTestConfig>) {
    this.config = { ...config, ...customConfig };
  }

  /**
   * Load discovery report from file
   */
  async loadReport(reportPath?: string): Promise<DiscoveryReport> {
    const filePath = reportPath || path.join(this.config.reporting.outputDir, 'discovery-latest.json');

    if (!fs.existsSync(filePath)) {
      throw new Error(`Discovery report not found at: ${filePath}. Run element finder first.`);
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    this.report = JSON.parse(content) as DiscoveryReport;
    
    if (!this.report) {
      throw new Error('Failed to parse discovery report');
    }
    
    return this.report;
  }

  /**
   * Generate all tests from discovery report
   */
  async generateAll(): Promise<GeneratedTest[]> {
    if (!this.report) {
      await this.loadReport();
    }

    console.log('\nGenerating tests from discovery report...');
    console.log(`Pages to process: ${this.report!.pages.length}`);
    console.log(`Suggested flows: ${this.report!.suggestedFlows.length}`);

    this.generatedTests = [];

    // Generate form tests
    await this.generateFormTests();

    // Generate button tests
    await this.generateButtonTests();

    // Generate navigation tests
    await this.generateNavigationTests();

    // Generate flow tests from suggestions
    await this.generateFlowTests();

    // Generate smoke tests
    await this.generateSmokeTests();

    // Write all generated tests
    await this.writeGeneratedTests();

    return this.generatedTests;
  }

  /**
   * Generate tests for all forms
   */
  private async generateFormTests(): Promise<void> {
    if (!this.report) return;

    for (const page of this.report.pages) {
      for (const form of page.forms) {
        if (form.fields.length === 0) continue;

        // Generate happy path test
        this.generatedTests.push(this.createFormTest(page, form, 'happy'));

        // Generate validation test
        this.generatedTests.push(this.createFormTest(page, form, 'validation'));

        // Generate empty submission test
        this.generatedTests.push(this.createFormTest(page, form, 'empty'));
      }
    }
  }

  /**
   * Create a form test
   */
  private createFormTest(
    page: DiscoveredPage,
    form: DiscoveredForm,
    variant: 'happy' | 'validation' | 'empty'
  ): GeneratedTest {
    const testName = `${form.name || form.id}-${variant}`;
    const description = this.getFormTestDescription(form, variant);

    const steps: FlowStep[] = [
      this.createNavigationStep(page.url),
    ];

    if (page.isAuthenticated) {
      steps.unshift(this.createAuthStep());
    }

    // Add form filling steps based on variant
    if (variant === 'happy') {
      for (const field of form.fields) {
        steps.push(this.createFillStep(field));
      }
    } else if (variant === 'validation') {
      for (const field of form.fields) {
        steps.push(this.createInvalidFillStep(field));
      }
    }
    // 'empty' variant: don't fill anything

    // Add submit step
    if (form.submitButton) {
      steps.push(this.createClickStep(form.submitButton, 'Submit form'));
    }

    // Add assertions
    if (variant === 'happy') {
      steps.push({
        stepNumber: steps.length + 1,
        action: 'assert',
        target: { primary: 'body', fallbacks: [], type: 'css', confidence: 1, description: 'Page body' },
        description: 'Verify success state',
        assertions: [
          { type: 'visible', target: undefined, expected: true },
        ],
      });
    } else {
      steps.push({
        stepNumber: steps.length + 1,
        action: 'assert',
        target: { primary: '[class*="error"], [role="alert"], .text-red, .text-destructive', fallbacks: [], type: 'css', confidence: 0.7, description: 'Error message' },
        description: 'Verify error message appears',
        assertions: [
          { type: 'visible', expected: true },
        ],
      });
    }

    const flow: UserFlow = {
      id: `form-${testName}`,
      name: `Form: ${form.name || form.id} (${variant})`,
      description,
      steps,
      preconditions: page.isAuthenticated
        ? [{ type: 'authenticated', value: 'primary', description: 'User must be logged in' }]
        : [],
      expectedOutcome: variant === 'happy' ? 'Form submitted successfully' : 'Validation errors shown',
      priority: variant === 'happy' ? 'high' : 'medium',
      tags: ['form', variant, page.path],
    };

    return {
      id: `test-form-${testName}`,
      name: `${form.name || form.id} Form - ${variant} path`,
      description,
      flow,
      code: this.generateTestCode(flow),
      filePath: `generated/forms/${this.sanitizeFileName(page.path)}-${form.id}.spec.ts`,
      estimatedDuration: steps.length * 2000,
      dependencies: page.isAuthenticated ? ['auth'] : [],
    };
  }

  /**
   * Generate tests for all buttons
   */
  private async generateButtonTests(): Promise<void> {
    if (!this.report) return;

    for (const page of this.report.pages) {
      const interactiveButtons = page.buttons.filter(b =>
        b.isEnabled &&
        b.isVisible &&
        !b.text?.toLowerCase().includes('submit') &&
        !b.text?.toLowerCase().includes('sign')
      );

      if (interactiveButtons.length === 0) continue;

      const steps: FlowStep[] = [
        this.createNavigationStep(page.url),
      ];

      if (page.isAuthenticated) {
        steps.unshift(this.createAuthStep());
      }

      for (const button of interactiveButtons.slice(0, 10)) { // Limit to first 10 buttons
        steps.push({
          stepNumber: steps.length + 1,
          action: 'click',
          target: button.locators,
          description: `Click ${button.text || button.ariaLabel || 'button'}`,
          assertions: [
            { type: 'visible', expected: true, timeout: 5000 },
          ],
          waitFor: { type: 'timeout', value: 500 },
        });
      }

      const flow: UserFlow = {
        id: `buttons-${page.path}`,
        name: `Button Interactions: ${page.path}`,
        description: `Test all interactive buttons on ${page.path}`,
        steps,
        preconditions: page.isAuthenticated
          ? [{ type: 'authenticated', value: 'primary', description: 'User must be logged in' }]
          : [],
        expectedOutcome: 'All buttons are clickable and respond appropriately',
        priority: 'medium',
        tags: ['buttons', page.path],
      };

      this.generatedTests.push({
        id: `test-buttons-${this.sanitizeFileName(page.path)}`,
        name: `Buttons - ${page.path}`,
        description: flow.description,
        flow,
        code: this.generateTestCode(flow),
        filePath: `generated/buttons/${this.sanitizeFileName(page.path)}.spec.ts`,
        estimatedDuration: steps.length * 1000,
        dependencies: page.isAuthenticated ? ['auth'] : [],
      });
    }
  }

  /**
   * Generate navigation tests
   */
  private async generateNavigationTests(): Promise<void> {
    if (!this.report) return;

    const allNavItems: { item: DiscoveredElement; page: DiscoveredPage }[] = [];

    for (const page of this.report.pages) {
      for (const navItem of page.navigation) {
        allNavItems.push({
          item: {
            id: navItem.href,
            type: 'link',
            locators: navItem.locator,
            text: navItem.text,
            href: navItem.href,
            isVisible: true,
            isEnabled: true,
            isRequired: false,
            attributes: {},
            timestamp: Date.now(),
          },
          page,
        });
      }
    }

    // Deduplicate by href
    const uniqueNavItems = allNavItems.filter((item, index, self) =>
      index === self.findIndex(t => t.item.href === item.item.href)
    );

    if (uniqueNavItems.length === 0) return;

    const steps: FlowStep[] = [
      this.createNavigationStep(this.config.baseUrl),
    ];

    for (const { item, page } of uniqueNavItems.slice(0, 20)) { // Limit to 20 links
      steps.push({
        stepNumber: steps.length + 1,
        action: 'click',
        target: item.locators,
        description: `Navigate to ${item.text}`,
        assertions: [
          { type: 'url', expected: item.href || '', timeout: 10000 },
        ],
        waitFor: { type: 'networkidle' },
      });

      // Navigate back
      steps.push({
        stepNumber: steps.length + 1,
        action: 'navigate',
        target: { primary: this.config.baseUrl, fallbacks: [], type: 'css', confidence: 1, description: 'Base URL' },
        description: 'Navigate back to home',
        waitFor: { type: 'networkidle' },
      });
    }

    const flow: UserFlow = {
      id: 'navigation-main',
      name: 'Main Navigation Test',
      description: 'Test all main navigation links',
      steps,
      preconditions: [],
      expectedOutcome: 'All navigation links work correctly',
      priority: 'high',
      tags: ['navigation'],
    };

    this.generatedTests.push({
      id: 'test-navigation-main',
      name: 'Main Navigation',
      description: flow.description,
      flow,
      code: this.generateTestCode(flow),
      filePath: 'generated/navigation/main-navigation.spec.ts',
      estimatedDuration: steps.length * 2000,
      dependencies: [],
    });
  }

  /**
   * Generate tests from suggested flows
   */
  private async generateFlowTests(): Promise<void> {
    if (!this.report) return;

    for (const flow of this.report.suggestedFlows) {
      this.generatedTests.push({
        id: `test-flow-${flow.id}`,
        name: flow.name,
        description: flow.description,
        flow,
        code: this.generateTestCode(flow),
        filePath: `generated/flows/${this.sanitizeFileName(flow.id)}.spec.ts`,
        estimatedDuration: flow.steps.length * 3000,
        dependencies: flow.preconditions.some(p => p.type === 'authenticated') ? ['auth'] : [],
      });
    }
  }

  /**
   * Generate smoke tests
   */
  private async generateSmokeTests(): Promise<void> {
    if (!this.report) return;

    const publicPages = this.report.pages.filter(p => !p.isAuthenticated);
    const protectedPages = this.report.pages.filter(p => p.isAuthenticated);

    // Public pages smoke test
    if (publicPages.length > 0) {
      const steps: FlowStep[] = publicPages.slice(0, 10).map((page, i) => ({
        stepNumber: i + 1,
        action: 'navigate' as const,
        target: { primary: page.url, fallbacks: [], type: 'css' as const, confidence: 1, description: page.path },
        description: `Load ${page.path}`,
        assertions: [
          { type: 'title' as const, expected: page.title, timeout: 10000 },
        ],
        waitFor: { type: 'networkidle' as const },
      }));

      const flow: UserFlow = {
        id: 'smoke-public',
        name: 'Public Pages Smoke Test',
        description: 'Verify all public pages load successfully',
        steps,
        preconditions: [],
        expectedOutcome: 'All public pages load with correct titles',
        priority: 'critical',
        tags: ['smoke', 'public'],
      };

      this.generatedTests.push({
        id: 'test-smoke-public',
        name: 'Smoke Test - Public Pages',
        description: flow.description,
        flow,
        code: this.generateTestCode(flow),
        filePath: 'generated/smoke/public-pages.spec.ts',
        estimatedDuration: steps.length * 3000,
        dependencies: [],
      });
    }

    // Protected pages smoke test
    if (protectedPages.length > 0) {
      const steps: FlowStep[] = [
        this.createAuthStep(),
        ...protectedPages.slice(0, 10).map((page, i) => ({
          stepNumber: i + 2,
          action: 'navigate' as const,
          target: { primary: page.url, fallbacks: [], type: 'css' as const, confidence: 1, description: page.path },
          description: `Load ${page.path}`,
          assertions: [
            { type: 'title' as const, expected: page.title, timeout: 10000 },
          ],
          waitFor: { type: 'networkidle' as const },
        })),
      ];

      const flow: UserFlow = {
        id: 'smoke-protected',
        name: 'Protected Pages Smoke Test',
        description: 'Verify all protected pages load successfully after authentication',
        steps,
        preconditions: [{ type: 'authenticated', value: 'primary', description: 'User must be logged in' }],
        expectedOutcome: 'All protected pages load with correct titles',
        priority: 'critical',
        tags: ['smoke', 'protected', 'auth'],
      };

      this.generatedTests.push({
        id: 'test-smoke-protected',
        name: 'Smoke Test - Protected Pages',
        description: flow.description,
        flow,
        code: this.generateTestCode(flow),
        filePath: 'generated/smoke/protected-pages.spec.ts',
        estimatedDuration: steps.length * 3000,
        dependencies: ['auth'],
      });
    }
  }

  /**
   * Generate Playwright test code from flow
   */
  private generateTestCode(flow: UserFlow): string {
    const imports = `import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';
`;

    const testSetup = flow.preconditions.some(p => p.type === 'authenticated')
      ? `
test.beforeEach(async ({ page }) => {
  // Authenticate before each test
  await page.goto(\`\${config.baseUrl}/auth\`);

  const signInTab = page.locator('button:has-text("Sign In"), [role="tab"]:has-text("Sign In")');
  if (await signInTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signInTab.click();
    await page.waitForTimeout(500);
  }

  await page.fill('input[type="email"]', config.credentials.primary.email);
  await page.fill('input[type="password"]', config.credentials.primary.password);
  await page.click('button[type="submit"], button:has-text("Sign In")');
  await page.waitForURL(/\\/(dashboard|home|app)/, { timeout: 10000 });
});
`
      : '';

    const testBody = flow.steps.map(step => this.generateStepCode(step)).join('\n\n');

    return `${imports}
${testSetup}
test.describe('${flow.name}', () => {
  test('${flow.description}', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

${testBody}
  });
});
`;
  }

  /**
   * Generate code for a single step
   */
  private generateStepCode(step: FlowStep): string {
    const indent = '    ';
    let code = `${indent}// Step ${step.stepNumber}: ${step.description}\n`;

    switch (step.action) {
      case 'navigate':
        code += `${indent}await page.goto('${step.target.primary}', { waitUntil: 'networkidle' });\n`;
        break;

      case 'click':
        code += `${indent}await locator.click(${JSON.stringify(step.target)});\n`;
        break;

      case 'fill':
        const value = step.value?.startsWith('{{') && step.value?.endsWith('}}')
          ? `formFiller.generateValue('${step.value.slice(2, -2)}')`
          : `'${step.value || ''}'`;
        code += `${indent}await locator.fill(${JSON.stringify(step.target)}, ${value});\n`;
        break;

      case 'select':
        code += `${indent}await locator.select(${JSON.stringify(step.target)}, '${step.value || ''}');\n`;
        break;

      case 'check':
        code += `${indent}await locator.check(${JSON.stringify(step.target)});\n`;
        break;

      case 'uncheck':
        code += `${indent}await locator.uncheck(${JSON.stringify(step.target)});\n`;
        break;

      case 'hover':
        code += `${indent}await locator.hover(${JSON.stringify(step.target)});\n`;
        break;

      case 'wait':
        if (step.waitFor?.type === 'timeout') {
          code += `${indent}await page.waitForTimeout(${step.waitFor.value || 1000});\n`;
        } else if (step.waitFor?.type === 'networkidle') {
          code += `${indent}await page.waitForLoadState('networkidle');\n`;
        } else if (step.waitFor?.type === 'selector') {
          code += `${indent}await page.waitForSelector('${step.waitFor.value}');\n`;
        }
        break;

      case 'assert':
        code += this.generateAssertionCode(step, indent);
        break;

      case 'screenshot':
        code += `${indent}await page.screenshot({ path: 'screenshots/step-${step.stepNumber}.png' });\n`;
        break;
    }

    // Add wait if specified
    if (step.action !== 'wait' && step.waitFor) {
      if (step.waitFor.type === 'timeout') {
        code += `${indent}await page.waitForTimeout(${step.waitFor.value || 500});\n`;
      } else if (step.waitFor.type === 'networkidle') {
        code += `${indent}await page.waitForLoadState('networkidle');\n`;
      }
    }

    // Add assertions if specified
    if (step.assertions && step.assertions.length > 0 && step.action !== 'assert') {
      code += this.generateAssertionCode(step, indent);
    }

    return code;
  }

  /**
   * Generate assertion code
   */
  private generateAssertionCode(step: FlowStep, indent: string): string {
    let code = '';

    for (const assertion of step.assertions || []) {
      const timeout = assertion.timeout ? `, { timeout: ${assertion.timeout} }` : '';

      switch (assertion.type) {
        case 'visible':
          if (assertion.target) {
            code += `${indent}await expect(await locator.find(${JSON.stringify(assertion.target)})).toBeVisible(${timeout});\n`;
          } else {
            code += `${indent}await expect(await locator.find(${JSON.stringify(step.target)})).toBeVisible(${timeout});\n`;
          }
          break;

        case 'hidden':
          code += `${indent}await expect(await locator.find(${JSON.stringify(assertion.target || step.target)})).toBeHidden(${timeout});\n`;
          break;

        case 'text':
          code += `${indent}await expect(await locator.find(${JSON.stringify(assertion.target || step.target)})).toContainText('${assertion.expected}'${timeout});\n`;
          break;

        case 'url':
          code += `${indent}await expect(page).toHaveURL(/${assertion.expected}/${timeout});\n`;
          break;

        case 'title':
          code += `${indent}await expect(page).toHaveTitle(/${assertion.expected}/${timeout});\n`;
          break;

        case 'enabled':
          code += `${indent}await expect(await locator.find(${JSON.stringify(assertion.target || step.target)})).toBeEnabled(${timeout});\n`;
          break;

        case 'disabled':
          code += `${indent}await expect(await locator.find(${JSON.stringify(assertion.target || step.target)})).toBeDisabled(${timeout});\n`;
          break;
      }
    }

    return code;
  }

  /**
   * Helper: Create navigation step
   */
  private createNavigationStep(url: string): FlowStep {
    return {
      stepNumber: 1,
      action: 'navigate',
      target: { primary: url, fallbacks: [], type: 'css', confidence: 1, description: 'Navigate to URL' },
      description: `Navigate to ${url}`,
      waitFor: { type: 'networkidle' },
    };
  }

  /**
   * Helper: Create auth step
   */
  private createAuthStep(): FlowStep {
    return {
      stepNumber: 0,
      action: 'navigate',
      target: { primary: 'auth', fallbacks: [], type: 'css', confidence: 1, description: 'Authentication' },
      description: 'Authenticate user',
    };
  }

  /**
   * Helper: Create fill step
   */
  private createFillStep(field: DiscoveredElement): FlowStep {
    return {
      stepNumber: 0,
      action: 'fill',
      target: field.locators,
      value: `{{${field.inputType || 'text'}}}`,
      description: `Fill ${field.name || field.placeholder || 'field'}`,
    };
  }

  /**
   * Helper: Create invalid fill step
   */
  private createInvalidFillStep(field: DiscoveredElement): FlowStep {
    const invalidValue = this.getInvalidValue(field.inputType || 'text');
    return {
      stepNumber: 0,
      action: 'fill',
      target: field.locators,
      value: invalidValue,
      description: `Fill ${field.name || field.placeholder || 'field'} with invalid data`,
    };
  }

  /**
   * Helper: Create click step
   */
  private createClickStep(element: DiscoveredElement, description: string): FlowStep {
    return {
      stepNumber: 0,
      action: 'click',
      target: element.locators,
      description,
    };
  }

  /**
   * Get invalid value for testing validation
   */
  private getInvalidValue(fieldType: InputFieldType): string {
    const invalidValues: Record<InputFieldType, string> = {
      email: 'invalid-email',
      password: 'x', // Too short
      'first-name': '',
      'last-name': '',
      'full-name': '',
      name: '',
      phone: 'abc',
      address: '',
      city: '',
      state: '',
      zip: 'abc',
      country: '',
      company: '',
      url: 'not-a-url',
      number: 'abc',
      date: 'not-a-date',
      time: 'not-a-time',
      datetime: 'not-a-datetime',
      'credit-card': '1234',
      cvv: 'abc',
      expiry: '99/99',
      search: '',
      message: '',
      description: '',
      text: '',
      unknown: '',
    };

    return invalidValues[fieldType] || '';
  }

  /**
   * Get form test description
   */
  private getFormTestDescription(form: DiscoveredForm, variant: string): string {
    switch (variant) {
      case 'happy':
        return `Submit ${form.name || 'form'} with valid data and verify success`;
      case 'validation':
        return `Submit ${form.name || 'form'} with invalid data and verify validation errors`;
      case 'empty':
        return `Submit ${form.name || 'form'} empty and verify required field validation`;
      default:
        return `Test ${form.name || 'form'}`;
    }
  }

  /**
   * Sanitize file name
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/^\//, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .toLowerCase() || 'index';
  }

  /**
   * Write all generated tests to files
   */
  private async writeGeneratedTests(): Promise<void> {
    const outputDir = path.join(__dirname, '..', 'generated');

    console.log(`\nWriting ${this.generatedTests.length} generated tests...`);

    for (const test of this.generatedTests) {
      const filePath = path.join(outputDir, test.filePath.replace('generated/', ''));
      const dir = path.dirname(filePath);

      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(filePath, test.code);

      console.log(`  Created: ${test.filePath}`);
    }

    // Write test manifest
    const manifestPath = path.join(outputDir, 'test-manifest.json');
    const manifest = {
      generatedAt: new Date().toISOString(),
      totalTests: this.generatedTests.length,
      tests: this.generatedTests.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        flow: t.flow,
        filePath: t.filePath,
        dependencies: t.dependencies,
        estimatedDuration: t.estimatedDuration,
        tags: t.flow.tags,
      })),
    };

    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\nTest manifest saved to: ${manifestPath}`);
  }
}

// CLI entry point
if (require.main === module) {
  const generator = new TestGenerator();

  const reportPath = process.argv[2];

  generator.loadReport(reportPath)
    .then(() => generator.generateAll())
    .then(tests => {
      console.log(`\nGeneration complete! Created ${tests.length} tests.`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Generation failed:', error);
      process.exit(1);
    });
}

export default TestGenerator;
