/**
 * Edge Functions Test Runner
 *
 * Orchestrates the discovery, generation, and execution of Edge Function tests.
 *
 * Usage:
 *   npm run test:functions            # Full pipeline: discover, generate, run
 *   npm run test:functions:discover   # Only discover functions
 *   npm run test:functions:generate   # Only generate tests
 *   npm run test:functions:run        # Only run tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import FunctionDiscovery, { DiscoveryResult } from '../discovery/function-discovery';
import TestGenerator, { GenerationResult } from '../generator/test-generator';
import { loadConfig, TestResult } from '../config/functions-test.config';

export interface RunnerOptions {
  mode: 'full' | 'discover' | 'generate' | 'run';
  categories?: string[];
  functions?: string[];
  parallel?: boolean;
  headless?: boolean;
  reporter?: 'html' | 'list' | 'json' | 'junit';
  outputDir?: string;
  verbose?: boolean;
}

export interface RunResult {
  discovery?: DiscoveryResult;
  generation?: GenerationResult;
  execution?: {
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    results: TestResult[];
  };
  errors: string[];
  timestamp: string;
}

export class FunctionTestRunner {
  private config = loadConfig();
  private baseDir: string;
  private outputDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.cwd();
    this.outputDir = path.join(this.baseDir, 'tests', 'functions');
  }

  /**
   * Run the complete test pipeline
   */
  async run(options: RunnerOptions): Promise<RunResult> {
    const result: RunResult = {
      errors: [],
      timestamp: new Date().toISOString(),
    };

    console.log('\n========================================');
    console.log('  Edge Functions Test Runner');
    console.log('========================================\n');

    try {
      // Phase 1: Discovery
      if (options.mode === 'full' || options.mode === 'discover') {
        console.log('[Phase 1] Discovering Edge Functions...\n');
        result.discovery = await this.runDiscovery(options);

        if (options.verbose) {
          this.printDiscoveryDetails(result.discovery);
        }
      }

      // Phase 2: Generation
      if (options.mode === 'full' || options.mode === 'generate') {
        console.log('[Phase 2] Generating Tests...\n');

        // Load discovery results if not in full mode
        if (!result.discovery) {
          result.discovery = this.loadDiscoveryResults();
        }

        if (result.discovery) {
          result.generation = await this.runGeneration(result.discovery, options);
        } else {
          result.errors.push('No discovery results available for generation');
        }
      }

      // Phase 3: Execution
      if (options.mode === 'full' || options.mode === 'run') {
        console.log('[Phase 3] Executing Tests...\n');
        result.execution = await this.runExecution(options);
      }

      // Save results
      await this.saveResults(result);

      // Print summary
      this.printSummary(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Runner error: ${errorMessage}`);
      console.error(`\nError: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Run function discovery phase
   */
  private async runDiscovery(options: RunnerOptions): Promise<DiscoveryResult> {
    const discovery = new FunctionDiscovery(this.baseDir);
    const result = await discovery.discover();

    // Filter by categories if specified
    if (options.categories && options.categories.length > 0) {
      result.functions = result.functions.filter(f =>
        options.categories!.includes(f.category)
      );
    }

    // Filter by specific functions if specified
    if (options.functions && options.functions.length > 0) {
      result.functions = result.functions.filter(f =>
        options.functions!.includes(f.name)
      );
    }

    // Save discovery results
    await discovery.saveResults(result);

    console.log(`  Found ${result.totalFunctions} functions`);
    console.log(`  Categories: ${Object.keys(result.categories).filter(c => result.categories[c as keyof typeof result.categories] > 0).length}`);

    return result;
  }

  /**
   * Run test generation phase
   */
  private async runGeneration(
    discovery: DiscoveryResult,
    options: RunnerOptions
  ): Promise<GenerationResult> {
    const outputDir = options.outputDir || path.join(this.outputDir, 'generated');
    const generator = new TestGenerator(outputDir);
    const result = await generator.generateTests(discovery.functions);

    console.log(`  Generated ${result.totalTests} tests`);
    console.log(`  Test files: ${result.tests.length}`);

    return result;
  }

  /**
   * Run test execution phase
   */
  private async runExecution(options: RunnerOptions): Promise<{
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    results: TestResult[];
  }> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    // Build Playwright command
    const playwrightArgs = ['test'];

    // Add test directory
    playwrightArgs.push(path.join(this.outputDir, 'generated'));

    // Add reporter
    if (options.reporter) {
      playwrightArgs.push(`--reporter=${options.reporter}`);
    }

    // Add project (browser)
    playwrightArgs.push('--project=chromium');

    // Add headless option
    if (!options.headless) {
      playwrightArgs.push('--headed');
    }

    // Add parallel option
    if (!options.parallel) {
      playwrightArgs.push('--workers=1');
    }

    console.log(`  Running: npx playwright ${playwrightArgs.join(' ')}`);

    return new Promise((resolve) => {
      let passed = 0;
      let failed = 0;
      let skipped = 0;
      let output = '';

      const playwright = spawn('npx', ['playwright', ...playwrightArgs], {
        cwd: this.baseDir,
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      playwright.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);

        // Parse output for results
        const passMatch = text.match(/(\d+) passed/);
        const failMatch = text.match(/(\d+) failed/);
        const skipMatch = text.match(/(\d+) skipped/);

        if (passMatch) passed = parseInt(passMatch[1], 10);
        if (failMatch) failed = parseInt(failMatch[1], 10);
        if (skipMatch) skipped = parseInt(skipMatch[1], 10);
      });

      playwright.stderr?.on('data', (data) => {
        process.stderr.write(data);
      });

      playwright.on('close', (code) => {
        const duration = Date.now() - startTime;

        // If no results parsed, try to parse final output
        if (passed === 0 && failed === 0) {
          const finalPassMatch = output.match(/(\d+) passed/);
          const finalFailMatch = output.match(/(\d+) failed/);
          const finalSkipMatch = output.match(/(\d+) skipped/);

          if (finalPassMatch) passed = parseInt(finalPassMatch[1], 10);
          if (finalFailMatch) failed = parseInt(finalFailMatch[1], 10);
          if (finalSkipMatch) skipped = parseInt(finalSkipMatch[1], 10);
        }

        resolve({
          passed,
          failed,
          skipped,
          duration,
          results,
        });
      });
    });
  }

  /**
   * Load previously saved discovery results
   */
  private loadDiscoveryResults(): DiscoveryResult | null {
    const discoveryFile = path.join(
      this.outputDir,
      'discovery',
      'discovered-functions.json'
    );

    if (fs.existsSync(discoveryFile)) {
      const content = fs.readFileSync(discoveryFile, 'utf-8');
      return JSON.parse(content);
    }

    return null;
  }

  /**
   * Save run results
   */
  private async saveResults(result: RunResult): Promise<void> {
    const resultsDir = path.join(this.outputDir, 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(resultsDir, `run-${timestamp}.json`);
    const latestFile = path.join(resultsDir, 'latest.json');

    fs.writeFileSync(resultsFile, JSON.stringify(result, null, 2));
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));

    console.log(`\n  Results saved to: ${resultsFile}`);
  }

  /**
   * Print discovery details
   */
  private printDiscoveryDetails(discovery: DiscoveryResult): void {
    console.log('\n  Discovered Functions:');
    for (const func of discovery.functions) {
      console.log(`    - ${func.name} (${func.category})`);
      console.log(`      Auth: ${func.authType}`);
      console.log(`      Methods: ${func.httpMethods.join(', ')}`);
      if (func.externalApis && func.externalApis.length > 0) {
        console.log(`      External APIs: ${func.externalApis.join(', ')}`);
      }
    }
  }

  /**
   * Print run summary
   */
  private printSummary(result: RunResult): void {
    console.log('\n========================================');
    console.log('  Test Run Summary');
    console.log('========================================\n');

    if (result.discovery) {
      console.log(`  Discovery: ${result.discovery.totalFunctions} functions found`);
    }

    if (result.generation) {
      console.log(`  Generation: ${result.generation.totalTests} tests generated`);
    }

    if (result.execution) {
      console.log(`  Execution:`);
      console.log(`    Passed:  ${result.execution.passed}`);
      console.log(`    Failed:  ${result.execution.failed}`);
      console.log(`    Skipped: ${result.execution.skipped}`);
      console.log(`    Duration: ${(result.execution.duration / 1000).toFixed(2)}s`);
    }

    if (result.errors.length > 0) {
      console.log('\n  Errors:');
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }

    console.log('\n');
  }
}

// CLI entry point
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const options: RunnerOptions = {
    mode: 'full',
    parallel: true,
    headless: true,
    reporter: 'html',
    verbose: false,
  };

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case 'discover':
        options.mode = 'discover';
        break;
      case 'generate':
        options.mode = 'generate';
        break;
      case 'run':
        options.mode = 'run';
        break;
      case 'full':
        options.mode = 'full';
        break;
      case '--no-parallel':
        options.parallel = false;
        break;
      case '--headed':
      case '--no-headless':
        options.headless = false;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--reporter':
        options.reporter = args[++i] as 'html' | 'list' | 'json' | 'junit';
        break;
      case '--category':
        options.categories = options.categories || [];
        options.categories.push(args[++i]);
        break;
      case '--function':
        options.functions = options.functions || [];
        options.functions.push(args[++i]);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  const runner = new FunctionTestRunner();
  const result = await runner.run(options);

  // Exit with appropriate code
  if (result.execution && result.execution.failed > 0) {
    process.exit(1);
  } else if (result.errors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

function printHelp(): void {
  console.log(`
Edge Functions Test Runner

Usage:
  npx ts-node function-test-runner.ts [mode] [options]

Modes:
  full        Run full pipeline: discover, generate, run (default)
  discover    Only discover functions
  generate    Only generate tests
  run         Only run tests

Options:
  --category <name>    Filter by category (can specify multiple)
  --function <name>    Filter by function name (can specify multiple)
  --no-parallel        Run tests sequentially
  --headed             Run browser in headed mode
  --verbose, -v        Show detailed output
  --reporter <type>    Report format: html, list, json, junit
  --help, -h           Show this help message

Examples:
  npx ts-node function-test-runner.ts                     # Full pipeline
  npx ts-node function-test-runner.ts discover            # Only discover
  npx ts-node function-test-runner.ts --category core     # Test core functions
  npx ts-node function-test-runner.ts --verbose --headed  # Debug mode
`);
}

if (require.main === module) {
  main().catch(console.error);
}

export default FunctionTestRunner;
