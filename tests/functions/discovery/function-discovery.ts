/**
 * Edge Functions Discovery Tool
 *
 * Automatically discovers and catalogs all Supabase Edge Functions
 * for testing purposes.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  FunctionDefinition,
  FunctionCategory,
  AuthType,
  TestCase,
} from '../config/functions-test.config';

// Category mappings based on function name patterns
const CATEGORY_PATTERNS: Record<string, FunctionCategory> = {
  // Core
  '_health': 'core',
  'health': 'core',

  // User Management
  'list-users': 'user-management',
  'update-user': 'user-management',
  'user-': 'user-management',

  // Barcode & Food
  'lookup-barcode': 'barcode',
  'enrich-barcode': 'barcode',
  'identify-food': 'barcode',
  'calculate-food': 'barcode',

  // Meal Planning
  'ai-meal-plan': 'meal-planning',
  'meal-': 'meal-planning',
  'suggest-food': 'meal-planning',
  'suggest-recipe': 'meal-planning',
  'parse-recipe': 'meal-planning',
  'manage-meal': 'meal-planning',
  'schedule-meal': 'meal-planning',

  // Weekly Reports
  'weekly-': 'weekly-reports',
  'generate-weekly': 'weekly-reports',
  'schedule-weekly': 'weekly-reports',

  // Blog & Content
  'blog': 'blog',
  'generate-blog': 'blog',
  'update-blog': 'blog',
  'manage-blog': 'blog',
  'publish-scheduled': 'blog',
  'generate-schema': 'blog',
  'generate-social': 'blog',
  'repurpose-content': 'blog',
  'test-blog': 'blog',

  // Email
  'send-email': 'email',
  'send-auth': 'email',
  'process-email': 'email',
  'email': 'email',

  // Payment
  'checkout': 'payment',
  'stripe': 'payment',
  'subscription': 'payment',
  'payment': 'payment',
  'invoice': 'payment',
  'oauth-token': 'payment',

  // SEO
  'seo': 'seo',
  'sitemap': 'seo',
  'analyze-blog': 'seo',
  'check-': 'seo',
  'crawl': 'seo',
  'detect-': 'seo',
  'analyze-': 'seo',
  'optimize-': 'seo',
  'validate-': 'seo',
  'sync-backlinks': 'seo',
  'track-serp': 'seo',
  'monitor-': 'seo',
  'run-scheduled': 'seo',
  'apply-seo': 'seo',

  // Analytics
  'sync-analytics': 'analytics',
  'ga4': 'analytics',
  'gsc': 'analytics',
  'bing': 'analytics',
  'yandex': 'analytics',
  'track-engagement': 'analytics',

  // AI
  'test-ai': 'ai',
  'ai-': 'ai',

  // Delivery
  'delivery': 'delivery',
  'process-delivery': 'delivery',

  // Notifications
  'notification': 'notifications',
  'push': 'notifications',
  'register-push': 'notifications',

  // Misc
  'join-waitlist': 'misc',
  'backup': 'misc',
  'intelligence': 'misc',
  'support': 'misc',
};

// Auth type patterns based on function name and typical requirements
const AUTH_PATTERNS: Record<string, AuthType> = {
  '_health': 'none',
  'join-waitlist': 'none',
  'lookup-barcode': 'none',
  'suggest-': 'none',
  'generate-sitemap': 'anon',
  'generate-schema': 'none',
  'generate-social': 'none',
  'analyze-content': 'none',
  'check-mobile': 'none',
  'check-security': 'none',
  'detect-redirect': 'none',
  'analyze-images': 'none',

  'list-users': 'service_role',
  'update-user': 'service_role',
  'send-emails': 'service_role',
  'process-email': 'service_role',
  'generate-weekly': 'service_role',
  'backup-': 'service_role',
  'test-ai-config': 'service_role',

  'stripe-webhook': 'none', // Uses Stripe signature instead
  'publish-scheduled': 'cron_secret',
  'run-scheduled': 'cron_secret',
  'process-notification': 'cron_secret',

  'ga4-oauth': 'oauth',
  'gsc-oauth': 'oauth',
  'bing-webmaster': 'oauth',
  'yandex-webmaster': 'oauth',
};

export interface DiscoveryResult {
  functions: FunctionDefinition[];
  categories: Record<FunctionCategory, number>;
  totalFunctions: number;
  discoveryTimestamp: string;
  errors: string[];
}

export class FunctionDiscovery {
  private functionsDir: string;
  private cloudflareDir: string;
  private errors: string[] = [];

  constructor(baseDir: string = process.cwd()) {
    this.functionsDir = path.join(baseDir, 'supabase', 'functions');
    this.cloudflareDir = path.join(baseDir, 'functions');
  }

  /**
   * Discover all Edge Functions in the project
   */
  async discover(): Promise<DiscoveryResult> {
    const functions: FunctionDefinition[] = [];
    const categories: Record<FunctionCategory, number> = {
      'core': 0,
      'user-management': 0,
      'barcode': 0,
      'meal-planning': 0,
      'weekly-reports': 0,
      'blog': 0,
      'email': 0,
      'payment': 0,
      'seo': 0,
      'analytics': 0,
      'ai': 0,
      'delivery': 0,
      'notifications': 0,
      'misc': 0,
    };

    // Discover Supabase Edge Functions
    if (fs.existsSync(this.functionsDir)) {
      const supabaseFunctions = await this.discoverSupabaseFunctions();
      functions.push(...supabaseFunctions);
    } else {
      this.errors.push(`Supabase functions directory not found: ${this.functionsDir}`);
    }

    // Discover Cloudflare Pages Functions
    if (fs.existsSync(this.cloudflareDir)) {
      const cloudflareFunctions = await this.discoverCloudflareFunctions();
      functions.push(...cloudflareFunctions);
    }

    // Count by category
    for (const func of functions) {
      categories[func.category]++;
    }

    return {
      functions,
      categories,
      totalFunctions: functions.length,
      discoveryTimestamp: new Date().toISOString(),
      errors: this.errors,
    };
  }

  /**
   * Discover Supabase Edge Functions
   */
  private async discoverSupabaseFunctions(): Promise<FunctionDefinition[]> {
    const functions: FunctionDefinition[] = [];

    try {
      const entries = fs.readdirSync(this.functionsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const functionPath = path.join(this.functionsDir, entry.name, 'index.ts');

          if (fs.existsSync(functionPath)) {
            const funcDef = await this.parseFunctionFile(entry.name, functionPath, 'supabase');
            if (funcDef) {
              functions.push(funcDef);
            }
          }
        }
      }
    } catch (error) {
      this.errors.push(`Error discovering Supabase functions: ${error}`);
    }

    return functions;
  }

  /**
   * Discover Cloudflare Pages Functions
   */
  private async discoverCloudflareFunctions(): Promise<FunctionDefinition[]> {
    const functions: FunctionDefinition[] = [];

    try {
      const entries = fs.readdirSync(this.cloudflareDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.ts')) {
          const functionPath = path.join(this.cloudflareDir, entry.name);
          const functionName = entry.name.replace('.ts', '');
          const funcDef = await this.parseFunctionFile(functionName, functionPath, 'cloudflare');
          if (funcDef) {
            functions.push(funcDef);
          }
        }
      }
    } catch (error) {
      this.errors.push(`Error discovering Cloudflare functions: ${error}`);
    }

    return functions;
  }

  /**
   * Parse a function file and extract metadata
   */
  private async parseFunctionFile(
    name: string,
    filePath: string,
    platform: 'supabase' | 'cloudflare'
  ): Promise<FunctionDefinition | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Determine category
      const category = this.determineCategory(name);

      // Determine auth type
      const authType = this.determineAuthType(name, content);

      // Determine HTTP methods
      const httpMethods = this.determineHttpMethods(content);

      // Extract description from comments
      const description = this.extractDescription(content, name);

      // Check for external API dependencies
      const externalApis = this.detectExternalApis(content);

      // Check if it's a cron job
      const isCronJob = this.isCronJob(content, name);

      // Generate default test cases
      const testCases = this.generateDefaultTestCases(name, httpMethods, authType);

      return {
        name,
        path: platform === 'supabase' ? `/functions/v1/${name}` : `/${name}`,
        category,
        httpMethods,
        authType,
        description,
        testCases,
        isCronJob,
        requiresExternalApi: externalApis.length > 0,
        externalApis,
      };
    } catch (error) {
      this.errors.push(`Error parsing function ${name}: ${error}`);
      return null;
    }
  }

  /**
   * Determine function category based on name patterns
   */
  private determineCategory(name: string): FunctionCategory {
    const lowerName = name.toLowerCase();

    for (const [pattern, category] of Object.entries(CATEGORY_PATTERNS)) {
      if (lowerName.includes(pattern.toLowerCase())) {
        return category;
      }
    }

    return 'misc';
  }

  /**
   * Determine authentication type
   */
  private determineAuthType(name: string, content: string): AuthType {
    const lowerName = name.toLowerCase();

    // Check explicit patterns first
    for (const [pattern, authType] of Object.entries(AUTH_PATTERNS)) {
      if (lowerName.includes(pattern.toLowerCase())) {
        return authType;
      }
    }

    // Check content for auth indicators
    if (content.includes('service_role') || content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return 'service_role';
    }

    if (content.includes('cronSecret') || content.includes('CRON_SECRET')) {
      return 'cron_secret';
    }

    if (content.includes('auth.uid()') || content.includes('Authorization')) {
      return 'bearer';
    }

    // Default to bearer for most functions
    return 'bearer';
  }

  /**
   * Determine HTTP methods from function content
   */
  private determineHttpMethods(content: string): ('GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS')[] {
    const methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS')[] = [];

    // Always include OPTIONS for CORS
    methods.push('OPTIONS');

    // Check for explicit method handling
    if (content.includes("method === 'GET'") || content.includes('req.method === "GET"')) {
      methods.push('GET');
    }
    if (content.includes("method === 'POST'") || content.includes('req.method === "POST"')) {
      methods.push('POST');
    }
    if (content.includes("method === 'PUT'") || content.includes('req.method === "PUT"')) {
      methods.push('PUT');
    }
    if (content.includes("method === 'DELETE'") || content.includes('req.method === "DELETE"')) {
      methods.push('DELETE');
    }

    // If no specific methods found, assume POST is the primary
    if (methods.length === 1) {
      methods.push('POST');
    }

    return methods;
  }

  /**
   * Extract description from function comments
   */
  private extractDescription(content: string, name: string): string {
    // Look for JSDoc comment at the start
    const jsdocMatch = content.match(/\/\*\*[\s\S]*?\*\//);
    if (jsdocMatch) {
      const description = jsdocMatch[0]
        .replace(/\/\*\*|\*\//g, '')
        .replace(/\n\s*\*/g, '\n')
        .trim()
        .split('\n')[0]
        .trim();

      if (description && !description.startsWith('@')) {
        return description;
      }
    }

    // Generate description from name
    return this.generateDescription(name);
  }

  /**
   * Generate description from function name
   */
  private generateDescription(name: string): string {
    const words = name
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return `${words} Edge Function`;
  }

  /**
   * Detect external API dependencies
   */
  private detectExternalApis(content: string): string[] {
    const apis: string[] = [];

    if (content.includes('api.openai.com') || content.includes('OPENAI_API_KEY')) {
      apis.push('OpenAI');
    }
    if (content.includes('api.anthropic.com') || content.includes('ANTHROPIC_API_KEY')) {
      apis.push('Anthropic/Claude');
    }
    if (content.includes('generativelanguage.googleapis.com') || content.includes('GEMINI_API_KEY')) {
      apis.push('Google Gemini');
    }
    if (content.includes('stripe.com') || content.includes('STRIPE')) {
      apis.push('Stripe');
    }
    if (content.includes('resend.com') || content.includes('RESEND_API_KEY')) {
      apis.push('Resend');
    }
    if (content.includes('openfoodfacts.org')) {
      apis.push('Open Food Facts');
    }
    if (content.includes('api.nal.usda.gov') || content.includes('USDA')) {
      apis.push('USDA FoodData Central');
    }
    if (content.includes('googleapis.com/analytics')) {
      apis.push('Google Analytics');
    }
    if (content.includes('searchconsole.googleapis.com')) {
      apis.push('Google Search Console');
    }
    if (content.includes('ahrefs.com')) {
      apis.push('Ahrefs');
    }
    if (content.includes('moz.com')) {
      apis.push('Moz');
    }

    return apis;
  }

  /**
   * Check if function is a cron job
   */
  private isCronJob(content: string, name: string): boolean {
    const cronIndicators = [
      'cronSecret',
      'CRON_SECRET',
      'schedule',
      'process-',
      'run-scheduled',
      'publish-scheduled',
    ];

    const lowerName = name.toLowerCase();
    const lowerContent = content.toLowerCase();

    return cronIndicators.some(
      indicator =>
        lowerName.includes(indicator.toLowerCase()) ||
        lowerContent.includes(indicator.toLowerCase())
    );
  }

  /**
   * Generate default test cases for a function
   */
  private generateDefaultTestCases(
    name: string,
    methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS')[],
    authType: AuthType
  ): TestCase[] {
    const testCases: TestCase[] = [];

    // OPTIONS (CORS) test - always include
    testCases.push({
      name: 'CORS Preflight',
      description: 'Should respond to OPTIONS request with CORS headers',
      input: {},
      expectedStatus: 200,
      validateResponse: () => true,
    });

    // Health check for _health function
    if (name === '_health') {
      testCases.push({
        name: 'Health Check',
        description: 'Should return healthy status',
        input: {},
        expectedStatus: 200,
        expectedResponse: { status: 'healthy' },
      });
      return testCases;
    }

    // GET request test
    if (methods.includes('GET')) {
      testCases.push({
        name: 'GET Request',
        description: 'Should handle GET request',
        input: {},
        expectedStatus: authType === 'none' ? 200 : 401,
      });
    }

    // POST request test with empty body
    if (methods.includes('POST')) {
      testCases.push({
        name: 'POST Empty Body',
        description: 'Should handle POST request with empty body',
        input: {},
        expectedStatus: authType === 'none' ? 400 : 401,
      });
    }

    // Unauthorized access test (if auth required)
    if (authType !== 'none') {
      testCases.push({
        name: 'Unauthorized Access',
        description: 'Should reject unauthorized requests',
        input: {},
        expectedStatus: 401,
      });
    }

    return testCases;
  }

  /**
   * Save discovery results to a JSON file
   */
  async saveResults(result: DiscoveryResult, outputPath?: string): Promise<void> {
    const outputFile = outputPath || path.join(
      process.cwd(),
      'tests',
      'functions',
      'discovery',
      'discovered-functions.json'
    );

    // Ensure directory exists
    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    console.log(`Discovery results saved to: ${outputFile}`);
  }

  /**
   * Print discovery summary
   */
  printSummary(result: DiscoveryResult): void {
    console.log('\n=== Edge Functions Discovery Summary ===\n');
    console.log(`Total Functions: ${result.totalFunctions}`);
    console.log(`Discovery Time: ${result.discoveryTimestamp}\n`);

    console.log('Functions by Category:');
    for (const [category, count] of Object.entries(result.categories)) {
      if (count > 0) {
        console.log(`  ${category}: ${count}`);
      }
    }

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log('\n');
  }
}

// CLI entry point
if (require.main === module) {
  const discovery = new FunctionDiscovery();
  discovery.discover().then(result => {
    discovery.printSummary(result);
    discovery.saveResults(result);
  });
}

export default FunctionDiscovery;
