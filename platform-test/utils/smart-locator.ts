/**
 * Smart Locator with Self-Healing
 *
 * Provides intelligent element location with:
 * - Multiple fallback strategies
 * - Self-healing when primary locator fails
 * - Context-aware element discovery
 * - Visual similarity matching
 */

import { Page, Locator, ElementHandle } from 'playwright';
import { SmartLocator as SmartLocatorType } from '../core/types';
import { config } from '../config';

/**
 * Healing event for tracking self-healed locators
 */
export interface HealingEvent {
  timestamp: number;
  originalLocator: SmartLocatorType;
  healedLocator: string;
  reason: string;
  page: string;
}

/**
 * Smart Locator class with self-healing capabilities
 */
export class SmartLocator {
  private page: Page;
  private healingHistory: HealingEvent[] = [];
  private enableSelfHealing: boolean;

  constructor(page: Page, enableSelfHealing = true) {
    this.page = page;
    this.enableSelfHealing = enableSelfHealing && config.ai.selfHealing;
  }

  /**
   * Find an element using smart locator with fallbacks
   */
  async find(locator: SmartLocatorType, timeout?: number): Promise<Locator> {
    const timeoutMs = timeout || config.timeouts.action;

    // Try primary locator first
    try {
      const element = this.page.locator(locator.primary);
      if (await element.isVisible({ timeout: timeoutMs / 3 }).catch(() => false)) {
        return element;
      }
    } catch {
      // Primary failed, try fallbacks
    }

    // Try fallback locators
    for (const fallback of locator.fallbacks) {
      try {
        const element = this.page.locator(fallback);
        if (await element.isVisible({ timeout: timeoutMs / 4 }).catch(() => false)) {
          // Record healing event
          if (this.enableSelfHealing) {
            this.recordHealing(locator, fallback, 'Primary locator failed, used fallback');
          }
          return element;
        }
      } catch {
        continue;
      }
    }

    // If all fallbacks fail, try self-healing
    if (this.enableSelfHealing) {
      const healedElement = await this.selfHeal(locator);
      if (healedElement) {
        return healedElement;
      }
    }

    // Last resort: throw with helpful error
    throw new Error(
      `Could not find element with locator: ${locator.primary}\n` +
      `Fallbacks tried: ${locator.fallbacks.join(', ')}\n` +
      `Description: ${locator.description}`
    );
  }

  /**
   * Click an element using smart locator
   */
  async click(locator: SmartLocatorType, options?: { timeout?: number; force?: boolean }): Promise<void> {
    const element = await this.find(locator, options?.timeout);
    await element.click({ force: options?.force });
  }

  /**
   * Fill an element using smart locator
   */
  async fill(locator: SmartLocatorType, value: string, options?: { timeout?: number }): Promise<void> {
    const element = await this.find(locator, options?.timeout);
    await element.fill(value);
  }

  /**
   * Select option using smart locator
   */
  async select(locator: SmartLocatorType, value: string, options?: { timeout?: number }): Promise<void> {
    const element = await this.find(locator, options?.timeout);
    await element.selectOption(value);
  }

  /**
   * Check checkbox using smart locator
   */
  async check(locator: SmartLocatorType, options?: { timeout?: number }): Promise<void> {
    const element = await this.find(locator, options?.timeout);
    await element.check();
  }

  /**
   * Uncheck checkbox using smart locator
   */
  async uncheck(locator: SmartLocatorType, options?: { timeout?: number }): Promise<void> {
    const element = await this.find(locator, options?.timeout);
    await element.uncheck();
  }

  /**
   * Hover over element using smart locator
   */
  async hover(locator: SmartLocatorType, options?: { timeout?: number }): Promise<void> {
    const element = await this.find(locator, options?.timeout);
    await element.hover();
  }

  /**
   * Get text content using smart locator
   */
  async textContent(locator: SmartLocatorType, options?: { timeout?: number }): Promise<string | null> {
    const element = await this.find(locator, options?.timeout);
    return element.textContent();
  }

  /**
   * Get attribute using smart locator
   */
  async getAttribute(locator: SmartLocatorType, name: string, options?: { timeout?: number }): Promise<string | null> {
    const element = await this.find(locator, options?.timeout);
    return element.getAttribute(name);
  }

  /**
   * Check if element is visible
   */
  async isVisible(locator: SmartLocatorType, options?: { timeout?: number }): Promise<boolean> {
    try {
      const element = await this.find(locator, options?.timeout);
      return element.isVisible();
    } catch {
      return false;
    }
  }

  /**
   * Self-healing: Try to find element using alternative strategies
   */
  private async selfHeal(locator: SmartLocatorType): Promise<Locator | null> {
    console.log(`[Self-Healing] Attempting to heal locator: ${locator.primary}`);

    const strategies = [
      // Strategy 1: Try relaxed text matching
      async () => {
        if (locator.type === 'text') {
          const text = this.extractText(locator.primary);
          if (text) {
            const variants = [
              `text=${text}`,
              `*:has-text("${text}")`,
              `//*[contains(text(), "${text}")]`,
            ];
            for (const variant of variants) {
              const el = this.page.locator(variant);
              if (await el.count() > 0 && await el.first().isVisible({ timeout: 1000 }).catch(() => false)) {
                this.recordHealing(locator, variant, 'Text-based healing');
                return el.first();
              }
            }
          }
        }
        return null;
      },

      // Strategy 2: Try by role with accessible name
      async () => {
        if (locator.description) {
          const roles = ['button', 'link', 'textbox', 'checkbox', 'combobox', 'dialog'];
          for (const role of roles) {
            const el = this.page.getByRole(role as any, { name: locator.description });
            if (await el.count() > 0 && await el.first().isVisible({ timeout: 1000 }).catch(() => false)) {
              const healedSelector = `role=${role}[name="${locator.description}"]`;
              this.recordHealing(locator, healedSelector, 'Role-based healing');
              return el.first();
            }
          }
        }
        return null;
      },

      // Strategy 3: Try by placeholder
      async () => {
        const placeholder = this.extractPlaceholder(locator);
        if (placeholder) {
          const el = this.page.getByPlaceholder(placeholder);
          if (await el.count() > 0 && await el.first().isVisible({ timeout: 1000 }).catch(() => false)) {
            this.recordHealing(locator, `[placeholder="${placeholder}"]`, 'Placeholder-based healing');
            return el.first();
          }
        }
        return null;
      },

      // Strategy 4: Try by label
      async () => {
        const label = this.extractLabel(locator);
        if (label) {
          const el = this.page.getByLabel(label);
          if (await el.count() > 0 && await el.first().isVisible({ timeout: 1000 }).catch(() => false)) {
            this.recordHealing(locator, `label="${label}"`, 'Label-based healing');
            return el.first();
          }
        }
        return null;
      },

      // Strategy 5: Try by partial class match
      async () => {
        const className = this.extractClassName(locator.primary);
        if (className) {
          const partialMatch = className.split('-')[0] || className.split('_')[0];
          if (partialMatch && partialMatch.length > 3) {
            const el = this.page.locator(`[class*="${partialMatch}"]`);
            if (await el.count() > 0 && await el.first().isVisible({ timeout: 1000 }).catch(() => false)) {
              this.recordHealing(locator, `[class*="${partialMatch}"]`, 'Class-based healing');
              return el.first();
            }
          }
        }
        return null;
      },

      // Strategy 6: Try by data attributes
      async () => {
        const dataAttrs = ['data-testid', 'data-test', 'data-cy', 'data-id'];
        for (const attr of dataAttrs) {
          const value = this.extractDataAttribute(locator.primary, attr);
          if (value) {
            // Try partial match
            const parts = value.split('-');
            if (parts.length > 1) {
              const partial = parts.slice(0, -1).join('-');
              const el = this.page.locator(`[${attr}*="${partial}"]`);
              if (await el.count() > 0 && await el.first().isVisible({ timeout: 1000 }).catch(() => false)) {
                this.recordHealing(locator, `[${attr}*="${partial}"]`, 'Data attribute healing');
                return el.first();
              }
            }
          }
        }
        return null;
      },

      // Strategy 7: Try by nth sibling with similar characteristics
      async () => {
        // Find similar elements and try each
        const tagName = this.extractTagName(locator.primary);
        if (tagName) {
          const elements = this.page.locator(tagName);
          const count = await elements.count();
          for (let i = 0; i < Math.min(count, 10); i++) {
            const el = elements.nth(i);
            if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
              const text = await el.textContent().catch(() => '');
              if (text && locator.description && text.toLowerCase().includes(locator.description.toLowerCase())) {
                this.recordHealing(locator, `${tagName}:nth-of-type(${i + 1})`, 'Sibling-based healing');
                return el;
              }
            }
          }
        }
        return null;
      },
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result) {
          console.log(`[Self-Healing] Successfully healed locator`);
          return result;
        }
      } catch (error) {
        // Strategy failed, try next
        continue;
      }
    }

    console.log(`[Self-Healing] Could not heal locator: ${locator.primary}`);
    return null;
  }

  /**
   * Record a healing event
   */
  private recordHealing(original: SmartLocatorType, healed: string, reason: string): void {
    const event: HealingEvent = {
      timestamp: Date.now(),
      originalLocator: original,
      healedLocator: healed,
      reason,
      page: this.page.url(),
    };
    this.healingHistory.push(event);
    console.log(`[Self-Healing] Healed: "${original.primary}" -> "${healed}" (${reason})`);
  }

  /**
   * Get healing history
   */
  getHealingHistory(): HealingEvent[] {
    return [...this.healingHistory];
  }

  /**
   * Clear healing history
   */
  clearHealingHistory(): void {
    this.healingHistory = [];
  }

  /**
   * Extract text from locator
   */
  private extractText(locator: string): string | null {
    const textMatch = locator.match(/text[=:]"([^"]+)"|:has-text\("([^"]+)"\)/);
    return textMatch ? (textMatch[1] || textMatch[2]) : null;
  }

  /**
   * Extract placeholder from locator
   */
  private extractPlaceholder(locator: SmartLocatorType): string | null {
    const match = locator.primary.match(/placeholder[=:]"([^"]+)"/);
    if (match) return match[1];

    for (const fallback of locator.fallbacks) {
      const fallbackMatch = fallback.match(/placeholder[=:]"([^"]+)"/);
      if (fallbackMatch) return fallbackMatch[1];
    }

    return null;
  }

  /**
   * Extract label from locator
   */
  private extractLabel(locator: SmartLocatorType): string | null {
    const match = locator.primary.match(/label[=:]"([^"]+)"|aria-label[=:]"([^"]+)"/);
    if (match) return match[1] || match[2];

    return locator.description || null;
  }

  /**
   * Extract class name from locator
   */
  private extractClassName(locator: string): string | null {
    const match = locator.match(/\.([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract data attribute value
   */
  private extractDataAttribute(locator: string, attr: string): string | null {
    const regex = new RegExp(`${attr}[=:]"([^"]+)"`);
    const match = locator.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Extract tag name from locator
   */
  private extractTagName(locator: string): string | null {
    const match = locator.match(/^([a-zA-Z]+)/);
    return match ? match[1] : null;
  }
}

export default SmartLocator;
