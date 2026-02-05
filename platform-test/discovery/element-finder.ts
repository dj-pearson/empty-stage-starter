/**
 * Element Finder / Discovery Engine
 *
 * Crawls the application and discovers all testable elements including:
 * - Forms and their fields
 * - Buttons and clickable elements
 * - Links and navigation
 * - Modals and dialogs
 * - Interactive components
 *
 * Generates a comprehensive discovery report that the test generator uses
 * to create executable test scripts.
 */

import { chromium, Browser, Page, BrowserContext, Locator } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config, PlatformTestConfig } from '../config';
import {
  DiscoveredElement,
  DiscoveredForm,
  DiscoveredPage,
  DiscoveryReport,
  DiscoveryError,
  SmartLocator,
  ElementType,
  InputFieldType,
  NavigationItem,
  FIELD_PATTERNS,
} from '../core/types';

/**
 * Element Finder class - crawls and discovers all testable elements
 */
export class ElementFinder {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: PlatformTestConfig;
  private visitedUrls: Set<string> = new Set();
  private discoveredPages: DiscoveredPage[] = [];
  private errors: DiscoveryError[] = [];
  private startTime: number = 0;

  constructor(customConfig?: Partial<PlatformTestConfig>) {
    this.config = { ...config, ...customConfig };
  }

  /**
   * Initialize browser and context
   */
  async initialize(): Promise<void> {
    console.log('Initializing Element Finder...');

    this.browser = await chromium.launch({
      headless: this.config.browser.headless,
      slowMo: this.config.browser.slowMo,
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: this.config.browser.video !== 'off'
        ? { dir: path.join(this.config.reporting.outputDir, 'videos') }
        : undefined,
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeouts.default);
    this.page.setDefaultNavigationTimeout(this.config.timeouts.navigation);

    console.log(`Browser initialized: ${this.config.browser.name}`);
  }

  /**
   * Close browser and cleanup
   */
  async cleanup(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    console.log('Browser closed');
  }

  /**
   * Authenticate with the application
   */
  async authenticate(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('Attempting authentication...');

    try {
      // Navigate to auth page
      await this.page.goto(`${this.config.baseUrl}/auth`, {
        waitUntil: 'networkidle',
      });

      // Try to find and click sign in tab
      const signInTab = this.page.locator('button:has-text("Sign In"), [role="tab"]:has-text("Sign In")');
      if (await signInTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await signInTab.click();
        await this.page.waitForTimeout(500);
      }

      // Fill credentials
      await this.page.fill('input[type="email"], input[name="email"]', this.config.credentials.primary.email);
      await this.page.fill('input[type="password"], input[name="password"]', this.config.credentials.primary.password);

      // Submit
      await this.page.click('button[type="submit"], button:has-text("Sign In")');

      // Wait for redirect
      await this.page.waitForURL(/\/(dashboard|home|app)/, { timeout: 10000 });

      console.log('Authentication successful');
      return true;
    } catch (error) {
      console.error('Authentication failed:', error);
      this.errors.push({
        type: 'auth',
        message: `Authentication failed: ${error}`,
        timestamp: Date.now(),
      });
      return false;
    }
  }

  /**
   * Main discovery entry point
   */
  async discover(): Promise<DiscoveryReport> {
    this.startTime = Date.now();
    this.visitedUrls.clear();
    this.discoveredPages = [];
    this.errors = [];

    console.log(`\nStarting discovery for: ${this.config.baseUrl}`);
    console.log(`Max depth: ${this.config.discovery.maxDepth}`);
    console.log(`Max pages: ${this.config.discovery.maxPages}`);
    console.log('');

    try {
      await this.initialize();

      // Discover public pages first
      await this.discoverPage(this.config.baseUrl, 0, false);

      // Authenticate and discover protected pages
      const authenticated = await this.authenticate();
      if (authenticated) {
        // Discover authenticated pages
        for (const route of this.config.discovery.authRoutes) {
          const url = `${this.config.baseUrl}${route.replace('/*', '')}`;
          if (!this.visitedUrls.has(url)) {
            await this.discoverPage(url, 0, true);
          }
        }
      }
    } finally {
      await this.cleanup();
    }

    const completedAt = Date.now();

    // Generate report
    const report: DiscoveryReport = {
      appName: this.config.appName,
      baseUrl: this.config.baseUrl,
      startedAt: this.startTime,
      completedAt,
      duration: completedAt - this.startTime,
      pages: this.discoveredPages,
      totalElements: this.calculateTotals(),
      suggestedFlows: this.generateSuggestedFlows(),
      errors: this.errors,
      coverage: {
        pagesVisited: this.discoveredPages.length,
        formsFound: this.discoveredPages.reduce((sum, p) => sum + p.forms.length, 0),
        interactiveElements: this.discoveredPages.reduce(
          (sum, p) => sum + p.buttons.length + p.links.length + p.forms.reduce((fs, f) => fs + f.fields.length, 0),
          0
        ),
      },
    };

    // Save report
    await this.saveReport(report);

    return report;
  }

  /**
   * Discover a single page and its elements
   */
  private async discoverPage(url: string, depth: number, isAuthenticated: boolean): Promise<void> {
    if (!this.page) return;

    // Check limits
    if (depth > this.config.discovery.maxDepth) return;
    if (this.visitedUrls.size >= this.config.discovery.maxPages) return;
    if (this.visitedUrls.has(url)) return;

    // Check exclusions
    const path = new URL(url).pathname;
    if (this.config.discovery.excludeRoutes.some(pattern => this.matchPattern(path, pattern))) {
      console.log(`Skipping excluded route: ${path}`);
      return;
    }

    this.visitedUrls.add(url);
    console.log(`[${this.visitedUrls.size}] Discovering: ${url} (depth: ${depth})`);

    try {
      const loadStart = Date.now();
      await this.page.goto(url, { waitUntil: 'networkidle' });
      const loadTime = Date.now() - loadStart;

      // Wait for dynamic content
      await this.page.waitForTimeout(500);

      // Discover page elements
      const pageData: DiscoveredPage = {
        url,
        path,
        title: await this.page.title(),
        description: await this.getMetaDescription(),
        isAuthenticated,
        forms: await this.discoverForms(),
        buttons: await this.discoverButtons(),
        links: await this.discoverLinks(),
        modals: await this.discoverModals(),
        navigation: await this.discoverNavigation(),
        headings: await this.discoverHeadings(),
        timestamp: Date.now(),
        loadTime,
      };

      // Take screenshot
      if (this.config.browser.screenshotOnFail) {
        const screenshotPath = path.replace(/\//g, '_') || 'index';
        const screenshotFile = `${this.config.reporting.outputDir}/screenshots/${screenshotPath}.png`;
        const screenshotDir = screenshotFile.substring(0, screenshotFile.lastIndexOf('/'));
        await fs.promises.mkdir(screenshotDir, { recursive: true }).catch(() => {});
        await this.page.screenshot({ path: screenshotFile, fullPage: true });
        pageData.screenshot = screenshotFile;
      }

      this.discoveredPages.push(pageData);

      // Recursively discover linked pages
      for (const link of pageData.links) {
        if (link.href && link.href.startsWith(this.config.baseUrl)) {
          await this.discoverPage(link.href, depth + 1, isAuthenticated);
        }
      }

      // Discover modals and dialogs
      for (const modal of pageData.modals) {
        await this.discoverModalContent(modal);
      }

    } catch (error) {
      console.error(`Error discovering ${url}:`, error);
      this.errors.push({
        type: 'navigation',
        message: `Failed to discover ${url}: ${error}`,
        page: url,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Discover all forms on the current page
   */
  private async discoverForms(): Promise<DiscoveredForm[]> {
    if (!this.page) return [];

    const forms: DiscoveredForm[] = [];
    const formElements = await this.page.locator('form').all();

    for (let i = 0; i < formElements.length; i++) {
      const form = formElements[i];
      try {
        const formId = await form.getAttribute('id') || `form-${i}`;
        const formData: DiscoveredForm = {
          id: formId,
          name: await form.getAttribute('name') || undefined,
          action: await form.getAttribute('action') || undefined,
          method: await form.getAttribute('method') || 'get',
          locator: await this.generateSmartLocator(form, 'form'),
          fields: await this.discoverFormFields(form),
          submitButton: await this.findSubmitButton(form),
          cancelButton: await this.findCancelButton(form),
          isMultiStep: await this.isMultiStepForm(form),
          validationErrors: [],
          timestamp: Date.now(),
        };

        forms.push(formData);
      } catch (error) {
        console.warn(`Error discovering form ${i}:`, error);
      }
    }

    return forms;
  }

  /**
   * Discover form fields within a form
   */
  private async discoverFormFields(form: Locator): Promise<DiscoveredElement[]> {
    const fields: DiscoveredElement[] = [];
    const selectors = ['input', 'select', 'textarea', '[contenteditable="true"]'];

    for (const selector of selectors) {
      const elements = await form.locator(selector).all();
      for (const element of elements) {
        try {
          // Skip hidden and submit inputs
          const type = await element.getAttribute('type');
          if (type === 'hidden' || type === 'submit') continue;

          const field = await this.extractElementData(element, this.mapInputType(type || 'text'));
          if (field) {
            field.inputType = await this.classifyInputField(element);
            field.validationRules = await this.extractValidationRules(element);
            fields.push(field);
          }
        } catch (error) {
          // Element may have been removed, skip it
        }
      }
    }

    return fields;
  }

  /**
   * Classify input field based on attributes
   */
  private async classifyInputField(element: Locator): Promise<InputFieldType> {
    const name = (await element.getAttribute('name')) || '';
    const id = (await element.getAttribute('id')) || '';
    const placeholder = (await element.getAttribute('placeholder')) || '';
    const type = (await element.getAttribute('type')) || 'text';
    const label = await this.getAssociatedLabel(element);
    const autocomplete = (await element.getAttribute('autocomplete')) || '';

    const searchText = `${name} ${id} ${placeholder} ${label} ${autocomplete}`.toLowerCase();

    // Check type attribute first
    if (type === 'email') return 'email';
    if (type === 'password') return 'password';
    if (type === 'tel') return 'phone';
    if (type === 'url') return 'url';
    if (type === 'number') return 'number';
    if (type === 'date') return 'date';
    if (type === 'time') return 'time';
    if (type === 'datetime-local') return 'datetime';
    if (type === 'search') return 'search';

    // Check patterns
    for (const [fieldType, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (fieldType === 'text' || fieldType === 'unknown') continue;
      for (const pattern of patterns) {
        if (pattern.test(searchText)) {
          return fieldType as InputFieldType;
        }
      }
    }

    return 'text';
  }

  /**
   * Get associated label for an input
   */
  private async getAssociatedLabel(element: Locator): Promise<string> {
    if (!this.page) return '';

    try {
      const id = await element.getAttribute('id');
      if (id) {
        const label = await this.page.locator(`label[for="${id}"]`).textContent();
        if (label) return label.trim();
      }

      // Try parent label
      const parentLabel = await element.locator('xpath=ancestor::label').textContent();
      if (parentLabel) return parentLabel.trim();
    } catch {
      // No label found
    }

    return '';
  }

  /**
   * Extract validation rules from element
   */
  private async extractValidationRules(element: Locator): Promise<DiscoveredElement['validationRules']> {
    const rules: DiscoveredElement['validationRules'] = [];

    if (await element.getAttribute('required') !== null) {
      rules.push({ type: 'required' });
    }

    const minLength = await element.getAttribute('minlength');
    if (minLength) {
      rules.push({ type: 'minLength', value: parseInt(minLength) });
    }

    const maxLength = await element.getAttribute('maxlength');
    if (maxLength) {
      rules.push({ type: 'maxLength', value: parseInt(maxLength) });
    }

    const min = await element.getAttribute('min');
    if (min) {
      rules.push({ type: 'min', value: parseFloat(min) });
    }

    const max = await element.getAttribute('max');
    if (max) {
      rules.push({ type: 'max', value: parseFloat(max) });
    }

    const pattern = await element.getAttribute('pattern');
    if (pattern) {
      rules.push({ type: 'pattern', value: pattern });
    }

    const type = await element.getAttribute('type');
    if (type === 'email') {
      rules.push({ type: 'email' });
    }
    if (type === 'url') {
      rules.push({ type: 'url' });
    }

    return rules;
  }

  /**
   * Find submit button in form
   */
  private async findSubmitButton(form: Locator): Promise<DiscoveredElement | undefined> {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Save")',
      'button:has-text("Create")',
      'button:has-text("Sign In")',
      'button:has-text("Sign Up")',
      'button:has-text("Continue")',
      'button:has-text("Next")',
    ];

    for (const selector of selectors) {
      try {
        const button = form.locator(selector).first();
        if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
          const result = await this.extractElementData(button, 'button');
          return result || undefined;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  /**
   * Find cancel button in form
   */
  private async findCancelButton(form: Locator): Promise<DiscoveredElement | undefined> {
    const selectors = [
      'button:has-text("Cancel")',
      'button:has-text("Back")',
      'button:has-text("Close")',
      'a:has-text("Cancel")',
    ];

    for (const selector of selectors) {
      try {
        const button = form.locator(selector).first();
        if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
          const result = await this.extractElementData(button, 'button');
          return result || undefined;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  /**
   * Check if form is multi-step
   */
  private async isMultiStepForm(form: Locator): Promise<boolean> {
    const indicators = [
      '[data-step]',
      '.step',
      '.wizard',
      '.multi-step',
      'button:has-text("Next")',
      '[role="progressbar"]',
    ];

    for (const indicator of indicators) {
      try {
        if (await form.locator(indicator).count() > 0) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Discover all buttons on the page
   */
  private async discoverButtons(): Promise<DiscoveredElement[]> {
    if (!this.page) return [];

    const buttons: DiscoveredElement[] = [];
    const selectors = [
      'button',
      '[role="button"]',
      'input[type="button"]',
      '.btn',
      '[class*="button"]',
    ];

    for (const selector of selectors) {
      const elements = await this.page.locator(selector).all();
      for (const element of elements) {
        try {
          if (await element.isVisible({ timeout: 500 })) {
            const buttonData = await this.extractElementData(element, 'button');
            if (buttonData && !buttons.some(b => b.id === buttonData.id)) {
              buttons.push(buttonData);
            }
          }
        } catch {
          continue;
        }
      }
    }

    return buttons;
  }

  /**
   * Discover all links on the page
   */
  private async discoverLinks(): Promise<DiscoveredElement[]> {
    if (!this.page) return [];

    const links: DiscoveredElement[] = [];
    const elements = await this.page.locator('a[href]').all();

    for (const element of elements) {
      try {
        if (await element.isVisible({ timeout: 500 })) {
          const linkData = await this.extractElementData(element, 'link');
          if (linkData) {
            linkData.href = await element.getAttribute('href') || undefined;
            // Convert relative URLs to absolute
            if (linkData.href && !linkData.href.startsWith('http')) {
              linkData.href = new URL(linkData.href, this.config.baseUrl).href;
            }
            links.push(linkData);
          }
        }
      } catch {
        continue;
      }
    }

    return links;
  }

  /**
   * Discover modals and dialogs
   */
  private async discoverModals(): Promise<DiscoveredElement[]> {
    if (!this.page) return [];

    const modals: DiscoveredElement[] = [];
    const selectors = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '.modal',
      '[class*="modal"]',
      '[class*="dialog"]',
      '[data-state="open"]',
    ];

    for (const selector of selectors) {
      const elements = await this.page.locator(selector).all();
      for (const element of elements) {
        try {
          const modalData = await this.extractElementData(element, 'modal');
          if (modalData) {
            modals.push(modalData);
          }
        } catch {
          continue;
        }
      }
    }

    return modals;
  }

  /**
   * Discover modal content by triggering modal openers
   */
  private async discoverModalContent(modal: DiscoveredElement): Promise<void> {
    // This method can be extended to click buttons that open modals
    // and discover the content within
    console.log(`Found modal: ${modal.text || modal.ariaLabel || modal.id}`);
  }

  /**
   * Discover navigation structure
   */
  private async discoverNavigation(): Promise<NavigationItem[]> {
    if (!this.page) return [];

    const navigation: NavigationItem[] = [];
    const navElements = await this.page.locator('nav, [role="navigation"]').all();

    for (const nav of navElements) {
      const links = await nav.locator('a[href]').all();
      for (const link of links) {
        try {
          const text = await link.textContent() || '';
          const href = await link.getAttribute('href') || '';
          if (text && href) {
            navigation.push({
              text: text.trim(),
              href: href.startsWith('http') ? href : new URL(href, this.config.baseUrl).href,
              locator: await this.generateSmartLocator(link, 'link'),
            });
          }
        } catch {
          continue;
        }
      }
    }

    return navigation;
  }

  /**
   * Discover page headings
   */
  private async discoverHeadings(): Promise<{ level: number; text: string }[]> {
    if (!this.page) return [];

    const headings: { level: number; text: string }[] = [];

    for (let level = 1; level <= 6; level++) {
      const elements = await this.page.locator(`h${level}`).all();
      for (const element of elements) {
        try {
          const text = await element.textContent();
          if (text) {
            headings.push({ level, text: text.trim() });
          }
        } catch {
          continue;
        }
      }
    }

    return headings;
  }

  /**
   * Get meta description
   */
  private async getMetaDescription(): Promise<string | undefined> {
    if (!this.page) return undefined;

    try {
      return await this.page.locator('meta[name="description"]').getAttribute('content') || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract element data
   */
  private async extractElementData(element: Locator, type: ElementType): Promise<DiscoveredElement | null> {
    try {
      const id = await element.getAttribute('id') || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      return {
        id,
        type,
        locators: await this.generateSmartLocator(element, type),
        text: await element.textContent().then(t => t?.trim()).catch(() => undefined),
        ariaLabel: await element.getAttribute('aria-label') || undefined,
        placeholder: await element.getAttribute('placeholder') || undefined,
        name: await element.getAttribute('name') || undefined,
        value: await element.getAttribute('value') || undefined,
        isVisible: await element.isVisible().catch(() => false),
        isEnabled: await element.isEnabled().catch(() => true),
        isRequired: await element.getAttribute('required') !== null,
        boundingBox: await element.boundingBox() || undefined,
        attributes: await this.getElementAttributes(element),
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get element attributes
   */
  private async getElementAttributes(element: Locator): Promise<Record<string, string>> {
    try {
      return await element.evaluate((el) => {
        const attrs: Record<string, string> = {};
        const elementWithAttrs = el as HTMLElement;
        if (elementWithAttrs.attributes) {
          for (const attr of elementWithAttrs.attributes) {
            attrs[attr.name] = attr.value;
          }
        }
        return attrs;
      });
    } catch {
      return {};
    }
  }

  /**
   * Generate smart locator with fallbacks
   */
  private async generateSmartLocator(element: Locator, type: ElementType): Promise<SmartLocator> {
    const locators: { strategy: SmartLocator['type']; value: string; confidence: number }[] = [];

    // Try role-based locator
    const role = await element.getAttribute('role');
    if (role) {
      locators.push({ strategy: 'role', value: `[role="${role}"]`, confidence: 0.9 });
    }

    // Try data-testid
    const testId = await element.getAttribute('data-testid') ||
                   await element.getAttribute('data-test-id') ||
                   await element.getAttribute('data-cy');
    if (testId) {
      locators.push({ strategy: 'testid', value: `[data-testid="${testId}"]`, confidence: 0.95 });
    }

    // Try aria-label
    const ariaLabel = await element.getAttribute('aria-label');
    if (ariaLabel) {
      locators.push({ strategy: 'label', value: `[aria-label="${ariaLabel}"]`, confidence: 0.85 });
    }

    // Try text content
    const text = await element.textContent().catch(() => null);
    if (text && text.trim().length < 50) {
      locators.push({ strategy: 'text', value: `text="${text.trim()}"`, confidence: 0.7 });
    }

    // Try CSS selector
    const id = await element.getAttribute('id');
    if (id) {
      locators.push({ strategy: 'css', value: `#${id}`, confidence: 0.9 });
    }

    const className = await element.getAttribute('class');
    if (className) {
      const mainClass = className.split(' ').find(c => !c.startsWith('_') && c.length > 3);
      if (mainClass) {
        locators.push({ strategy: 'css', value: `.${mainClass}`, confidence: 0.5 });
      }
    }

    // Sort by confidence and pick the best
    locators.sort((a, b) => b.confidence - a.confidence);
    const primary = locators[0] || { strategy: 'css' as const, value: type, confidence: 0.1 };

    return {
      primary: primary.value,
      fallbacks: locators.slice(1).map(l => l.value),
      type: primary.strategy,
      confidence: primary.confidence,
      description: `${type} element`,
    };
  }

  /**
   * Map HTML input type to element type
   */
  private mapInputType(htmlType: string): ElementType {
    const mapping: Record<string, ElementType> = {
      text: 'input',
      email: 'input',
      password: 'input',
      number: 'input',
      tel: 'input',
      url: 'input',
      search: 'input',
      date: 'date-picker',
      time: 'input',
      datetime: 'date-picker',
      'datetime-local': 'date-picker',
      checkbox: 'checkbox',
      radio: 'radio',
      file: 'file-upload',
      select: 'select',
      textarea: 'textarea',
    };

    return mapping[htmlType] || 'input';
  }

  /**
   * Match URL pattern
   */
  private matchPattern(path: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\//g, '\\/');
    return new RegExp(`^${regexPattern}$`).test(path);
  }

  /**
   * Calculate totals for report
   */
  private calculateTotals(): DiscoveryReport['totalElements'] {
    return {
      forms: this.discoveredPages.reduce((sum, p) => sum + p.forms.length, 0),
      buttons: this.discoveredPages.reduce((sum, p) => sum + p.buttons.length, 0),
      links: this.discoveredPages.reduce((sum, p) => sum + p.links.length, 0),
      inputs: this.discoveredPages.reduce(
        (sum, p) => sum + p.forms.reduce((fs, f) => fs + f.fields.length, 0),
        0
      ),
      modals: this.discoveredPages.reduce((sum, p) => sum + p.modals.length, 0),
    };
  }

  /**
   * Generate suggested test flows based on discovered elements
   */
  private generateSuggestedFlows(): DiscoveryReport['suggestedFlows'] {
    const flows: DiscoveryReport['suggestedFlows'] = [];

    // Generate form submission flows
    for (const page of this.discoveredPages) {
      for (const form of page.forms) {
        if (form.submitButton) {
          flows.push({
            id: `form-${form.id}`,
            name: `Submit ${form.name || form.id} Form`,
            description: `Complete and submit the ${form.name || 'form'} on ${page.path}`,
            steps: [
              {
                stepNumber: 1,
                action: 'navigate',
                target: { primary: page.url, fallbacks: [], type: 'css', confidence: 1, description: 'Navigate to page' },
                description: `Navigate to ${page.path}`,
              },
              ...form.fields.map((field, i) => ({
                stepNumber: i + 2,
                action: 'fill' as const,
                target: field.locators,
                value: `{{${field.inputType || 'text'}}}`,
                description: `Fill ${field.name || field.placeholder || 'field'}`,
              })),
              {
                stepNumber: form.fields.length + 2,
                action: 'click' as const,
                target: form.submitButton.locators,
                description: 'Submit form',
                assertions: [{ type: 'visible', expected: true }],
              },
            ],
            preconditions: page.isAuthenticated
              ? [{ type: 'authenticated', value: 'primary', description: 'User must be logged in' }]
              : [],
            expectedOutcome: 'Form submitted successfully',
            priority: 'high',
            tags: ['form', page.path],
          });
        }
      }
    }

    // Generate navigation flows
    const authPages = this.discoveredPages.filter(p => p.path.includes('auth'));
    if (authPages.length > 0) {
      flows.push({
        id: 'auth-signin',
        name: 'User Sign In Flow',
        description: 'Complete user authentication',
        steps: [
          {
            stepNumber: 1,
            action: 'navigate',
            target: { primary: `${this.config.baseUrl}/auth`, fallbacks: [], type: 'css', confidence: 1, description: 'Auth page' },
            description: 'Navigate to auth page',
          },
          {
            stepNumber: 2,
            action: 'fill',
            target: { primary: 'input[type="email"]', fallbacks: ['input[name="email"]'], type: 'css', confidence: 0.9, description: 'Email input' },
            value: '{{email}}',
            description: 'Enter email',
          },
          {
            stepNumber: 3,
            action: 'fill',
            target: { primary: 'input[type="password"]', fallbacks: ['input[name="password"]'], type: 'css', confidence: 0.9, description: 'Password input' },
            value: '{{password}}',
            description: 'Enter password',
          },
          {
            stepNumber: 4,
            action: 'click',
            target: { primary: 'button[type="submit"]', fallbacks: ['button:has-text("Sign In")'], type: 'css', confidence: 0.8, description: 'Submit button' },
            description: 'Click sign in',
            assertions: [{ type: 'url', expected: '/dashboard', timeout: 10000 }],
          },
        ],
        preconditions: [],
        expectedOutcome: 'User is authenticated and redirected to dashboard',
        priority: 'critical',
        tags: ['auth', 'signin'],
      });
    }

    return flows;
  }

  /**
   * Save discovery report to file
   */
  private async saveReport(report: DiscoveryReport): Promise<void> {
    const outputDir = this.config.reporting.outputDir;
    await fs.promises.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(outputDir, `discovery-${timestamp}.json`);

    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nDiscovery report saved to: ${reportPath}`);

    // Also save as latest
    const latestPath = path.join(outputDir, 'discovery-latest.json');
    await fs.promises.writeFile(latestPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n=== Discovery Summary ===');
    console.log(`Pages discovered: ${report.pages.length}`);
    console.log(`Forms found: ${report.totalElements.forms}`);
    console.log(`Buttons found: ${report.totalElements.buttons}`);
    console.log(`Links found: ${report.totalElements.links}`);
    console.log(`Input fields found: ${report.totalElements.inputs}`);
    console.log(`Modals found: ${report.totalElements.modals}`);
    console.log(`Suggested flows: ${report.suggestedFlows.length}`);
    console.log(`Errors: ${report.errors.length}`);
    console.log(`Duration: ${(report.duration / 1000).toFixed(2)}s`);
  }
}

// CLI entry point
if (require.main === module) {
  const finder = new ElementFinder();
  finder.discover()
    .then(report => {
      console.log('\nDiscovery complete!');
      process.exit(report.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Discovery failed:', error);
      process.exit(1);
    });
}

export default ElementFinder;
