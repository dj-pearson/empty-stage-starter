import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:8080';
const SCREENSHOTS_DIR = path.join(__dirname, 'audit-screenshots');
const REPORT_FILE = path.join(__dirname, 'mobile-audit-report.md');

// iPhone 12/13 viewport
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Additional test widths
const TEST_WIDTHS = [320, 375, 390, 414];

const PAGES = {
  public: [
    { path: '/', name: 'Landing/Home' },
    { path: '/pricing', name: 'Pricing' },
    { path: '/contact', name: 'Contact' },
    { path: '/faq', name: 'FAQ' },
    { path: '/blog', name: 'Blog' },
    { path: '/auth', name: 'Auth (Signup/Login)' }
  ],
  authenticated: [
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/planner', name: 'Planner' },
    { path: '/recipes', name: 'Recipes' },
    { path: '/pantry', name: 'Pantry' },
    { path: '/grocery', name: 'Grocery' },
    { path: '/kids', name: 'Kids' },
    { path: '/food-tracker', name: 'Food Tracker' },
    { path: '/meal-builder', name: 'Meal Builder' },
    { path: '/insights', name: 'Insights' }
  ],
  admin: [
    { path: '/admin', name: 'Admin' },
    { path: '/admin-dashboard', name: 'Admin Dashboard' }
  ]
};

class MobileAuditor {
  constructor() {
    this.results = [];
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      viewport: MOBILE_VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
    });

    this.page = await context.newPage();
  }

  async auditPage(pagePath, pageName) {
    console.log(`\n🔍 Auditing: ${pageName} (${pagePath})`);

    const result = {
      path: pagePath,
      name: pageName,
      url: `${BASE_URL}${pagePath}`,
      screenshot: null,
      issues: {
        critical: [],
        high: [],
        medium: [],
        low: []
      },
      metrics: {},
      recommendations: []
    };

    try {
      // Navigate to page
      const response = await this.page.goto(result.url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      if (!response || response.status() !== 200) {
        result.issues.critical.push(`Page returned status ${response?.status() || 'unknown'}`);
        return result;
      }

      // Wait a bit for any dynamic content
      await this.page.waitForTimeout(2000);

      // Take screenshot
      const screenshotName = `${pageName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-mobile.png`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      result.screenshot = screenshotName;
      console.log(`  ✓ Screenshot saved: ${screenshotName}`);

      // Check viewport and horizontal scrolling
      const viewportMetrics = await this.page.evaluate(() => {
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyFontSize: getComputedStyle(document.body).fontSize,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth
        };
      });

      result.metrics = viewportMetrics;

      if (viewportMetrics.hasHorizontalScroll) {
        result.issues.high.push(`Horizontal scrolling detected (document width: ${viewportMetrics.documentWidth}px, viewport: ${viewportMetrics.viewportWidth}px)`);
      }

      // Check touch targets (buttons and links)
      const touchTargets = await this.page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'));
        return elements
          .filter(el => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          })
          .map(el => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              text: el.innerText?.substring(0, 50) || el.getAttribute('aria-label') || el.title || 'No text',
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              className: el.className
            };
          });
      });

      // Check for undersized touch targets (< 44x44px)
      const undersizedTargets = touchTargets.filter(t => t.width < 44 || t.height < 44);
      if (undersizedTargets.length > 0) {
        result.issues.high.push(`Found ${undersizedTargets.length} touch targets smaller than 44x44px`);
        undersizedTargets.slice(0, 5).forEach(target => {
          result.issues.medium.push(`Undersized target: "${target.text}" (${target.width}x${target.height}px)`);
        });
      }

      // Check font sizes
      const fontSizes = await this.page.evaluate(() => {
        const textElements = Array.from(document.querySelectorAll('p, span, div, li, a, button, h1, h2, h3, h4, h5, h6'));
        const sizes = new Map();

        textElements.forEach(el => {
          if (el.innerText?.trim()) {
            const fontSize = parseFloat(getComputedStyle(el).fontSize);
            const tag = el.tagName;
            if (!sizes.has(tag)) {
              sizes.set(tag, []);
            }
            sizes.get(tag).push(fontSize);
          }
        });

        const result = {};
        sizes.forEach((values, tag) => {
          const sorted = values.sort((a, b) => a - b);
          result[tag] = {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)]
          };
        });

        return result;
      });

      // Check for text smaller than 16px
      const smallTextTags = Object.entries(fontSizes).filter(([tag, sizes]) => sizes.min < 16);
      if (smallTextTags.length > 0) {
        result.issues.medium.push(`Found text smaller than 16px: ${smallTextTags.map(([tag, sizes]) => `${tag} (${sizes.min}px)`).join(', ')}`);
      }

      // Check text contrast
      const contrastIssues = await this.page.evaluate(() => {
        const getLuminance = (r, g, b) => {
          const [rs, gs, bs] = [r, g, b].map(c => {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };

        const getContrastRatio = (fg, bg) => {
          const l1 = getLuminance(...fg);
          const l2 = getLuminance(...bg);
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        };

        const parseColor = (colorStr) => {
          if (colorStr.startsWith('rgb')) {
            const match = colorStr.match(/\d+/g);
            return match ? match.slice(0, 3).map(Number) : null;
          }
          return null;
        };

        const issues = [];
        const textElements = Array.from(document.querySelectorAll('p, span, div, a, button, h1, h2, h3, h4, h5, h6, li'));

        textElements.slice(0, 50).forEach(el => { // Check first 50 elements
          if (el.innerText?.trim()) {
            const style = getComputedStyle(el);
            const fg = parseColor(style.color);
            const bg = parseColor(style.backgroundColor);

            if (fg && bg) {
              const ratio = getContrastRatio(fg, bg);
              if (ratio < 4.5) {
                issues.push({
                  text: el.innerText.substring(0, 30),
                  ratio: ratio.toFixed(2)
                });
              }
            }
          }
        });

        return issues.slice(0, 5); // Return first 5 issues
      });

      if (contrastIssues.length > 0) {
        contrastIssues.forEach(issue => {
          result.issues.medium.push(`Low contrast text (${issue.ratio}:1): "${issue.text}"`);
        });
      }

      // Check for images
      const imageIssues = await this.page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        const issues = [];

        images.forEach(img => {
          const rect = img.getBoundingClientRect();
          if (rect.width > window.innerWidth) {
            issues.push({
              src: img.src.substring(0, 50),
              width: Math.round(rect.width)
            });
          }
          if (!img.alt && img.src) {
            issues.push({
              type: 'missing-alt',
              src: img.src.substring(0, 50)
            });
          }
        });

        return issues;
      });

      imageIssues.filter(i => i.width).forEach(issue => {
        result.issues.medium.push(`Image overflow: ${issue.src} (${issue.width}px wide)`);
      });

      const missingAltImages = imageIssues.filter(i => i.type === 'missing-alt');
      if (missingAltImages.length > 0) {
        result.issues.low.push(`${missingAltImages.length} images missing alt text`);
      }

      // Check for fixed/sticky elements
      const fixedElements = await this.page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements
          .filter(el => {
            const style = getComputedStyle(el);
            return style.position === 'fixed' || style.position === 'sticky';
          })
          .map(el => ({
            tag: el.tagName,
            className: el.className,
            position: getComputedStyle(el).position,
            height: Math.round(el.getBoundingClientRect().height)
          }));
      });

      if (fixedElements.length > 0) {
        const totalFixedHeight = fixedElements.reduce((sum, el) => sum + el.height, 0);
        if (totalFixedHeight > 200) {
          result.issues.high.push(`Large amount of fixed content (${totalFixedHeight}px) may obscure page content`);
        }
      }

      // Test scrolling
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await this.page.waitForTimeout(500);
      await this.page.evaluate(() => window.scrollTo(0, 0));

      // Check for form inputs
      const formInputs = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
        return inputs
          .filter(el => {
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          })
          .map(el => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return {
              type: el.type || el.tagName,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              fontSize: parseFloat(style.fontSize),
              hasLabel: !!el.labels?.length || !!el.getAttribute('aria-label')
            };
          });
      });

      const undersizedInputs = formInputs.filter(i => i.height < 44);
      if (undersizedInputs.length > 0) {
        result.issues.high.push(`${undersizedInputs.length} form inputs smaller than 44px height`);
      }

      const inputsWithoutLabels = formInputs.filter(i => !i.hasLabel);
      if (inputsWithoutLabels.length > 0) {
        result.issues.medium.push(`${inputsWithoutLabels.length} form inputs missing labels`);
      }

      // Test at different widths
      const widthTests = [];
      for (const width of TEST_WIDTHS) {
        await this.page.setViewportSize({ width, height: 844 });
        await this.page.waitForTimeout(500);

        const hasHorizontalScroll = await this.page.evaluate(() =>
          document.documentElement.scrollWidth > window.innerWidth
        );

        widthTests.push({ width, hasHorizontalScroll });
      }

      const problematicWidths = widthTests.filter(t => t.hasHorizontalScroll);
      if (problematicWidths.length > 0) {
        result.issues.medium.push(`Horizontal scrolling at widths: ${problematicWidths.map(w => w.width + 'px').join(', ')}`);
      }

      // Reset viewport
      await this.page.setViewportSize(MOBILE_VIEWPORT);

      // Generate recommendations
      if (result.issues.critical.length === 0 && result.issues.high.length === 0) {
        result.recommendations.push('Good mobile optimization');
      }
      if (undersizedTargets.length > 0) {
        result.recommendations.push('Increase touch target sizes to minimum 44x44px');
      }
      if (smallTextTags.length > 0) {
        result.recommendations.push('Increase font size to minimum 16px for body text');
      }
      if (viewportMetrics.hasHorizontalScroll) {
        result.recommendations.push('Fix horizontal overflow by reviewing element widths and padding');
      }

      console.log(`  ✓ Audit complete: ${result.issues.critical.length} critical, ${result.issues.high.length} high, ${result.issues.medium.length} medium, ${result.issues.low.length} low issues`);

    } catch (error) {
      console.error(`  ✗ Error auditing page: ${error.message}`);
      result.issues.critical.push(`Error during audit: ${error.message}`);
    }

    return result;
  }

  async auditAllPages() {
    await this.initialize();

    console.log('📱 Starting Mobile-First Audit for EatPal');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Viewport: ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height}`);
    console.log(`Screenshots directory: ${SCREENSHOTS_DIR}\n`);

    // Audit public pages
    console.log('=== PUBLIC PAGES ===');
    for (const page of PAGES.public) {
      const result = await this.auditPage(page.path, page.name);
      this.results.push(result);
    }

    // Note: Authenticated and admin pages may require login
    // We'll attempt to access them but they may redirect to auth

    console.log('\n=== AUTHENTICATED PAGES ===');
    console.log('Note: These pages may require authentication and could redirect to login page');
    for (const page of PAGES.authenticated) {
      const result = await this.auditPage(page.path, page.name);
      this.results.push(result);
    }

    console.log('\n=== ADMIN PAGES ===');
    console.log('Note: These pages may require admin authentication and could redirect to login page');
    for (const page of PAGES.admin) {
      const result = await this.auditPage(page.path, page.name);
      this.results.push(result);
    }

    await this.browser.close();
  }

  generateReport() {
    const report = [];

    report.push('# EatPal Mobile-First Audit Report\n');
    report.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
    report.push(`**Viewport:** ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height} (iPhone 12/13)`);
    report.push(`**Base URL:** ${BASE_URL}`);
    report.push(`**Pages Audited:** ${this.results.length}\n`);

    // Executive Summary
    report.push('## Executive Summary\n');

    const totalIssues = {
      critical: this.results.reduce((sum, r) => sum + r.issues.critical.length, 0),
      high: this.results.reduce((sum, r) => sum + r.issues.high.length, 0),
      medium: this.results.reduce((sum, r) => sum + r.issues.medium.length, 0),
      low: this.results.reduce((sum, r) => sum + r.issues.low.length, 0)
    };

    report.push(`- **Critical Issues:** ${totalIssues.critical}`);
    report.push(`- **High Priority Issues:** ${totalIssues.high}`);
    report.push(`- **Medium Priority Issues:** ${totalIssues.medium}`);
    report.push(`- **Low Priority Issues:** ${totalIssues.low}`);
    report.push(`- **Total Issues:** ${Object.values(totalIssues).reduce((a, b) => a + b, 0)}\n`);

    // Mobile Optimization Score
    const maxPossibleIssues = this.results.length * 10; // Rough estimate
    const actualIssues = totalIssues.critical * 3 + totalIssues.high * 2 + totalIssues.medium * 1 + totalIssues.low * 0.5;
    const score = Math.max(1, Math.min(10, 10 - (actualIssues / maxPossibleIssues) * 10));

    report.push(`### Mobile Optimization Score: ${score.toFixed(1)}/10\n`);

    if (score >= 8) {
      report.push('Excellent mobile optimization. Minor improvements recommended.\n');
    } else if (score >= 6) {
      report.push('Good mobile optimization with some areas for improvement.\n');
    } else if (score >= 4) {
      report.push('Fair mobile optimization. Several important issues need attention.\n');
    } else {
      report.push('Poor mobile optimization. Significant improvements required.\n');
    }

    // Common Issues Across Pages
    report.push('## Common Issues Across Pages\n');

    const commonIssuePatterns = {};
    this.results.forEach(result => {
      Object.entries(result.issues).forEach(([severity, issues]) => {
        issues.forEach(issue => {
          const pattern = issue.split(':')[0].trim();
          if (!commonIssuePatterns[pattern]) {
            commonIssuePatterns[pattern] = { count: 0, severity, pages: [] };
          }
          commonIssuePatterns[pattern].count++;
          commonIssuePatterns[pattern].pages.push(result.name);
        });
      });
    });

    const sortedPatterns = Object.entries(commonIssuePatterns)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    if (sortedPatterns.length > 0) {
      sortedPatterns.forEach(([pattern, data]) => {
        report.push(`- **${pattern}** (${data.count} pages affected)`);
        report.push(`  - Severity: ${data.severity}`);
        report.push(`  - Pages: ${data.pages.slice(0, 5).join(', ')}${data.pages.length > 5 ? '...' : ''}\n`);
      });
    } else {
      report.push('No common issues found across multiple pages.\n');
    }

    // Priority Fixes
    report.push('## Priority Fixes\n');

    const priorityFixes = [];

    if (totalIssues.critical > 0) {
      priorityFixes.push('1. **CRITICAL:** Address all page loading and navigation errors');
    }

    const touchTargetPages = this.results.filter(r =>
      r.issues.high.some(i => i.includes('touch target')) || r.issues.medium.some(i => i.includes('Undersized target'))
    );
    if (touchTargetPages.length > 0) {
      priorityFixes.push(`2. **HIGH:** Increase touch target sizes on ${touchTargetPages.length} pages to minimum 44x44px`);
    }

    const horizontalScrollPages = this.results.filter(r =>
      r.issues.high.some(i => i.includes('Horizontal scrolling')) || r.issues.medium.some(i => i.includes('Horizontal scrolling'))
    );
    if (horizontalScrollPages.length > 0) {
      priorityFixes.push(`3. **HIGH:** Fix horizontal overflow on ${horizontalScrollPages.length} pages`);
    }

    const fontSizePages = this.results.filter(r =>
      r.issues.medium.some(i => i.includes('smaller than 16px'))
    );
    if (fontSizePages.length > 0) {
      priorityFixes.push(`4. **MEDIUM:** Increase minimum font size on ${fontSizePages.length} pages`);
    }

    const contrastPages = this.results.filter(r =>
      r.issues.medium.some(i => i.includes('Low contrast'))
    );
    if (contrastPages.length > 0) {
      priorityFixes.push(`5. **MEDIUM:** Improve text contrast on ${contrastPages.length} pages`);
    }

    if (priorityFixes.length > 0) {
      priorityFixes.forEach(fix => report.push(fix));
    } else {
      report.push('No priority fixes required. Continue monitoring and testing.\n');
    }

    report.push('');

    // Detailed Page Results
    report.push('## Detailed Page Results\n');

    const pagesByCategory = {
      'Public Pages': PAGES.public.map(p => p.name),
      'Authenticated Pages': PAGES.authenticated.map(p => p.name),
      'Admin Pages': PAGES.admin.map(p => p.name)
    };

    Object.entries(pagesByCategory).forEach(([category, pageNames]) => {
      report.push(`### ${category}\n`);

      this.results
        .filter(r => pageNames.includes(r.name))
        .forEach(result => {
          report.push(`#### ${result.name}`);
          report.push(`- **URL:** ${result.url}`);
          report.push(`- **Screenshot:** \`${result.screenshot}\``);

          const issueCount = Object.values(result.issues).reduce((sum, arr) => sum + arr.length, 0);
          report.push(`- **Total Issues:** ${issueCount}`);

          if (result.metrics.viewportWidth) {
            report.push(`- **Viewport Width:** ${result.metrics.viewportWidth}px`);
            report.push(`- **Document Width:** ${result.metrics.documentWidth}px`);
            report.push(`- **Body Font Size:** ${result.metrics.bodyFontSize}`);
          }

          // Critical Issues
          if (result.issues.critical.length > 0) {
            report.push('\n**Critical Issues:**');
            result.issues.critical.forEach(issue => report.push(`- ${issue}`));
          }

          // High Priority Issues
          if (result.issues.high.length > 0) {
            report.push('\n**High Priority Issues:**');
            result.issues.high.forEach(issue => report.push(`- ${issue}`));
          }

          // Medium Priority Issues
          if (result.issues.medium.length > 0) {
            report.push('\n**Medium Priority Issues:**');
            result.issues.medium.forEach(issue => report.push(`- ${issue}`));
          }

          // Low Priority Issues
          if (result.issues.low.length > 0) {
            report.push('\n**Low Priority Issues:**');
            result.issues.low.forEach(issue => report.push(`- ${issue}`));
          }

          // Recommendations
          if (result.recommendations.length > 0) {
            report.push('\n**Recommendations:**');
            result.recommendations.forEach(rec => report.push(`- ${rec}`));
          }

          report.push('');
        });
    });

    // Best Practices
    report.push('## Mobile Best Practices Checklist\n');

    const bestPractices = [
      { name: 'Touch targets minimum 44x44px', status: totalIssues.high === 0 || !this.results.some(r => r.issues.high.some(i => i.includes('touch target'))) },
      { name: 'No horizontal scrolling', status: !this.results.some(r => r.issues.high.some(i => i.includes('Horizontal scrolling'))) },
      { name: 'Minimum 16px body text', status: !this.results.some(r => r.issues.medium.some(i => i.includes('smaller than 16px'))) },
      { name: 'Text contrast 4.5:1 or higher', status: !this.results.some(r => r.issues.medium.some(i => i.includes('Low contrast'))) },
      { name: 'Images scale properly', status: !this.results.some(r => r.issues.medium.some(i => i.includes('Image overflow'))) },
      { name: 'Form inputs properly sized', status: !this.results.some(r => r.issues.high.some(i => i.includes('form inputs smaller'))) },
      { name: 'All images have alt text', status: totalIssues.low === 0 || !this.results.some(r => r.issues.low.some(i => i.includes('missing alt'))) },
      { name: 'Responsive at multiple widths', status: !this.results.some(r => r.issues.medium.some(i => i.includes('Horizontal scrolling at widths'))) }
    ];

    bestPractices.forEach(practice => {
      const status = practice.status ? '✅' : '❌';
      report.push(`- ${status} ${practice.name}`);
    });

    report.push('');

    // Recommendations Section
    report.push('## General Recommendations\n');
    report.push('1. **Touch Targets:** Ensure all interactive elements (buttons, links) are at least 44x44px with adequate spacing');
    report.push('2. **Typography:** Use minimum 16px for body text, with appropriate line-height (1.5-1.6)');
    report.push('3. **Contrast:** Maintain WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)');
    report.push('4. **Responsive Images:** Use responsive image techniques (srcset, sizes) to optimize loading');
    report.push('5. **Fixed Elements:** Minimize fixed/sticky content that takes up vertical space');
    report.push('6. **Form Design:** Use full-width inputs on mobile with clear labels and error states');
    report.push('7. **Testing:** Test on real devices across different screen sizes and orientations');
    report.push('8. **Performance:** Optimize images, minimize JavaScript, and use lazy loading');

    report.push('\n---\n');
    report.push(`Report generated: ${new Date().toISOString()}`);
    report.push(`Audit tool: Playwright Mobile Audit Script`);

    const reportContent = report.join('\n');
    fs.writeFileSync(REPORT_FILE, reportContent);

    console.log(`\n✅ Report saved to: ${REPORT_FILE}`);
    return reportContent;
  }
}

async function main() {
  const auditor = new MobileAuditor();

  try {
    await auditor.auditAllPages();
    auditor.generateReport();

    console.log('\n🎉 Mobile audit complete!');
    console.log(`📸 Screenshots saved to: ${SCREENSHOTS_DIR}`);
    console.log(`📄 Report saved to: ${REPORT_FILE}`);

  } catch (error) {
    console.error('Error during audit:', error);
    process.exit(1);
  }
}

main();
