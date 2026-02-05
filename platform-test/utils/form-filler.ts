/**
 * Form Filler Utility
 *
 * Intelligent form filling that:
 * - Generates realistic test data based on field types
 * - Handles complex form patterns (multi-step, conditional)
 * - Supports validation testing with invalid data
 * - Manages file uploads
 * - Handles special fields (dates, credit cards, etc.)
 */

import { Page, Locator } from 'playwright';
import * as path from 'path';
import { PlatformTestConfig } from '../config';
import {
  DiscoveredForm,
  DiscoveredElement,
  InputFieldType,
  SmartLocator as SmartLocatorType,
} from '../core/types';
import { SmartLocator } from './smart-locator';

/**
 * Generated test data for forms
 */
export interface GeneratedFormData {
  [fieldName: string]: string;
}

/**
 * Form filler options
 */
export interface FormFillerOptions {
  variant?: 'valid' | 'invalid' | 'empty' | 'random';
  customData?: GeneratedFormData;
  skipFields?: string[];
}

/**
 * Form Filler class
 */
export class FormFiller {
  private page: Page;
  private config: PlatformTestConfig;
  private smartLocator: SmartLocator;

  // Test data generators
  private static readonly FIRST_NAMES = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Emma'];
  private static readonly LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  private static readonly DOMAINS = ['example.com', 'test.org', 'demo.net'];
  private static readonly CITIES = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'];
  private static readonly STATES = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA'];
  private static readonly STREETS = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Pine Rd', 'Elm Way'];
  private static readonly COMPANIES = ['Acme Inc', 'Tech Corp', 'Global Industries', 'Innovation Labs'];

  constructor(page: Page, config: PlatformTestConfig) {
    this.page = page;
    this.config = config;
    this.smartLocator = new SmartLocator(page);
  }

  /**
   * Fill a form with generated or custom data
   */
  async fillForm(form: DiscoveredForm, options: FormFillerOptions = {}): Promise<GeneratedFormData> {
    const { variant = 'valid', customData = {}, skipFields = [] } = options;
    const filledData: GeneratedFormData = {};

    console.log(`Filling form: ${form.name || form.id} (${variant} data)`);

    for (const field of form.fields) {
      // Skip specified fields
      if (skipFields.includes(field.name || field.id)) {
        continue;
      }

      // Skip hidden fields
      if (!field.isVisible) {
        continue;
      }

      try {
        const value = customData[field.name || field.id] ||
                      this.generateValueForField(field, variant);

        if (value !== undefined && value !== '') {
          await this.fillField(field, value);
          filledData[field.name || field.id] = value;
        }
      } catch (error) {
        console.warn(`Failed to fill field ${field.name || field.id}:`, error);
      }
    }

    return filledData;
  }

  /**
   * Fill a single field
   */
  async fillField(field: DiscoveredElement, value: string): Promise<void> {
    const element = await this.smartLocator.find(field.locators);

    switch (field.type) {
      case 'input':
      case 'textarea':
        await element.fill(value);
        break;

      case 'select':
        await this.fillSelect(element, value);
        break;

      case 'checkbox':
        if (value === 'true' || value === '1') {
          await element.check();
        } else {
          await element.uncheck();
        }
        break;

      case 'radio':
        await element.check();
        break;

      case 'file-upload':
        await this.handleFileUpload(element, value);
        break;

      case 'date-picker':
        await this.handleDatePicker(element, value);
        break;

      default:
        await element.fill(value);
    }

    // Trigger blur to activate validation
    await element.blur().catch(() => {});
  }

  /**
   * Fill a select element
   */
  private async fillSelect(element: Locator, value: string): Promise<void> {
    // Try to select by value first
    try {
      await element.selectOption({ value });
      return;
    } catch {
      // Try by label
    }

    try {
      await element.selectOption({ label: value });
      return;
    } catch {
      // Try by index
    }

    // Select first non-empty option
    const options = await element.locator('option').all();
    for (const option of options.slice(1)) { // Skip first (usually placeholder)
      const optionValue = await option.getAttribute('value');
      if (optionValue) {
        await element.selectOption(optionValue);
        return;
      }
    }
  }

  /**
   * Handle file upload
   */
  private async handleFileUpload(element: Locator, filePath: string): Promise<void> {
    // If no file specified, use a test file
    const testFile = filePath || this.createTestFile();
    await element.setInputFiles(testFile);
  }

  /**
   * Handle date picker
   */
  private async handleDatePicker(element: Locator, value: string): Promise<void> {
    // Try different approaches for date pickers
    const inputType = await element.getAttribute('type');

    if (inputType === 'date' || inputType === 'datetime-local') {
      await element.fill(value);
      return;
    }

    // Click to open picker
    await element.click();
    await this.page.waitForTimeout(300);

    // Try to type the date
    await element.fill(value);
  }

  /**
   * Generate value for a field based on its type
   */
  generateValueForField(field: DiscoveredElement, variant: 'valid' | 'invalid' | 'empty' | 'random'): string {
    if (variant === 'empty') {
      return '';
    }

    const fieldType = field.inputType || 'text';

    if (variant === 'invalid') {
      return this.generateInvalidValue(fieldType);
    }

    return this.generateValue(fieldType);
  }

  /**
   * Generate valid value for field type
   */
  generateValue(fieldType: InputFieldType): string {
    // Check config defaults first
    const configKey = this.getConfigKey(fieldType);
    if (configKey && this.config.formData.defaults[configKey]) {
      return this.config.formData.defaults[configKey];
    }

    switch (fieldType) {
      case 'email':
        return this.generateEmail();

      case 'password':
        return this.generatePassword();

      case 'first-name':
        return this.randomItem(FormFiller.FIRST_NAMES);

      case 'last-name':
        return this.randomItem(FormFiller.LAST_NAMES);

      case 'full-name':
      case 'name':
        return `${this.randomItem(FormFiller.FIRST_NAMES)} ${this.randomItem(FormFiller.LAST_NAMES)}`;

      case 'phone':
        return this.generatePhone();

      case 'address':
        return `${this.randomNumber(100, 9999)} ${this.randomItem(FormFiller.STREETS)}`;

      case 'city':
        return this.randomItem(FormFiller.CITIES);

      case 'state':
        return this.randomItem(FormFiller.STATES);

      case 'zip':
        return String(this.randomNumber(10000, 99999));

      case 'country':
        return 'United States';

      case 'company':
        return this.randomItem(FormFiller.COMPANIES);

      case 'url':
        return `https://www.${this.randomItem(FormFiller.DOMAINS)}`;

      case 'number':
        return String(this.randomNumber(1, 100));

      case 'date':
        return this.generateDate();

      case 'time':
        return this.generateTime();

      case 'datetime':
        return `${this.generateDate()}T${this.generateTime()}`;

      case 'credit-card':
        return this.config.formData.stripe.card;

      case 'cvv':
        return this.config.formData.stripe.cvc;

      case 'expiry':
        return this.config.formData.stripe.exp;

      case 'search':
        return 'test search query';

      case 'message':
      case 'description':
        return this.generateLorem(2);

      case 'text':
      default:
        return `Test Value ${Date.now()}`;
    }
  }

  /**
   * Generate invalid value for validation testing
   */
  generateInvalidValue(fieldType: InputFieldType): string {
    switch (fieldType) {
      case 'email':
        return 'invalid-email-format';

      case 'password':
        return 'x'; // Too short

      case 'phone':
        return 'not-a-phone';

      case 'url':
        return 'not-a-url';

      case 'number':
        return 'NaN';

      case 'date':
        return 'not-a-date';

      case 'zip':
        return 'ABCDE';

      case 'credit-card':
        return '1234';

      case 'cvv':
        return 'ABC';

      case 'expiry':
        return '99/99';

      default:
        // Return valid data for fields that may be required
        return this.generateValue(fieldType);
    }
  }

  /**
   * Get config key for field type
   */
  private getConfigKey(fieldType: InputFieldType): string | null {
    const mapping: Record<string, string> = {
      'first-name': 'firstName',
      'last-name': 'lastName',
      phone: 'phone',
      company: 'company',
      address: 'address',
      city: 'city',
      state: 'state',
      zip: 'zip',
      country: 'country',
    };

    return mapping[fieldType] || null;
  }

  /**
   * Generate random email
   */
  private generateEmail(): string {
    const firstName = this.randomItem(FormFiller.FIRST_NAMES).toLowerCase();
    const domain = this.randomItem(FormFiller.DOMAINS);
    const random = this.randomNumber(100, 999);
    return `${firstName}${random}@${domain}`;
  }

  /**
   * Generate random password
   */
  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const specials = '!@#$%&*';
    let password = '';

    // Add uppercase
    password += chars.charAt(this.randomNumber(0, 25));
    // Add lowercase
    password += chars.charAt(this.randomNumber(26, 51));
    // Add number
    password += chars.charAt(this.randomNumber(52, 59));
    // Add special
    password += specials.charAt(this.randomNumber(0, specials.length - 1));
    // Fill rest
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(this.randomNumber(0, chars.length - 1));
    }

    return password;
  }

  /**
   * Generate random phone
   */
  private generatePhone(): string {
    const area = this.randomNumber(200, 999);
    const exchange = this.randomNumber(200, 999);
    const subscriber = this.randomNumber(1000, 9999);
    return `(${area}) ${exchange}-${subscriber}`;
  }

  /**
   * Generate date (future date within 1 year)
   */
  private generateDate(): string {
    const now = new Date();
    const future = new Date(now.getTime() + this.randomNumber(1, 365) * 24 * 60 * 60 * 1000);
    return future.toISOString().split('T')[0];
  }

  /**
   * Generate time
   */
  private generateTime(): string {
    const hours = String(this.randomNumber(9, 17)).padStart(2, '0');
    const minutes = String(this.randomNumber(0, 59)).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Generate lorem ipsum text
   */
  private generateLorem(sentences: number): string {
    const words = [
      'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
      'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
      'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
    ];

    const result: string[] = [];
    for (let s = 0; s < sentences; s++) {
      const sentenceLength = this.randomNumber(5, 12);
      const sentence: string[] = [];
      for (let w = 0; w < sentenceLength; w++) {
        sentence.push(this.randomItem(words));
      }
      sentence[0] = sentence[0].charAt(0).toUpperCase() + sentence[0].slice(1);
      result.push(sentence.join(' ') + '.');
    }

    return result.join(' ');
  }

  /**
   * Create a test file for file uploads
   */
  private createTestFile(): string {
    // Return path to a test file that should exist in fixtures
    return path.join(__dirname, '..', 'fixtures', 'test-file.txt');
  }

  /**
   * Random number between min and max (inclusive)
   */
  private randomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Random item from array
   */
  private randomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Submit the form
   */
  async submitForm(form: DiscoveredForm): Promise<void> {
    if (form.submitButton) {
      await this.smartLocator.click(form.submitButton.locators);
    } else {
      // Try to find and click a submit button
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Save")',
        'button:has-text("Create")',
        'button:has-text("Continue")',
      ];

      for (const selector of submitSelectors) {
        const button = this.page.locator(selector);
        if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
          await button.click();
          return;
        }
      }

      throw new Error('Could not find submit button');
    }
  }

  /**
   * Check for validation errors on the page
   */
  async getValidationErrors(): Promise<string[]> {
    const errors: string[] = [];
    const errorSelectors = [
      '[class*="error"]',
      '[role="alert"]',
      '.text-red',
      '.text-destructive',
      '[aria-invalid="true"] ~ *',
      '.invalid-feedback',
      '.form-error',
    ];

    for (const selector of errorSelectors) {
      const elements = await this.page.locator(selector).all();
      for (const element of elements) {
        const text = await element.textContent().catch(() => null);
        if (text && text.trim()) {
          errors.push(text.trim());
        }
      }
    }

    return [...new Set(errors)]; // Deduplicate
  }

  /**
   * Wait for form submission result
   */
  async waitForSubmissionResult(options: {
    successIndicators?: string[];
    errorIndicators?: string[];
    timeout?: number;
  } = {}): Promise<'success' | 'error' | 'timeout'> {
    const {
      successIndicators = ['success', 'thank you', 'completed', 'saved'],
      errorIndicators = ['error', 'failed', 'invalid', 'required'],
      timeout = 10000,
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for success indicators
      for (const indicator of successIndicators) {
        const successElement = this.page.locator(`text=/${indicator}/i`);
        if (await successElement.isVisible({ timeout: 500 }).catch(() => false)) {
          return 'success';
        }
      }

      // Check for URL change (often indicates success)
      const urlChanged = await this.page.waitForURL(url => !url.href.includes(this.page.url()), { timeout: 500 }).then(() => true).catch(() => false);
      if (urlChanged) {
        return 'success';
      }

      // Check for error indicators
      const errors = await this.getValidationErrors();
      if (errors.length > 0) {
        return 'error';
      }

      await this.page.waitForTimeout(200);
    }

    return 'timeout';
  }
}

export default FormFiller;
